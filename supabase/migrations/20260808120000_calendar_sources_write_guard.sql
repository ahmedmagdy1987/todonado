-- ============================================================================
--  Todonado — durable write-time guard for public.calendar_sources (FLAG-5)
--
--  ── WHAT FLAG-5 ACTUALLY IS ───────────────────────────────────────────────
--
--  `/api/calendar-fetch` ignores its request body and fetches only URLs that
--  come from the caller's OWN `calendar_sources` rows. The audit's point was
--  that this does not make the URL ours: the caller writes those rows. Four
--  layers already narrowed the blast radius — Pro gating, a 6/min rate limit,
--  issue #9's fan-out and byte budgets, and issue #10's connect-time address
--  pinning — but every one of them is a FETCH-time control. Nothing bounded
--  what could be STORED, and nothing bounded HOW MANY rows a user could store.
--
--  This file is the durable half, and it is the one that needed a migration:
--  the only writer is the browser, through PostgREST, as `authenticated`. There
--  is no server-side write path to put a check in — `service_role` holds SELECT
--  and nothing else on this table. A guard in the client would be advice.
--
--  ── THE THREE MECHANISMS, AND WHY EACH IS THE ONLY ONE THAT FITS ──────────
--
--  1. ROW CAP -> a BEFORE trigger holding an advisory transaction lock.
--     A CHECK constraint cannot see other rows, so it cannot count them. And
--     `select count(*)` followed by `insert` is NOT safe on its own: under READ
--     COMMITTED, two concurrent transactions both read 9, both insert, and the
--     user ends up with 11. Locking the user's existing rows `for update` is
--     the tempting fix and is WRONG at exactly the boundary that matters — a
--     user with zero rows has nothing to lock, so twenty concurrent inserts all
--     see zero and all succeed. An advisory lock keyed on the user id has no
--     such hole: it exists whether or not any row does. It is taken as
--     `pg_advisory_xact_lock`, so it is released at COMMIT or ROLLBACK by the
--     engine and cannot leak.
--
--     IT ERRS TOWARD REFUSING, AND THERE IS ONE CASE WHERE THAT IS VISIBLE. An
--     INSERT that starts before a concurrent DELETE commits waits on the lock
--     with its statement snapshot ALREADY TAKEN — an advisory wait does not
--     re-snapshot under READ COMMITTED, only a row lock does — so it can still
--     count the row being deleted and refuse. If the commit wins the race
--     instead, the insert takes a fresh snapshot and succeeds. Both outcomes are
--     safe and which one happens is pure scheduling; the cap is never exceeded
--     either way. The cost of the refusing branch is one spurious "maximum" and
--     a retry, and the sequential delete-then-insert the app actually performs
--     is unaffected. Removing the false negative would take SERIALIZABLE or a
--     per-user counter row held FOR UPDATE, both of which cost more machinery
--     than a rare, safe retry. Pinned by a test that asserts the INVARIANT
--     rather than the timing, so it is neither flaky nor "fixed" later by
--     weakening the lock.
--
--  2. URL SHAPE -> CHECK constraints over an IMMUTABLE function.
--     Declarative, so it holds for any writer that ever exists, not just the
--     ones that go through a trigger, and it is re-evaluated on UPDATE for free.
--
--  3. EXACT DUPLICATES -> a partial unique index.
--     Race-safe by construction, the same reasoning as
--     `checkout_attempts_one_open_per_user`.
--
--  ── WHAT THE URL CHECK DELIBERATELY DOES NOT DO ───────────────────────────
--
--  IT DOES NOT RESOLVE DNS, AND IT MUST NEVER LEARN HOW.
--
--  A CHECK constraint is evaluated inside the writing transaction. A DNS lookup
--  there would put a network round trip on the write path, hold row locks for
--  its duration, make the constraint non-deterministic (so a dump/restore or a
--  later `VALIDATE CONSTRAINT` could reject rows that were legal when written),
--  and hand any authenticated user a way to make the DATABASE emit outbound
--  requests — a fresh SSRF primitive introduced by the anti-SSRF fix.
--
--  So this is a STRUCTURAL filter only. It rejects what is decidable from the
--  string: the scheme, embedded credentials, a non-web port, an IP literal, and
--  a single-label host like `localhost`. A name such as
--  `metadata.google.internal` is structurally ordinary and IS accepted here —
--  it is rejected at fetch time by `resolveAllPublic` + `isPrivateIp`, which
--  see the address rather than the name.
--
--  THE FETCH-TIME GUARD REMAINS AUTHORITATIVE. Nothing here replaces it; this
--  narrows what can be parked in the table so the fetch-time guard has less to
--  refuse, and caps how many times per request it can be asked to refuse.
-- ============================================================================

