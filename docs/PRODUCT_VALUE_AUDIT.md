# Todonado — Product Value, Entitlements and Packaging

**Audited:** 2026-08-17 · **Against:** `main` @ `f92e9e7` · **Method:** 146 capabilities read from
source by nine parallel auditors, then an adversarial pass that re-opened the files and refuted
four claims. Competitor figures come from each vendor's own pricing page, fetched on the day.

> **NOTHING IN THIS DOCUMENT HAS BEEN IMPLEMENTED.** No entitlement changed, no gate moved, no
> billing behaviour touched. §5 is a proposal awaiting review.

---

## 0. The one-paragraph answer

Todonado's Free tier is extremely generous and its Pro tier is thin — and they are thin and
generous in the *same place*, which is the problem. Free includes the capacity meter, the
overbooking guard, roll-over, "Plan my day", Focus with Pomodoro, unlimited tasks and projects,
recurring tasks, templates, the journal, and the whole wellness suite. Pro adds a week board, a
stats page, a calendar refresh, five small count caps and a 14-day view window. A person who plans
**a day** has no reason to pay, ever. Only a person who plans **a week** converts — and the pricing
page does not lead with that. Two of the nine Pro bullets are also weak enough to undermine the
other seven.

---

## 1. Deliverable A — the product matrix

146 capabilities were audited. Grouped by what a customer is trying to do. `FREE` means verified
reachable with no plan check; `PRO` means a verified `usePlan()` gate exists.

### Plan

| Feature | Free | Pro | Limit | Customer value |
| --- | :---: | :---: | --- | --- |
| Inbox capture (title, effort chip, due date) | ✓ | ✓ | none | Dump anything in two seconds |
| Effort estimate on a task | ✓ | ✓ | none | The input that makes capacity possible |
| Auto-effort suggestion (history, else keyword) | ✓ | ✓ | none | One tap so a task is never invisible to the meter |
| **Effort-aware capacity meter** | ✓ | ✓ | none | **The differentiator, and it is free** |
| Daily capacity setting | ✓ | ✓ | 15 min floor | Your day, your number |
| Overbooking guard + "move N to tomorrow" | ✓ | ✓ | none | Refuses to pretend 14h fits in 8 |
| "Plan my day" auto-planner (preview → confirm) | ✓ | ✓ | none | One tap fills today without going over |
| Roll-over / recovery, with undo | ✓ | ✓ | no age limit | Yesterday does not become guilt |
| Priorities, due dates, scheduling | ✓ | ✓ | none | Ordinary task hygiene |
| Recurring tasks (D/W/M/Y, every-N, end date) | ✓ | ✓ | none | Set the routine once |
| Daily briefing — greeting, streak, carried over, meetings, free minutes | ✓ | ✓ | none | The card you read before starting |
| Daily briefing — pre-computed plan, estimate nudge, priority alerts | — | ✓ | 3 alerts | See §3: this is a *render* of a free computation |
| **Week board: 7 days, per-day capacity, drag between days** | — | ✓ | none | **The strongest real Pro feature** |
| **"Plan my week"** (7-day auto-schedule, one undo) | — | ✓ | none | Distributes work without overloading a day |
| Free sample-week preview | ✓ | — | n/a | Shows the paid feature honestly, not blurred |

### Execute

| Feature | Free | Pro | Limit | Customer value |
| --- | :---: | :---: | --- | --- |
| Focus mode, task-bound, drift-resistant timer | ✓ | ✓ | none | Elapsed derived from timestamps; survives reload |
| Pause / resume, interruption logging | ✓ | ✓ | none | Count a distraction without stopping |
| Pomodoro cadence (25/5, long break every 4) | ✓ | ✓ | none | One session row per interval, so stats stay true |
| "Get to Work" one-tap start (`/work`) | ✓ | ✓ | none | Wanting to start → starting |
| 60-second breathing reset before work | ✓ | ✓ | 1 min | Optional runway into focus |
| Actual time recorded per session | ✓ | ✓ | none | The raw material for every insight |
| Sounds: master switch, volume, chime tone | ✓ | ✓ | none | Device-local, as it should be |

### Organize

