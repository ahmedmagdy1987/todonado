# Homepage V2 — external claim register

**Written:** 2026-08-16 · **Branch:** `feat/homepage-v2-premium-storytelling`

Every claim on the public homepage that depends on something OUTSIDE this repository — an
attributed quotation, a research finding, a statement about another product — is recorded here with
its source and its verdict.

> **THE RULE.** A claim ships only with a PRIMARY source, exact wording, and verified attribution.
> Quote-aggregator sites (Goodreads, BrainyQuote, AZQuotes, quote listicles) are evidence of
> nothing. Every rejected item below was rejected because it failed that rule, and most of them
> would have passed a casual check.
>
> Two of the four quotations that were investigated turned out to be wrong as commonly circulated,
> and the single research claim the first draft of this page shipped with was **refuted outright**.
> That is the reason this file exists rather than a note in a PR description.

---

## 1. Attributed quotations

### 1.1 SHIPPED — James Clear

| | |
| --- | --- |
| **Claim** | Quotation, rendered verbatim on the landing page |
| **Public wording** | "You do not rise to the level of your goals. You fall to the level of your systems." |
| **Attribution shown** | James Clear, *Atomic Habits* (2018), chapter 1 |
| **Source type** | Primary — the published book, via publisher-digitized full text |
| **Exact support** | Two hits in the same chapter: the running prose (p. 27) and the final bullet of the Chapter 1 summary (p. 28). Wording matches character for character. Corroborated on the author's own site, `jamesclear.com/quote/atomic-habits`, whose per-quote metadata sources it to the book |
| **Confidence** | **HIGH** — confirmed, then independently re-confirmed by an adversarial pass |
| **Where** | `src/features/marketing/components/GoalsSystems.tsx` |

**Page numbers are deliberately not shown.** Pagination varies by edition; the chapter attribution
is stable. A citation that is wrong in paperback is worse than one that is less precise.

### 1.2 SHIPPED — Stephen R. Covey

| | |
| --- | --- |
| **Public wording** | "The key is not to prioritize what's on your schedule, but to schedule your priorities." |
| **Attribution shown** | Stephen R. Covey, *The 7 Habits of Highly Effective People*, Habit 3 |
| **Source type** | Primary — the published book, via publisher-digitized full text |
| **Exact support** | p. 161, Habit 3, in the Quadrant II tool discussion: "...organize crises and busywork. The key is not to prioritize what's on your schedule, but to schedule your priorities. And this can best be done in the context of the week." Confirmed identical in the 30th Anniversary Edition (2020), and reprinted with an explicit *7 Habits* citation in two other Covey volumes |
| **Confidence** | **HIGH** |
| **Where** | `src/features/marketing/LandingPage.tsx`, immediately above the week board |

**Two things worth recording.** First, the sentence Covey writes *next* is "And this can best be
done in the context of the week", which is why this quotation sits above the week feature and
nowhere else. Second, a widely circulated variant drops "what's on" — that version is from *First
Things First*, a different book. The wording above was **not** trimmed to match the more popular
rendering. FranklinCovey's own Habit 3 page does not contain the sentence at all and cannot be
cited for it.

### 1.3 REJECTED — Alex Hormozi

**The wording the owner recalled is not his, and this is the single most useful finding in this
file.**

| | |
| --- | --- |
| **Recalled wording** | "Give the world undeniable / irrefutable proof that you are who you say you are." |
| **Verdict** | **NOT PUBLISHABLE as recalled.** Traced to **Brandon Flowers** of The Killers, on stage at The O2 Arena, London, July 2024, corroborated by a professional press review as well as audience posts. Publishing it under Hormozi's name would be a straight misattribution |
| **What Hormozi did say** | "You don't become confident by shouting affirmations in the mirror, but by having a stack of undeniable proof that you are who you say you are." Posted to his verified X account, 29 October 2022, retrieved verbatim from Twitter's own syndication endpoint. An expanded version appears twice on his verified LinkedIn |
| **Confidence in the real wording** | **HIGH** for the wording and attribution; the medium is a social post, not a book |
| **Decision** | Not used, on editorial grounds as well as sourcing. The page already carries two book quotations, and a third borrowed voice would dilute all of them. **The idea is kept in Todonado's own words** in the identity section: "Not because you decided to be. Because there is a record of it, and the record is made of days you already lived." |

> **This is an owner decision, not a closed one.** The real Hormozi line is verified and available.
> If it is wanted on the page it can be added as-is, cited to his verified X post of 29 October
> 2022. What must never ship is the remembered phrasing under his name.

### 1.4 REJECTED — Aristotle