-- ── 1. Structural URL policy ────────────────────────────────────────────────
--
-- IMMUTABLE and STRICT so it is legal in a CHECK; `search_path = ''` so no
-- schema in front of `public` can shadow anything it calls. Every function it
-- uses lives in `pg_catalog`, which PostgreSQL always searches implicitly.
create or replace function public.calendar_url_is_safe(raw text)
returns boolean
language plpgsql
immutable
strict
parallel safe
set search_path = ''
as $$
declare
  scheme    text;
  authority text;
  host      text;
  port      text;
begin
  -- A URL carries no literal whitespace or control characters. Anything that
  -- needs them is percent-encoded, which this leaves alone.
  if raw ~ '[[:space:][:cntrl:]]' then
    return false;
  end if;

  -- `webcal:` is an .ics over https by convention and is what Apple and Google
  -- hand you when you click "subscribe". `normalizeCalendarUrl` in
  -- api/_lib/ssrf.ts rewrites it before the fetch, so accepting it here keeps
  -- the stored value identical to what the user pasted.
  scheme := lower(substring(raw from '^([A-Za-z][A-Za-z0-9+.-]*)://'));
  if scheme is null or scheme not in ('http', 'https', 'webcal') then
    return false;
  end if;

  -- The authority is everything after "://" up to the first '/', '?' or '#'.
  authority := substring(raw from '^[A-Za-z][A-Za-z0-9+.-]*://([^/?#]*)');
  if authority is null or authority = '' then
    return false;
  end if;

  -- Embedded credentials. `https://user:pass@host/` is also the classic way to
  -- make a hostile URL LOOK like a trusted one to a human reviewer.
  if position('@' in authority) > 0 then
    return false;
  end if;

  -- A bracketed authority is an IPv6 literal. Rejected with the IPv4 case
  -- below: a calendar subscription is always a DNS name.
  if left(authority, 1) = '[' then
    return false;
  end if;

  if position(':' in authority) > 0 then
    host := split_part(authority, ':', 1);
    port := split_part(authority, ':', 2);
    -- Mirrors ALLOWED_PORTS in api/_lib/ssrf.ts.
    if port not in ('80', '443') then
      return false;
    end if;
  else
    host := authority;
  end if;

  if host = '' then
    return false;
  end if;

  -- An all-numeric dotted host is an IPv4 literal in any of its forms.
  if host ~ '^[0-9]+(\.[0-9]+)*$' then
    return false;
  end if;

  /*
   * A DOTTED DNS NAME, AND THAT REQUIREMENT IS THE POINT.
   *
   * Requiring at least one dot is what rejects `localhost`, `metadata`,
   * `router`, and every other single-label name that resolves to something
   * internal on some network somewhere. No public calendar feed is served from
   * a single-label host.
   *
   * The final label must START WITH A LETTER but may then contain digits, so
   * punycode TLDs like `xn--p1ai` are accepted while a trailing numeric label
   * (an IP literal that slipped past the test above) is not.
   */
  if host !~ '^([A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z][A-Za-z0-9-]{1,62}$' then
    return false;
  end if;

  return true;
end
$$;

comment on function public.calendar_url_is_safe(text) is
  'Structural (never DNS) validation of a calendar subscription URL. FLAG-5. '
  'Fetch-time SSRF validation in api/_lib/ssrf.ts remains authoritative.';

/*
 * PUBLIC's implicit EXECUTE is replaced with an explicit grant rather than
 * simply revoked. A CHECK constraint is evaluated as the WRITING role, so
 * revoking without granting would make every insert fail with 42501 — the same
 * class of mistake that left `billing` unreadable by service_role. `anon` is
 * absent deliberately: it holds no privilege on this table at all.
 */
revoke all on function public.calendar_url_is_safe(text) from public;
grant execute on function public.calendar_url_is_safe(text) to authenticated, service_role;

-- ── 2. Shape + URL constraints ──────────────────────────────────────────────
--
-- In a do-block so the file is re-runnable, matching the repo's convention.
do $$
begin
  /*
   * SHAPE. Until now `kind = 'url'` did not actually require a url: a row could
   * claim to be a subscription and carry nothing, or carry BOTH a url and a
   * megabyte of ics_text. The proxy would skip the first silently and the
   * second would be a stored blob nobody reads.
   */
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.calendar_sources'::regclass
       and conname  = 'calendar_sources_shape'
  ) then
    alter table public.calendar_sources
      add constraint calendar_sources_shape check (
        (kind = 'url'  and url is not null and ics_text is null) or
        (kind = 'file' and ics_text is not null and url is null)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.calendar_sources'::regclass
       and conname  = 'calendar_sources_url_safe'
  ) then
    alter table public.calendar_sources
      add constraint calendar_sources_url_safe check (
        url is null or public.calendar_url_is_safe(url)
      );
  end if;