| Feature | Free | Pro | Limit | Customer value |
| --- | :---: | :---: | --- | --- |
| Tasks, projects, sections, subtasks | ✓ | ✓ | **genuinely uncapped** | No `FREE_PROJECTS` constant exists |
| Drag-reorder (pointer + keyboard) | ✓ | ✓ | none | Single fractional write, never a reindex |
| Built-in template catalog: browse, preview, **apply** | ✓ | ✓ | none | Whole catalog is free, including apply |
| Checklist-style templates (apply undated) | ✓ | ✓ | none | A repeated list is not a plan |
| Personal templates / save a project as one | ✓ | ✓ | **3 on Free** | Capture your own routine |
| Realtime multi-device sync | ✓ | ✓ | none | Free, and rarely is |
| Hub, start-screen preference, onboarding | ✓ | ✓ | none | — |
| Export my data (JSON) · Delete account | ✓ | ✓ | none | Data ownership, correctly never gated |
| ❌ Task search / command palette | — | — | **does not exist** | See §3 — a gap, not a gate |

### Learn

| Feature | Free | Pro | Limit | Customer value |
| --- | :---: | :---: | --- | --- |
| **Insights: planned vs actual, capacity trend, focus trends** | — | ✓ | 7/14-day windows | The retrospective |
| **Estimation accuracy** (bias) | — | ✓ | ≥5 samples | Learn that "30 min" means 50 |
| Weekly review ("your week" vs last) | — | ✓ | ≥2 days | — |
| Points breakdown panel | — | ✓ | 7-day window | Not sold on /pricing; see §3 |
| Points score + level chip on Today | ✓ | ✓ | 7-day window | Derived, never stored |
| Completed history (projects, streak, journal) | ✓ | ✓ | **14 days on Free** | **View limit only — nothing is deleted** |
| Challenges (derived progress, share card) | ✓ | ✓ | **1 active on Free** | — |

### Connect

| Feature | Free | Pro | Limit | Customer value |
| --- | :---: | :---: | --- | --- |
| Calendar import by `.ics` **file** | ✓ | ✓ | 1 MB/file | Meetings subtract from today's room |
| **Live calendar URL sync** | — | ✓ | 10 sources, 6 refresh/min | **The only server-enforced Pro feature** |
| Meetings subtract from capacity | ✓ | ✓ | clamped 24h/day | A meeting is time you do not have |

### Reflect

| Feature | Free | Pro | Limit | Customer value |
| --- | :---: | :---: | --- | --- |
| Daily journal, text, one entry per local day | ✓ | ✓ | 8,000 chars | Two prompts and a blank space |
| Past entries read-only, searchable | ✓ | ✓ | 14-day window on Free | A record you cannot quietly revise |
| **Voice notes** | — | ✓ | 5 min, 200 MB | ⚠️ Gated in UI only — see §3 |
| Vision cards (goal + why + target date) | ✓ | ✓ | **3 on Free** | The goals behind the work |
| Mind maps (canvas + list view) | ✓ | ✓ | **1 on Free** | Before the thought is a task |

### Wellbeing

| Feature | Free | Pro | Limit | Customer value |
| --- | :---: | :---: | --- | --- |
| Breathwork pacer (Box, 4-7-8, Simple) | ✓ | ✓ | none | — |
| Generated sleep noise (white / pink / brown) | ✓ | ✓ | none | `SLEEP_NOISE_REQUIRES_PRO = false` |
| Supplement & medication log | ✓ | ✓ | none | A personal log, not medical advice |
| Quit tracker (streak from a timestamp) | ✓ | ✓ | **1 habit on Free** | Grows while the app is closed |
| ❌ Recorded ambience (rain/ocean), guided meditation | — | — | **not shipped** | Honestly labelled "coming soon" |

---

## 2. Deliverable B — current Pro value diagnosis

### CURRENT PRO VALUE SCORE: **4 / 10**

| Dimension | Score | Why |
| --- | :---: | --- |
| Functional value | 5 | One substantial feature (week board). The rest is a report and five raised numbers. |
| Frequency of paid-feature use | 3 | Week planning is weekly, not daily. Insights is the first thing people stop opening. |
| Emotional value | 3 | Nothing in Pro touches the daily ritual, which is where the attachment forms. |
| Time saved | 4 | "Plan my week" saves real minutes. Nothing else in Pro saves time. |
| Intelligence / insight | 6 | Estimation bias is genuinely good and genuinely paid. |
| Continuity / history | 5 | Real, but the *framing* is wrong (see below). |
| Integration value | 6 | Live calendar sync is the one feature with a real marginal cost. |
| Habit lock-in | 2 | Every habit-forming surface is free. Cancelling Pro costs you a report. |
| Upgrade clarity | 3 | Nine bullets, of which two are hollow. |

### WHY SOMEONE WOULD PAY TODAY

