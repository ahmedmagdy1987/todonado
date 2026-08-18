# Entitlements — what each tier gets, and what actually enforces it

**One table decides everything:** `src/features/billing/entitlements.ts`. It is a dependency-free
leaf module, so the browser and the serverless functions import the *same* table rather than two
copies of it. `src/features/billing/entitlementContract.test.ts` asserts every cell.

> **Nothing here is a Stripe change.** Pricing is unchanged: $5/month, $48/year, $4/month billed
> annually, 20% saving. This changes what the tiers *contain*, not what they cost.

---

## 1. The contract

**FREE = experience the system.** Plan a realistic day, focus on it, recover it, forever, for
nothing. Capture is never capped — there is no limit on tasks, projects, sections or subtasks, and
`entitlementContract.test.ts` fails if one is ever added. Capping capture punishes the exact
behaviour the product exists to encourage.

**PRO = run your life through the system.** A second time horizon, a memory, an intelligence layer,
an integration, and depth on the supporting tools.

### Features

| Capability | Free | Pro | Enforcement |
| --- | :---: | :---: | --- |
| Week board (7 days, per-day capacity, drag between days) | sample | ✓ | client |
| "Plan my week" | — | ✓ | client |
| Insights dashboard | — | ✓ | client |
| Estimate accuracy (also the Today nudge) | — | ✓ | client |
| Weekly review | — | ✓ | client |
| Points breakdown panel | — | ✓ | client |
| Unlimited completed history | — | ✓ | client (view layer) |
| **Live calendar URL sync** | — | ✓ | **client + SERVER** |
| Voice notes (recording a new one) | — | ✓ | client (UI + write path) |
| Briefing arrives already planned | — | ✓ | client |

### Limits

| Limit | Free | Pro | Was | Enforcement |
| --- | :---: | :---: | :---: | --- |
| History window (days) | **30** | unlimited | 14 | client (view layer) |
| Personal templates | **5** | unlimited | 3 | client |
| Vision goals | **5** | unlimited | 3 | client |
| Mind maps | **3** | unlimited | 1 | client |
| Quit habits | **3** | unlimited | 1 | client |
| Active challenges | 1 | unlimited | 1 | client |
| Calendar sources | 10 | 10 | 10 | **database trigger** |

**Every Free number went up; none came down.** That is what makes this safe to deploy with no
migration, no backfill and no announcement: no existing account can become newly over-limit, so
nobody loses access to anything they made. A test fails if a future change tries to lower one.

`calendarSources` is deliberately identical on both tiers. It is an **abuse ceiling**, not a price
lever, and the two must never be confused — the entitlement layer is allowed to be generous and the
security layer is not.

### Explicitly free, and staying free

The capacity meter, the overbooking guard, "Plan my day", roll-over with undo, recurring tasks,
Focus, Pomodoro, interruptions, `/work`, real-time recording, the template catalog including apply,
the text journal, `.ics` file import, realtime sync, breathwork, sleep noise, the supplement log,
the points chip, share cards, **and the planning streak**.

**Two things moved *out* of Pro in this change**, because neither could be defended:

- **Priority alerts** in the daily briefing. An alert is "this high-priority task is overdue",
  derived in the browser from tasks the user already holds. Every list app does it, and withholding
  it made the paid tier look mean rather than valuable.

The points breakdown was the third candidate and **stays Pro**. It looked like dead code inside an
already-paywalled page; it is not. The panel is a *sibling* of the Free/Pro branch rather than inside
its Pro arm, so removing the check would render it above the Free teaser. It is a genuine part of the
Insights retrospective, and because it is deliberately not sold on `/pricing` it is a quiet extra for
subscribers rather than a bullet that has to carry weight. It is now gated on a named capability
(`insights.pointsBreakdown`) instead of a bare `isPro`.

---

## 2. ⚠️ What actually enforces this — read before trusting the table

**Exactly one paid capability is enforced server-side: live calendar sync**
(`api/calendar-fetch.ts` → `checkFeature(entitlement, 'calendar.liveSync')`). It is also the only
one with a real marginal cost, so this is the right one to have.

Everything else is enforced in the browser. That is not laziness, and it is worth being precise
about *why*, because "add server checks" is not a coherent instruction for most of this list:

| Capability | Is there anything to enforce? |
| --- | --- |
| Week board, "Plan my week" | **No.** The board writes `tasks.scheduled_for` — the *same* mutation a Free user legitimately performs on Today. There is no distinct "week write" to gate; a Free user can already schedule a task to any date from the task dialog. The board is a **UI capability**. |
| Insights, estimate accuracy, weekly review | **No.** Pure computation over tasks and focus sessions the user's own session already fetched. Nothing is withheld by not sending it, because it was never sent. |
| History window | **No.** A filter over rows already in the browser cache. Nothing is deleted on any tier. |
| Count caps (templates, vision, maps, quit, challenges) | **Yes, and it is not done.** These are direct browser→PostgREST inserts. |
| Voice notes | **Yes, and it is partly done.** See below. |