end
$$;

-- ── 3. Exact duplicates ─────────────────────────────────────────────────────
--
-- Two identical subscriptions are two outbound requests per refresh for one
-- calendar, and one confusing duplicate row in the settings list. Near
-- duplicates (differing only by fragment or a redundant default port) are NOT
-- caught here and are deduplicated at fetch time by `calendarUrlKey`; that
-- split is deliberate, because normalising harder in the database would mean
-- storing a second derived column and keeping it correct forever.
create unique index if not exists calendar_sources_user_url_uniq
  on public.calendar_sources (user_id, url)
  where kind = 'url' and url is not null;

-- ── 4. Durable per-user row cap ─────────────────────────────────────────────
--
-- TEN, and the number is not free-hand: it is `MAX_SOURCES_PER_REQUEST` from
-- api/_lib/calendarLimits.ts, the issue #9 limit on how many sources a single
-- fetch will ever process. Aligning them means an honest user can never own
-- more sources than one refresh actually reads, so the "and N more were not
-- fetched" branch stops being reachable by accident and stays what it was meant
-- to be: a report that something is wrong. A HIGHER database cap would let a
-- user silently keep calendars that never refresh; a LOWER one would make the
-- request limit dead code. `calendarCaps.test.ts` pins the two together.
--
-- The cap counts rows of BOTH kinds. A 'file' row makes no outbound request,
-- but it stores up to a megabyte of ics_text, so leaving files uncapped would
-- close the fan-out hole and leave a storage one.
create or replace function public.calendar_sources_enforce_cap()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- Keep in step with MAX_SOURCES_PER_REQUEST (api/_lib/calendarLimits.ts)
  -- and MAX_CALENDAR_SOURCES_PER_USER (src/lib/config.ts).
  cap integer := 10;
  n   integer;
begin
  -- An UPDATE that does not move the row to another owner cannot change any
  -- user's count. (No role currently holds UPDATE on this table; the branch is
  -- here so that granting it later does not quietly open a hole.)
  if tg_op = 'UPDATE' and new.user_id = old.user_id then
    return new;
  end if;

  /*
   * THE WHOLE RACE FIX IS THIS LINE.
   *
   * Serialises every concurrent insert for ONE user and nothing else. A second
   * transaction blocks here until the first commits, and only then counts — so
   * it sees the row the first one added. Two ints: a fixed namespace derived
   * from a descriptive string, and the user. A hash collision between two users
   * costs them a moment of shared serialisation and nothing else.
   */
  perform pg_advisory_xact_lock(
    hashtext('todonado.calendar_sources.per_user_cap'),
    hashtext(new.user_id::text)
  );

  select count(*) into n
    from public.calendar_sources
   where user_id = new.user_id;

  if n >= cap then
    raise exception
      'calendar_sources_cap: % calendar sources is the maximum per user', cap
      using errcode = 'check_violation',
            hint    = 'Remove a calendar source before adding another.';
  end if;

  return new;
end
$$;

comment on function public.calendar_sources_enforce_cap() is
  'Race-safe per-user row cap for calendar_sources (FLAG-5). Advisory xact lock '
  'keyed on user_id, because count-then-insert is not safe under concurrency.';

/*
 * NOT SECURITY DEFINER, DELIBERATELY.
 *
 * It runs as the inserting role, which is exactly what makes it correct: under
 * RLS `authenticated` sees only its own rows, and the row being inserted is
 * already forced to `user_id = auth.uid()` by calendar_sources_insert_own — so
 * "count this user's rows" and "count the rows I can see for this user" are the
 * same set. SECURITY DEFINER would buy nothing and would add a search_path
 * escalation surface to a function every signed-in user can trigger.
 *
 * The EXECUTE revoke is belt-and-braces: a trigger function's permission is
 * checked when the trigger is CREATED, not when it fires, so removing PUBLIC's
 * ability to call it directly costs nothing.
 */
revoke all on function public.calendar_sources_enforce_cap() from public;

drop trigger if exists calendar_sources_cap on public.calendar_sources;
create trigger calendar_sources_cap
  before insert or update of user_id on public.calendar_sources
  for each row execute function public.calendar_sources_enforce_cap();