| | |
| --- | --- |
| **Candidate** | "We are what we repeatedly do. Excellence, then, is not an act, but a habit." |
| **Verdict** | **FALSE ATTRIBUTION. Not used in any form.** |
| **Why** | The sentence is **Will Durant's** own connective prose in *The Story of Philosophy* (1926), ch. II, §VII. Decisive internal evidence: within Durant's own sentence, the material that IS Aristotle sits in quotation marks and carries a footnote; this sentence carries neither. A full-text search of the D. P. Chase translation Durant was quoting returns **zero** occurrences of "repeatedly do", "not an act" or "excellence, then". Snopes rates it "Incorrect Attribution" |
| **Bonus** | The popular rendering also misquotes *Durant*, adding a comma and promoting a semicolon-joined clause into a standalone sentence |
| **Note** | Aristotle does make a defensible related claim (*Nicomachean Ethics* II.1) that moral virtue arises from habituation. But he says virtue *arises from* habit and *is* a stable state, which is not the same as "excellence is a habit" — Durant's gloss collapses Aristotle's own distinction. Not worth the footnote on a homepage |

---

## 2. Research

### 2.1 SHIPPED — the planning fallacy

| | |
| --- | --- |
| **Public wording** | "Across four studies, fewer than half of participants finished their tasks in the amount of time they originally predicted." |
| **Source** | Buehler, R., Griffin, D., & Ross, M. (1994). Exploring the "planning fallacy": Why people underestimate their task completion times. *Journal of Personality and Social Psychology, 67*(3), 366-381. DOI 10.1037/0022-3514.67.3.366 |
| **Source type** | Primary — peer-reviewed, read in full |
| **Exact support** | General Discussion, p. 378: "This optimistic bias in self-prediction was replicated in four prospective studies in which we varied characteristics of the target tasks, the procedure for eliciting predictions, and the criterion measures. In each case, fewer than one half of the participants finished their tasks in the amount of time they originally predicted." |
| **Confidence** | **HIGH** |
| **Where** | `src/features/marketing/components/ResearchMoment.tsx`, with a DOI link |