### Voice notes — what changed and what did not

**Before:** gated by one render branch. `save()` called `uploadJournalAudio` with no plan test at
all, and the branch was fed `isPro || billingLoading`, so the recorder was live for *everyone* on
every cold load.

**After:**
1. The gate is three-state, so it is never open while the plan is unknown.
2. **The write path itself now refuses**, not just the button. `save()` will not upload for an
   unresolved or unentitled plan — a disabled button is not a control.
3. **The written entry still saves regardless.** Losing someone's journal text because their
   billing row was slow would be a far worse bug than the one being fixed.
4. **The recording is kept in memory**, not discarded, so upgrading and saving again keeps it.

**Existing Free-user recordings are untouched and remain fully usable.** `VoiceNote` used to
short-circuit on `!isPro` *before rendering anything*, which put the player and the delete button
inside the paid branch — so anyone who recorded a note under the old ungated upload lost access to
it the moment their plan resolved. Playback and deletion are now outside every gate. **Only
creating a new recording asks about entitlement.**

**What is still open:** a client can talk to Storage and PostgREST directly with its own session.
The storage policy authorises on the `<user_id>` path segment — ownership, never plan.

> **UPDATE, 2026-08-18 — the server half now exists; the client is not rewired.**
>
> `api/journal-audio-upload-url.ts` verifies the JWT, resolves entitlement from the database and
> mints a short-lived signed upload URL. **The server chooses the object path** from the id in the
> verified JWT, so a token cannot be aimed at another user's folder however the request is shaped.
> 16 direct-bypass tests cover it: Free denied, no-billing-row denied, unverified founding address
> denied, unresolved entitlement 503 (never 403, never a token), Pro allowed, founding allowed,
> path never caller-chosen, never `upsert`.
>
> **`uploadJournalAudio` still uploads directly, on purpose.** Rewiring it now would break
> `journal-audio.spec.ts` twice over: the E2E job exports no `SUPABASE_SERVICE_ROLE_KEY` (only the
> `supabase` job does), so the endpoint would answer `503 not_configured`; and the suite grants Pro
> with the `todonado.plan` localStorage override, which the server ignores by design. Shipping the
> rewire alone would also enforce nothing, because the direct path stays open until the storage
> policy narrows — which is a migration.
>
> The client rewire and `docs/proposals/20260818130000_journal_audio_pro_only.sql` must ship
> **together**, after review and a real DB test. Until then this endpoint is the *sanctioned* path,
> not the *only* one, and the table above still says "client" for voice notes.

### 🛑 STOP: closing the remaining gap needs a decision, and one of two costs

Neither option is taken in this PR. **Migrations in this PR: 0.**

**Option A — move the writes behind serverless proxies.** No schema change. Six write paths
(five inserts plus the audio upload) would go through `api/*` handlers that resolve entitlement
server-side.
*Cost:* rewrites the optimistic-update path for five features, puts a `SUPABASE_SERVICE_ROLE_KEY`
dependency in front of core flows that currently work without one, adds a round trip to every
create, and breaks the offline/optimistic behaviour these surfaces rely on. Large, and it degrades
working features to close a hole nobody is currently exploiting.

**Option B — enforce at the database layer.** Small SQL, but it needs review.
*Cost:* a migration. It would be a `BEFORE INSERT` trigger consulting `billing`, **not** an RLS
policy — RLS is row ownership and must not become a price list.
*Data impact:* none if written as `count >= limit AND plan = 'free'` on **insert only**; existing
rows are never examined, so grandfathering is preserved.
*Rollback:* `drop trigger`, single statement, no data touched.

**Recommendation:** Option B for the count caps, as one small reviewed migration, *after* this PR is
merged. Option A is not worth its cost for limits whose worst-case abuse is a sixth mind map.