1. **They plan across a week, not a day.** `/week` + "Plan my week" is a real, substantial feature and the only one that changes how the product is used.
2. **Their meetings move.** Live calendar URL sync is the only genuinely enforced feature and the only one costing money to serve.
3. **They want to know whether their estimates are honest.** Estimation bias needs ≥5 samples and cannot be replicated by hand.
4. **They have been using it for more than two weeks** and want their own completed history back in view.

### WHY SOMEONE WOULD NOT PAY

1. **The daily loop is free and complete.** Capacity meter, overbooking guard, "Plan my day", roll-over, Focus, Pomodoro, recurring tasks. The stated differentiator is free. A daily user is *finished* on Free.
2. **Two Pro bullets are hollow and damage the other seven.**
   - *"Unlimited history: every completed task, kept forever"* implies Free loses data. **Nothing is ever deleted on any plan** — the limit is an array filter in the view layer, over rows already sitting in the Free user's browser cache.
   - *"Everything in Free, unlimited"* maps to no gate anywhere in the code. On a nine-line list, one vacuous line is one ninth of the pitch.
3. **The "smart daily briefing" is a pre-render of a free feature.** `planDay()` runs for every user; the Free user's own browser computes the picks, then the digest declines to show them and offers a teaser instead. One tap later they get the identical plan through the identical code path.
4. **Four of the five caps are 1 or 3** — small enough to hit in week one, which reads as artificial rather than generous-with-an-edge.

### BIGGEST FREE/PRO PROBLEM

**The free tier contains the entire habit, and the paid tier contains the reporting.** Habit is what people pay to keep; reports are what they cancel. The ladder is upside down: Todonado gives away the thing you would miss and charges for the thing you would not.

### ⚠️ Enforcement findings — separate from packaging, and more urgent

These are not marketing problems. They should be fixed before any repackaging, because repackaging raises the value of bypassing them.

| # | Finding | Severity |
| --- | --- | :---: |
| E1 | **Eleven of twelve Pro surfaces are enforced only in the browser bundle.** Exactly one server-side plan check exists in the whole product (`api/calendar-fetch.ts:148`). Everything else is an `if (isPro)` branch over rows the Free session already reads and writes under RLS. | HIGH |
| E2 | **Voice notes — a paid bullet — have no gate on the upload at all.** Only the recorder UI is hidden. `save()` calls `uploadJournalAudio` with no plan test; the storage policy authorises on the `<user_id>` path segment, i.e. ownership, never plan. This is the one that costs real money to serve. | HIGH |
| E3 | **Four surfaces hand the Pro layer to Free users on every cold load, by design.** The `isPro \|\| billingLoading` idiom grants the Pro branch while the billing query is in flight — including on Today, the default screen. Deliberate and documented (it prevents flicker for subscribers), but the polarity is wrong. `WeekPage` is the only surface that handles it correctly, by showing a loader. | HIGH |
| E4 | **A Free user's planning streak silently stops at 14** and nothing says so. The streak passes through the same history window, so someone who has planned every day for three months reads "14-day streak" forever. A motivational counter that quietly stops counting is worse than not having one. | MEDIUM |
| E5 | **A Free user with an existing URL calendar is told nothing.** The proxy returns 403, the client correctly converts it to `proRequired` — and Today never reads the flag. Those meetings contribute zero minutes to the capacity meter, silently, on the one screen where a wrong capacity number does the most damage. | MEDIUM |
| E6 | **`FEATURES.week = false` would delete the paid tier with no billing consequence.** Nothing links the flag to the fact that people are being charged for what it mounts. | MEDIUM |
| E7 | **Founding Pro is granted by matching an email string** on a product with autoconfirmed signup. The file says so itself and says it should be deleted. Nothing checks that a founding account has a real billing row before the list is emptied. | MEDIUM |

### Product gaps found while auditing (not gates — simply missing)

No task search and **no command palette anywhere** (the only text search is over journal entries and template titles). Subtasks are reachable **only** from project detail. A subtask **cannot be renamed** — the mutation exists but the component never destructures it. Projects have no hard delete, only archive. These are the kind of thing a user hits *before* they hit a paywall.

---

## 3. Deliverable E — competitive packaging research

Every figure below was read from the vendor's own pricing page on 2026-08-17.

