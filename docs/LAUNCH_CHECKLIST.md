# Todonado — Launch Checklist

**Last rewritten: 2026-07-31**, at the end of the final pre-launch pass (Week layout, app-wide
design sweep, logic audit, security audit, content truth pass).

This supersedes the 2026-07-06 version, which was three weeks and roughly a dozen features behind —
its first section told you to apply a migration that had been live for weeks, and it still described
Insights as a placeholder. Everything below is either **verified**, with the evidence named, or an
**owner action**, meaning no amount of code can close it.

> **The rule this file enforces:** the bar is not "the code is merged", it is "a stranger who signs
> up right now can use it, and nothing they read is untrue".

---

## 0. THE SHORT VERSION

**Can you launch today?** Yes, as a **free** product. Nothing in the app is broken, dishonest, or
embarrassing as it stands.

**Can you charge today?** No — and not because of code. Stripe live keys are unset, and the Terms of
Use contain no payment, cancellation, or refund section at all. Both are owner actions (§3).

**Do this first:** confirm `support@todonado.com` actually receives mail (§3.1). It is printed on
the Privacy Policy, the Terms, and the legal footer as the way to reach a human — and it is the one
claim in the app that no test can check.

**Nothing to deploy to the database.** The cloud DB is fully migrated through
`20260731140000_journal_entries`; this session added no migration. Do **not** run `supabase db push`.

---

## 1. VERIFIED DONE

### This session (2026-07-31) — five stages

| Stage | Commit | What it closed |
| --- | --- | --- |
| 1 — Week board layout | `e6c967c` | Seven equal columns using the real screen width; route-scoped wide container so Today/Settings keep reading widths |
| 2 — App-wide design sweep | `3ff5ab3` | Mobile ergonomics measured rather than guessed: 38/66 → 58/66 clean at 390px; the 12-item sidebar grouped into four labelled sections |
| 3 — Logic & correctness audit | `3806bb8` | A fully-booked day was being planned as empty; both recurring bug classes found in five more places *each* and fixed uniformly |
| 4 — Security audit | `4fdad34` | A header that would have killed voice notes in production only; full report in `docs/AUDIT_2026-07-31_final.md` |
| 5 — Content truth pass | *this commit* | The data export was missing 14 tables; the Privacy Policy never mentioned voice recordings |

### Security posture — verified against the LIVE cloud

Full detail, severities and evidence: **`docs/AUDIT_2026-07-31_final.md`**. Summary:

- **RLS enforced on every table**, including the three newest. Anon read returns `[]`, anon write
  returns `42501`, and user B cannot read, update, delete, or insert-as user A — proven with an
  **unfiltered `select *`**, which is what shows isolation lives in the database rather than in a
  client-side `.eq()`.
- **Storage is private and the key shape is the authorisation.** Objects are never public, signed
  URLs expire, an anonymous fetch fails, and a second signed-in user can neither read, list, nor
  write another user's folder. A `..` in a key was tested against the live bucket: it lands in the
  uploader's own namespace, not an escape.
- **Size and MIME caps are enforced SERVER-side**, on the bucket itself, so they hold against a
  client that ignores them. Stated explicitly because client-only caps would be worth flagging.
- **The client bundle carries the public anon key and nothing else** — crawled across all chunks.
  No service-role key, no Stripe secret.
- **Every `/api` endpoint** verifies the caller's JWT, gates Pro server-side, and collapses every
  SSRF rejection to `invalid_source`. The service worker never caches `/api` or auth.
- **Auth copy is enumeration-safe.**

### Gates

`typecheck` · `lint` · **1106 unit tests** · `build` · **64 Playwright E2E** — green. Every push to
`main` re-runs all of it in GitHub Actions against the real cloud Supabase, so a green push is
validated even when this machine's local gates are skipped.

---

## 2. CODE ITEMS STILL OPEN

None block a launch. Carried deliberately:

| Item | Why it is not a blocker |
| --- | --- |
| CSP is `report-only` | It detects rather than prevents. Flip it to enforcing after watching real traffic for a few days — flipping it blind is how you break your own site. |
| Checkout does not check for an existing subscription | Only reachable once Stripe is live, and Stripe's dashboard surfaces duplicates. Worth closing before the first paid week. |
| `react-router` open-redirect advisories | Not reachable: the only redirect source is router in-memory state. Hardened by construction anyway in `src/features/auth/safeRedirect.ts`. Reported, deliberately not blind-upgraded. |
| No component tests | Vitest runs in the node environment; there is no jsdom. Pure logic is tested heavily and the browser is covered by Playwright. A real gap, not a launch blocker. |

---

## 3. OWNER ACTIONS — only you can do these

### 3.1 Confirm `support@todonado.com` receives mail — **DO THIS FIRST**

**Status: UNVERIFIED.**

It is the single contact address in the app (`LEGAL_CONTACT` in `src/lib/config.ts` — one source of
truth, printed on the Privacy Policy, the Terms, and the legal footer). Nothing in the codebase can
prove a mailbox exists behind it.

Send a message from an outside account and confirm it arrives. If it does not, create the mailbox or
change the constant. Do not launch with a contact address that silently drops mail — it is also the
address the Privacy Policy gives for data requests.

> Near-miss worth knowing: `founder@todonado.app` appears in the repo on a **different TLD**. It is
> only a test fixture and is not user-facing — do not adopt it by accident.

### 3.2 Legal review before charging — **BLOCKS BILLING, NOT LAUNCH**

The Privacy Policy and Terms were rewritten this session to describe what the app actually does:
voice recordings in cloud storage, the journal, the health-adjacent trackers, and the self-service
export and deletion that already exist. They are now accurate. They have **not** been reviewed by a
lawyer.

**The Terms contain no payment, subscription, cancellation, or refund section at all.** Fine while
the product is free; unacceptable the moment you charge. This was left for a lawyer rather than
drafted here — refund terms are not something to improvise.

Worth a professional eye given what the app now stores:
- Voice recordings are personal data and in some jurisdictions treated more strictly than text.
- The quit tracker's presets can name health or sexual-behaviour categories.
- The supplement/medication tracker holds health-adjacent free text.

A "not medical advice" clause was added to the Terms this session, and the in-app disclaimer already
existed. Confirm both are worded the way your jurisdiction expects.

### 3.3 Stripe live keys — **BLOCKS BILLING**

`STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are unset, so billing is functionally off. `usePlan`
degrades gracefully and My Plan falls back to the fake-door, so nothing is broken — the paid tier
simply cannot be bought. Runbook: **`docs/BILLING_SETUP.md`**.

Do not switch this on before §3.2.

### 3.4 Supabase free-tier pausing — **THE QUIET LAUNCH KILLER**

A free Supabase project **pauses after about a week of inactivity**, and a paused project is
`NXDOMAIN`. The app does not degrade — it cannot reach its backend at all, and every visitor sees a
dead site.

This is the failure most likely to embarrass a launch, precisely because it arrives during a *quiet*
week rather than a busy one. Move the project to a paid plan before announcing, or accept that a
quiet week takes the product offline. If the domain ever stops resolving, check this before
debugging anything else.

### 3.5 Transactional email (Resend / SMTP)

Supabase's built-in mailer has a low rate limit and is not intended for production. Password reset
and magic-link sign-in both depend on mail arriving. Configure a real SMTP provider in the Supabase
dashboard before you have enough users to hit the cap.

**Mailer autoconfirm must stay ON** — the E2E suite depends on signup returning a session with no
email step. Turning it off turns CI red.

### 3.6 Licensed audio — honestly gated, not broken

All 8 sleep and meditation tracks ship with an empty `src` and show an honest "Audio coming soon"
state. **No copyrighted audio is bundled and none is claimed.** Drop licensed or CC0 files into
`public/audio/` and fill in `src` in `src/features/wellness/audio/tracks.ts` — see
`public/audio/README.md`. Nothing else changes.

The landing page's fake-door for these two concepts matches: it says the player is built and the
audio is not licensed.

### 3.7 AI provider — not wired, and the app says so everywhere

The journal's review layer and an AI coach are the only AI features named anywhere, and both are
listed as unbuilt on `/pricing` **with their real reason**. The journal page states it next to the
thing it is missing from. There is no placeholder summary and no invented insight.

If you wire a provider later, note that `CLAUDE.md §5` currently lists AI features as out of scope —
a scope decision to make deliberately, not to drift into.

### 3.8 Deploy config to confirm once, during the §4 smoke test

- `vercel.json` headers are live — in particular `Permissions-Policy: microphone=(self)`.
  **Confirm a voice note records on the real domain.** The previous value denied the microphone to
  our own origin and would have failed *only* in production, silently, on every browser.
- HTTPS is enforced and the PWA installs.
- The custom domain resolves, and the `www` / apex choice matches what the marketing copy says.

---

## 4. LAUNCH SMOKE SCRIPT — run on `www.todonado.com` as a genuinely fresh user

Use a private window and an email you have never used here. **Do not use an account on the
founding-user list**, or you will test Pro while believing you are testing Free.

**Sign up and land**
1. Open `www.todonado.com` — the landing renders, the aurora animates, nothing overflows sideways.
2. Sign up. You should land in onboarding with **no email confirmation step**.
3. Complete onboarding: set a capacity, capture a task, plan today. Today shows a live capacity meter.

**The core promise**
4. Add tasks with efforts totalling **more than** your daily capacity. The meter must warn and
   "Plan my day" must **refuse to overcommit** — this is the product's whole thesis.
5. Complete one task, leave one. Return the next day and confirm the unfinished task offers to roll
   over, with an undo.

**Breadth — every category the landing claims**
6. `/work` → picks something sensible → hands off to Focus.
7. `/focus` → start a pomodoro, reload mid-interval, confirm the timer is still correct.
8. `/wellness/breathe` → a round runs. `/wellness/quit` → create a habit, check in, log a slip.
9. `/journal` → write an entry, then **record a voice note and play it back**. This is the
   `Permissions-Policy` check that can only fail in production.
10. `/vision` and `/vision/maps` → create a card and a map; reload and confirm the map persisted.
11. `/challenges` → join one and confirm the progress bar matches real work.

**Free limits behave at the boundary**
12. Hit each Free cap (1 mind map, 1 quit habit, 1 active challenge, 3 vision cards, 3 personal
    templates). Each must gate **creation only** — everything already created keeps working.
13. `/week` and `/insights` show an honest upsell, not a broken page.

**Layout**
14. Repeat steps 4–11 at **390px**. Nothing scrolls sideways, the week board is a snap carousel, and
    every tap target is comfortable.

**Data promises — the ones this session fixed**
15. Settings → **Export my data**. Open the JSON and confirm your journal entry, quit habit, vision
    card, mind map and challenge are all present, and that `incomplete` is absent.
16. Settings → **Delete my account**. Confirm you are signed out and the account is gone.

**Legal**
17. `/privacy` and `/terms` render, are dated **July 31, 2026**, and name `support@todonado.com`.
18. Email that address from outside and confirm it arrives (§3.1).

### The three numbers to watch once real users arrive

1. **Onboarding completion** — did they finish and land on a planned day, or bounce at capacity?
2. **Day-2 return** — a daily command center not opened on day 2 has not landed.
3. **Capacity meter engagement** — is anyone setting efforts? If not, the differentiator is not
   reaching people, whatever the signup numbers say.

---

## 5. WOULD ANYTHING HERE EMBARRASS A PUBLIC LAUNCH?

**Nothing in the app itself.** The copy is honest, the caps are real, the security holds, and the one
production-only defect was found and fixed before anyone met it.

Three things could still bite, in order:

1. **A support address that goes nowhere** (§3.1) — it is printed as the way to make a data request.
   Unverified.
2. **The Supabase project pausing during a quiet week** (§3.4) — a total outage that arrives without
   warning and looks like the product died.
3. **Charging on Terms that say nothing about payment** (§3.2, §3.3) — fine today because the product
   is free; not fine the moment checkout opens.

None of the three is a code change.