**The secondary sentence is also sourced.** "It was not only big projects. The same pattern showed
up on ordinary jobs like fixing a bike or cleaning a flat" rests on Study 2: non-academic projects
(the paper's own examples include fixing a bicycle and cleaning an apartment) were predicted at 5.0
days and took 9.2, with 42.5% finished within the predicted time.

**Verified but deliberately NOT shown:**

| Figure | Why it was left out |
| --- | --- |
| 33.9 predicted vs 55.5 actual days | Real, but 37 psychology students at one university in 1994. Quoting it invites a reader to think the paper says everyone doubles everything |
| "83.5% certain, 43.6% finished" | Real and striking, but a single study rather than the replicated summary |
| 13% / 19% / 45% at assigned probability levels | **Routinely attributed to this paper and absent from it.** Those figures belong to a different 1995 paper. This is exactly the trap the register exists to catch |

**Known counter-argument, recorded rather than hidden.** A 2025 *Cambridge Handbook of Project
Behavior* chapter argues the planning fallacy is over-extended as an explanation for large-project
cost overruns. That critique is about megaproject economics. The claim made here is the narrow,
directly-measured one about individuals predicting their own task times, which is what the 1994
studies observed.

### 2.2 REFUTED AND REMOVED — implementation intentions

**The first draft of this page shipped this claim. An adversarial check killed it, and it is worth
understanding why.**

| | |
| --- | --- |
| **Draft wording** | "Research on implementation intentions has found that deciding in advance when and where you will do something improves follow-through, compared with setting the goal alone." |
| **Verdict** | **NOT PUBLISHABLE.** Two independent failures, either sufficient |
| **Failure 1 — it misstates the comparison** | In that literature a "schedule plan" is *already defined* as naming when, where and what. The measured effect is if-then cue-response plans beating **schedule plans**, not planning beating not-planning. Todonado schedules; it does not build if-then cues. **The finding would have been an argument against this product, dressed up as support for it** |
| **Failure 2 — the effect is smaller than the headline** | The 2025 meta-analysis (Sheeran, Listrom & Gollwitzer) reports d = .36 across 642 tests, with Egger's b = 1.06 indicating substantial publication bias, and a bias-corrected RoBMA estimate of d = .15 that the authors themselves call small |

### 2.3 REJECTED — "people who write down their goals are 42% more likely to achieve them"

| | |
| --- | --- |
| **Verdict** | **NOT PUBLISHABLE. Never considered seriously after checking.** |
| **Why** | The figure is a ratio of two mean self-rated scores (6.08 / 4.28 = 1.42) presented as a probability, which is a category error before sourcing is even considered. The string "42" appears nowhere in the Dominican University summary document it is attributed to. The outcome was purely self-reported; 267 were recruited and 149 completed, a 44% attrition with no dropout analysis across conditions of very unequal burden; and it was never peer-reviewed |

### 2.4 VERIFIED, AVAILABLE, NOT USED — the cost of interruptions

Held back only because the page uses **one** research moment on purpose, and the planning fallacy
is closer to the wedge. Recorded here because it is verified and genuinely interesting.

| | |
| --- | --- |
| **Defensible wording** | "A controlled experiment with 48 participants found that people did not finish interrupted work more slowly, because they compensated by working faster, but they reported significantly more stress, frustration and time pressure." |
| **Source** | Mark, G., Gudith, D., & Klocke, U. (2008). The cost of interrupted work: more speed and stress. *CHI '08* |
| **Confidence** | HIGH |
| **⚠ Do not use the famous figure** | The widely repeated "**23 minutes 15 seconds** to refocus" has **no peer-reviewed source**. The token "23" appears zero times in the 2008 paper. It traces to a 2006 Gallup interview remark, in which the same speaker also gave a same-day resumption figure that contradicts her own published one. If it ever appears in Todonado copy, it is wrong |

---

## 3. Competitors

**No competitor is named anywhere on the homepage.** That is a deliberate positioning decision, and
the research below is what makes it a decision rather than an omission.

Research was carried out against official first-party sources (product homepages, help centres,
pricing pages) on 2026-08-16.

| Product | Category it occupies | Problem it leads with | Effort estimates | Daily capacity meter + overcommit warning | Built-in focus timer |
| --- | --- | --- | --- | --- | --- |
| **Trello** | Visual team boards | Scattered, uncaptured to-dos | No (third-party Power-Ups only) | No | No |
| **Todoist** | To-do list / task capture | Mental clutter, getting it out of your head | Yes, but Pro-only and requires a date **and** a time | No | No (its own help article suggests an external timer) |
| **Notion** | AI workspace | Scattered team context | No native property type | No | No (third-party embeds) |
| **Sunsama** | Guided daily planning ritual | Working too much, not ending the day | **Yes** ("planned time") | **Yes**, by name, graded amber then red | Yes |
| **Motion** | AI auto-scheduling | Productivity via AI | Yes, required by the scheduler | Yes, via auto-scheduling | Partial |
| **Akiflow** | Time-blocking consolidator | Tasks and calendar in one place | Yes (duration field) | Not found | Yes |
| **TickTick** | Broad to-do + habits | Staying organized | Yes, in pomodoro units | No | Yes |
| **Structured** | Visual day timeline | Seeing the shape of your day | Yes (duration) | No | No |

### The finding that changed the copy

**Sunsama already does "estimate effort and warn you before you overcommit today", completely and
by name.** It is not a partial overlap; it is the same feature described in the same terms, and it
has shipped for years. Motion reaches a similar place through AI auto-scheduling.

`CLAUDE.md` describes effort-aware capacity as "the one differentiator". **As a claim of uniqueness
that is not defensible**, and the homepage was written accordingly:

- Nothing on the page says or implies that no other product does this.
- The problem section's foil is "a plain list", which is accurate — a plain list genuinely does not
  do the arithmetic — and is not a claim about any particular competitor.
- The connected-system section says these things are "usually three separate tools", which is
  true as a general statement and is not a claim that nobody integrates them.

### What IS defensible, and what the page leans on instead

1. **The whole day is free.** The capacity meter, the overbooking guard, roll-over, focus mode with
   Pomodoro and recurring tasks are all on the free plan. Todoist gates task duration behind Pro;
   Trello gates Planner; Sunsama has no free tier at all, only a trial.
2. **Price.** Todonado is $5/month. The nearest daily-planning peers are materially more expensive.
   *(Deliberately not stated as a comparison on the page: competitor prices change, and a page that
   quotes them goes stale silently.)*
3. **The closed loop.** Estimate → capacity → plan → recorded actual → estimation bias → the next
   estimate. Every hop is a real function in this repository. This is what the system section
   argues, and it is mechanical rather than adjectival.
4. **Recovery framing.** Roll-over that is explicitly non-punitive. Todoist's own documented remedy
   for list overwhelm is "Todoist Zero", an empty list, which is a genuinely different philosophy.
   *(Not named on the page.)*

---

## 4. Claims about Todonado itself

Every product claim on the page is verified against the code, not against documentation.

| Claim | Backed by |
| --- | --- |
| The problem section's arithmetic (8h 20m of work, 2h 20m over a 6h day) | Computed at render by the product's real `computeCapacity`. Pinned by `problemFixture.test.ts`, which fails if the copy and the sum ever disagree |
| The recovery widget's selection and recount | The real `selectRolloverTasks`, `rolloverSpan` and `computeCapacity`. Verified in a browser: carrying two tasks over moves the meter 50% → 79%, and Undo restores it exactly |
| The week board | The real `planWeek`, as before this change |
| The loop's worked example (45m estimated, 58m actual, "you run 29% long") | 29 is computed in the component by the same expression `estimationBias` uses on real data, so the illustration cannot contradict itself |
| "Everything else you'd expect" and "One place for your day" | Unchanged lists, already governed by `e2e/marketing.spec.ts`: nothing may be listed that a new account cannot use today |

---

## 5. What a future session must not do

- Do not add an attributed quotation without a primary source. `QuoteBand` makes the citation a
  **required prop** specifically so this cannot be skipped.
- Do not convert an effect size into "N times more likely". That is the single most common way the
  research on this page's subject gets misquoted.
- Do not reinstate the "23 minutes 15 seconds" figure or the "42% more likely" figure. Both are
  investigated and refuted above.
- Do not add a competitor comparison table without redoing the research in this file. It was
  accurate on 2026-08-16 and will not stay accurate.