| Product | Free tier | Paid | Upgrade trigger | History paywalled? |
| --- | --- | --- | --- | :---: |
| **Sunsama** | **None.** "doesn't have a free forever plan and doesn't plan to". 14-day full trial | $17/mo billed yearly · $22/mo monthly | The 14th day. No feature cliff at all | n/a |
| **Motion** | **None.** Trial only | $19/seat/mo Pro AI · $29 Business AI | Trial expiry, then an AI credit meter | No |
| **Akiflow** | **None.** 7-day trial | $19/mo yearly · $34/mo monthly | Trial expiry | No |
| **Reclaim.ai** | Lite, 1 user | $10–22/seat/mo | **"1 week scheduling range"** | No |
| **Todoist** | "Beginner": 5 projects, **1 week history**, 5 MB | $5/mo yearly · $7 monthly | **5-project cap** | **Yes** |
| **TickTick** | Limits not published | ~$36–50/yr | **Calendar** — free cannot subscribe to a 3rd-party calendar | **Yes** |
| **Trello** | 10 boards, unlimited cards, **unlimited activity log** | $5/user/mo yearly | 10-board cap; Calendar view is Premium | No |
| **Notion** | Unlimited pages solo, 5 MB upload, **7-day history** | $10/member/mo | 5 MB upload cap | **Yes**, 7→30→90 days |

### What the category actually teaches