> **UPDATE, 2026-08-18 — Option B was reviewed in detail and is DESIGNED BUT NOT APPLIED.**
> `docs/proposals/SERVER_ENFORCEMENT_OPTION_B.md` carries the full review and the SQL. Three
> findings sharpen the sentence above, and two of them contradict it:
>
> - **It covers FOUR of the five count caps, not five.** `activeChallenges` counts challenges whose
>   *derived phase* is active, which needs the per-challenge `durationDays` from the TypeScript
>   catalog, a progress computation over four other tables, and the user's local calendar day. The
>   database has none of the three, and a trigger counting `status = 'active'` would be *stricter*
>   than the UI. It stays client-side.
> - **It does NOT cover the storage policy.** The audio object is uploaded *before* the row is
>   written, so a trigger on `journal_entries` would reject the row and leave an orphaned
>   unauthorised object. Voice notes need a narrow server-mediated signed upload instead, which is
>   designed and not built.
> - **It cannot be applied until `billing` is authoritative.** The table is EMPTY in production
>   (16 users, 0 rows, verified read-only), and the only thing making anyone Pro is a TypeScript
>   email allowlist the database cannot see. Applying the trigger first would cap the owner's own
>   founding account.

Until then: the table above is honest about which column says "client", and no marketing surface
claims otherwise.

---

## 3. The three-state rule

Entitlement has **three** states — `resolving`, `allowed`, `locked` — and collapsing the first into
either of the others is the specific mistake this architecture exists to prevent:

- collapse into **allowed** → a Free user gets the paid layer on every cold load. **Four surfaces
  did exactly this**, including Today, the app's default screen.
- collapse into **locked** → a paying subscriber is told to upgrade. On the capped surfaces that
  *wrote an `upgrade_intents` row*, and that table has no delete policy by design.

`featureAccess()` and `limitDecision()` are the only sanctioned way to ask, and neither returns a
verdict until the plan is actually known.

### Founding / manual Pro

Unchanged, and deliberately so. `resolveEffectivePlan` precedence is: a Pro billing row → a
**verified** founding email → the dev-only localStorage override → Free. The server never honours
the override, and requires `email_verified` from the JWT before granting founding access; the client
defaults it to true because the client gate is only an affordance.

A founding account resolves **without any query**, so `useEntitlements` reports it as `resolved`
immediately rather than making the owner's own account wait behind a loader on every page. The
reverse is the load-bearing half: a user *not* already known to be Pro stays `resolving` until the
billing query settles, so nothing paid leaks while the answer is outstanding.

**Migrating founding accounts to real billing rows is designed but NOT executed here** — see
`planCore.ts`, which carries the one-line SQL and the reason. Emptying the array before those rows
exist would silently downgrade them.

### The one surface that deliberately fails open, and why

`useHistoryWindow` does not withhold while resolving. The window is a **filter over data the session
already holds** — `useTasks` fetches every row on both plans because Today, capacity, roll-over and
auto-plan all need open tasks of any age. There is no request to withhold and nothing is fetched
because of the plan. Failing closed would make a subscriber watch their history blink out and come
back on every load, to protect a Free user from briefly seeing *their own* old tasks.

Everything that is *not* just a filter still waits: `resolving` is exported, and the cutoff card,
the locked-history notice and the upgrade copy all hold until the plan is known.

---

## 4. Upgrade UX

One component (`ProUpgradeNotice`), one copy registry (`upgradeCopy.ts`), one CTA string, one route.

Before this there were five bespoke limit cards, two full-page teasers and two inline paragraphs,
using "Upgrade" ×14, "Unlock" ×3, "Upgrade to Pro" ×2 and "See the plans" ×1. Four of the five cards
explained that existing items keep working; one did not, which is the single most important sentence
on a card like that.

Rules, enforced by the registry's shape:

1. **Describe the capability, never the plan.** "Plan your whole week" beats "Get Pro".
2. **No urgency, no scarcity, no countdowns.** None of it would be true, and a planner that
   pressures you is a contradiction in terms.
3. **Never imply anything is lost.** Nothing ever is, on any plan.
4. **A card is a note in the flow, never a modal.**
5. **It only renders on a decided verdict** — never while resolving, because the click writes an
   undeletable intent row.

The arithmetic is honest for a **grandfathered** account too: someone holding ten mind maps against
a limit of three reads *"You have 10, which is more than the 3 a free plan makes. Every one of them
is still here."* — not "you are using all 3", which would read as though seven had gone missing.

---

## 5. Changing a tier

1. Edit `ENTITLEMENTS` in `src/features/billing/entitlements.ts`.
2. Update the longhand expectation in `entitlementContract.test.ts` in the **same commit**. The
   test does not derive its expectation from the table, on purpose — a test that computes its
   expectation from the thing under test asserts nothing. The diff is the review.
3. If a Free limit goes **down**, the safety test fails. That is intended: it needs a plan for the
   people already above the new line, not a constant edit.
4. Add copy to `upgradeCopy.ts` for any new key — the registry is exhaustive by type.
5. `src/features/marketing/plans.ts` templates its numbers from the constants, so the public page
   follows automatically. Prose bullets do not; check them.