1. **Every product built on Todonado's own thesis — daily planning against real capacity — has no free tier at all, and charges 4–7× more.** Sunsama $17–22, Motion $19–29, Akiflow $19–34. Todonado at $5 is not merely cheaper; it is in a different bracket. **The price is not the problem.**
2. **Reclaim's single strongest upgrade trigger is "1 week scheduling range" — free plans *this* week, paid plans beyond it.** That is structurally identical to Todonado already gating `/week`. The instinct is right and independently validated; it is simply not what the page leads with.
3. **Where a free tier exists, history depth is the most commonly monetised axis** (Todoist 1 week, Notion 7 days, TickTick historical stats). Todonado's 14 days is *more* generous than Todoist and Notion. It is a legitimate, category-standard lever — but only when described as a *window*, never as "kept forever", which implies deletion.
4. **The second most common is the calendar** (TickTick's headline paywall, Trello's Premium Calendar view, Todoist's calendar layout). Todonado already does this, correctly, and it is the one thing it enforces server-side.
5. **The winning triggers are structural caps hit in week one** — 5 projects, 10 boards, 5 MB. Todonado's caps are 1 and 3, which are hit even faster, but on *peripheral* surfaces (mind maps, vision cards, quit habits) rather than the core organising action. A cap only converts if it blocks something the user already loves.

---

## 4. Deliverable C — recommended packaging

**One model.** The principle: **Free = experience the system. Pro = run your life through the system.**
Free must keep a real "aha": a person must be able to plan a realistic day, focus on it, and recover
it, forever, for nothing. That is non-negotiable and it is also the honest differentiator.

What changes is the **time horizon** and the **memory**. A day is free. A week, a month, and the
record of how they went are what you pay for. This is the one axis that is (a) already validated by
Reclaim, (b) already half-built in Todonado, and (c) impossible to feel on day one but unbearable to
lose on day thirty.

| Capability | Recommended Free | Recommended Pro | Reason |
| --- | --- | --- | --- |
| **Plan** | | | |
| Capacity meter, overbooking guard, daily capacity | ✓ full | ✓ | The differentiator. Gating it would make Free pointless and the pitch dishonest. |
| "Plan my day", roll-over, recovery, undo | ✓ full | ✓ | The daily ritual. This is the aha, and habit is what makes anyone consider paying. |
| Recurring tasks | ✓ full | ✓ | Fair to gate elsewhere; here it is table stakes and Todoist gives it free. |
| **Week board + "Plan my week"** | sample week (as today) | ✓ | **Keep gated.** Reclaim's #1 trigger, validated. This becomes the headline of Pro. |
| Month / horizon view *(not built)* | — | ✓ | Natural extension of the same axis if built later. |
| **Execute** | | | |
| Focus, Pomodoro, interruptions, `/work` | ✓ full | ✓ | Daily habit. Never gate. |
| **Learn** | | | |
| Insights, estimation bias, weekly review | teaser (as today) | ✓ | Keep gated. Genuinely derived, genuinely paid elsewhere. |
| Completed history | **30 days** (from 14) | unlimited | Raise it. 14 is stingier than it needs to be and the streak bug makes it feel punitive. 30 days still creates the month-thirty moment. |
| **Planning streak** | **uncapped, always** | uncapped | **Fix E4.** Never cap a motivational counter. It costs nothing and currently reads as broken. |
| **Organize** | | | |
| Tasks, projects, sections, subtasks | ✓ uncapped | ✓ | Deliberately *not* Todoist's 5-project cap. Capping capture punishes the behaviour we want. |
| Template catalog + apply | ✓ full | ✓ | — |
| Personal templates | **5** (from 3) | unlimited | Small raise; 3 is hit before the value lands. |
| **Connect** | | | |
| `.ics` file import | ✓ | ✓ | — |
| Live calendar URL sync | — | ✓ | **Keep gated.** Real marginal cost, already server-enforced, category-standard. |
| **Reflect** | | | |
| Text journal | ✓ full | ✓ | — |
| Voice notes | — | ✓ | Keep gated, **but enforce it server-side (E2) before promoting it.** |
| Vision cards | **5** (from 3) | unlimited | — |
| Mind maps | **3** (from 1) | unlimited | A cap of 1 means the feature cannot be *used*, only sampled. That is not a ladder, it is a demo. |
| **Wellbeing** | | | |
| Breathwork, sleep noise, supplement log | ✓ full | ✓ | Never gate wellbeing. It is trust-building, cheap to serve, and gating it would read badly. |
| Quit habits | **3** (from 1) | unlimited | Same reasoning as mind maps. Also: one quit habit is not a product. |
| Challenges | **1 active** | unlimited | Fine as is. |

### Policies

- **FREE LIMITS:** 30-day history window · 5 personal templates · 5 vision cards · 3 mind maps · 3 quit habits · 1 active challenge · unlimited tasks/projects/sections/subtasks · uncapped streak.
- **PRO LIMITS:** none, other than the abuse ceilings that apply to everyone (10 calendar sources, 200 MB audio, 200 nodes/map).
- **HISTORY POLICY:** a **view window**, never deletion. Say so on the page. Upgrading reveals everything on the next render with no refetch. Never write "kept forever".
- **CALENDAR POLICY:** file import free forever; live URL sync Pro, enforced server-side. A Free user with an existing URL source must be **told** it is paused (E5), never silently given a wrong capacity number.
- **PROJECT POLICY:** never cap projects or tasks. Capture is the behaviour the product exists to encourage.
- **FOCUS POLICY:** never gate any part of focus, ever. It is the daily habit and the source of every insight.
- **INSIGHTS POLICY:** Pro. The teaser stays honest — it shows the shape, not blurred data.
- **WELLNESS POLICY:** free, with generous count caps. It is not the monetisation surface and should not be made into one.

### EXPECTED UPGRADE TRIGGERS

1. **"I want to plan next week."** The `/week` board. Validated as the strongest trigger in the category by Reclaim. Should become the headline of Pro on every surface.
2. **"My meetings moved and my plan didn't."** Live calendar sync — the only enforced feature and the only one with real marginal cost.
3. **"Am I actually getting better at estimating?"** Estimation bias at ≥5 samples: unanswerable by hand, and it arrives around week two.
4. **"Where did last month go?"** The 30-day history edge — a month in, when there is finally something worth looking back at.
5. **"I hit a cap on something I now use daily."** Templates / mind maps / quit habits at their raised limits — deliberately *last*, because a cap only converts when it interrupts something already loved.

### Implementation constraints for the future PR (Phase 21)

Not in this branch. When it happens it must include: centralised entitlement logic; **server-side
enforcement for every paid surface** (E1, E2); the `billingLoading` polarity fixed to fail *closed*
with a loader (E3, following `WeekPage`); founding/manual Pro preserved and migrated to real billing
rows before the email list is emptied (E7); no data loss (raising caps is additive — nobody loses a
mind map); **no RLS abuse** — RLS is row ownership, not a price list; and a migration only if truly
required (raising a client cap needs none).

---

## 5. What the landing page may and may not say

The Landing V3 in this branch describes **current shipping entitlements only**. Specifically it
must not claim any of §4. Three corrections it *does* make to existing live copy, all of which make
it more accurate rather than less:

| Live copy today | Problem | V3 |
| --- | --- | --- |
| "Unlimited history: every completed task, kept forever" | Implies Free deletes data. It does not. | "Your full history. Free keeps a rolling 14-day window; nothing is ever deleted." |
| "Everything in Free, unlimited" | Maps to no gate in code. | Removed. |
| Free: "Completed history for the last 14 days" | True, but does not disclose that the **streak** is windowed too (E4). | States the window applies to completed history *and* the streak. |
