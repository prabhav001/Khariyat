# Khairiyat: scenario, walkthrough and interface review (version 3)

This review was written before any version 3 code changed. It covers the version 2 files: `app.js`, `index.html`, `styles.css`, `README.md`, `qa/e2e-check.js` and `docs/REVIEW-AND-CHANGES.md`. The change log and test report are at the end.

## Part 1: Critical review

### A. Does the scenario feel like the day after the Snap?

**Partly, and mostly by implication.** The version 2 scenario is a well-built test of the desk's rules, but the Snap itself is almost absent.

| Question | Finding in version 2 |
|---|---|
| Is the loss of people understandable without imagining it? | No. The 16 scripted messages mention “no answer”, a child alone (C-702), a silent flat (C-804) and a missed medicine (D-502). Only the guard's note about Tower C's intercom hints at disrupted services. Nobody says that someone vanished. An evaluator could read the demo as an ordinary power cut. |
| Are the examples varied? | Moderately. Three of the six welfare and household stories are the same shape: no answer, then a worry, then a relative's call. There is no partial household loss, no volunteer affected by the Snap, and no loss of a carer. |
| Partial disruption, unresponsive units, self-reports, vulnerable residents, relatives, volunteer capacity, building services? | Unresponsive units, one self-report (A-402), a vulnerable child and a relative are present. **Missing:** partial household loss, a dependent adult who lost her carer, and a volunteer declining because of the Snap. Farhan's “NO” gives no reason in the scenario's own terms. Building services appear in one line only. |
| Outcomes too convenient? | Yes, in places. The C-702 grandmother travels from Rohini to Gurugram in 45 demo-minutes on the morning after half the world vanished. Every case is closed by 10:15. |
| Does the scenario show why coordination matters? | Partly. The decline, the overdue list and the correction do. Much of the rest teaches form fields. |
| Does it stay in scope? | Yes. Nothing records individual people or declares anyone missing. This must be preserved. |

**Recommendation.**

- Add a **clearly labelled fictional scenario introduction** with a few concrete, believable consequences:
  - two of five guards gone;
  - Tower C's intercom panel down;
  - the Tower B lift stopped because its operator is gone;
  - the market chemist shut.
- State an **approximate, fictional pre-Snap population** (about 550 residents). Say plainly that Khairiyat does not count people.
- Replace repetitive stories with **distinct situations**, each tied to one product capability:
  - partial household loss reported by the resident herself, recorded as household-level only;
  - an older resident who lost her live-in attendant, which keeps a case open legitimately;
  - a neighbour's rumour that is deliberately not recorded;
  - a volunteer who declines because of his own loss;
  - a police call that produces no commitment;
  - conflicting information from two of the C-804 resident's children;
  - a large list that runs late, with a partial report;
  - a wrong-unit correction.
- Make the fast outcome plausible: C-702's carer becomes an aunt who lives in D-603, in the same society.
- **Do not mark half the flats empty.** The guard's and warden's messages say that many households lost someone, and that they record only who answered. That keeps the unit-level scope while showing scale.

### B. Is the demo comprehensive?

**The 12 version 2 steps have real gaps:**

- **Steps carry several unrelated actions.**
  - Step 7 (C-702) combines setting priority, assigning a helper, acceptance, advancing the clock and an interim update.
  - Step 8 mixes a concern, a pair assignment, acceptance, the clock, no answer and an escalation.
  - Step 10 closes two different cases.
- **Instructions assume familiarity.** For example: “Assign Tower D's flats that need an owner to Meena with +30 min”, with no path to the button. The guide text also uses “Assign follow-up”, “Record response” and “Correct household status” without saying where they are.
- **Messages arrive at confusing times.** The B-203 correction arrives at 09:15, three steps before it is used, with no label. Messages carry no step number.
- **Unfinished items are left without explanation.**
  - The guard's `B-204,HELP` line is flagged as an error and never followed up. Someone may need help there.
  - `A-1O3` is never corrected, so A-103 stays unreached for no reason.
  - The D-502 case is opened in step 11 and never mentioned again.
  - Messages are never marked handled: the inbox ended with 16 “to handle”.
- **Completion checks pass too easily.**
  - Step 12 checks only that the update was copied and that coverage was reached at some moment (`coverAt != null`). It stays “done” even if deadlines then pass.
  - Step 5 passes if *any* Rohit task was accepted.
  - The guide is a free-order checklist with “Show me”. It never says what is still missing for the current step.

**Recommendation.** An 18-step guided sequence. One current step is expanded, showing:

- the situation, the actions, the expected result and why it matters;
- a live checklist of the completion conditions, which is also the “still missing” list;
- the step's scripted messages and their status.

Steps follow the demo clock, and each `+15 min` press belongs to a named step. Every message is tagged with its step. Leftovers are designed out:

- the guard's typo is fixed in the bulk dialog;
- the HELP line without a category becomes the B-902 story;
- D-502 and B-902 stay open deliberately, and the final review explains them.

### C. What should “demo complete” mean?

**These states are different and must not be merged:**

1. **A scenario has been demonstrated:** its step's conditions are true in the data.
2. **A household has been accounted for:** household Confirmed, with a basis.
3. **A welfare case has a verified outcome:** closed, with outcome and evidence.
4. **A welfare case is open with an accepted next action:** open, owner accepted, deadline not passed.
5. **A task needs intervention:** needs an owner, awaiting acceptance, due now or overdue.
6. **An item was forgotten by the walkthrough:** a skipped step, an unhandled message, or rows left in error.

**The completion rule we adopted** (final step 18) is stricter than the minimum suggested:

- every earlier step's conditions are true **now** (not merely once);
- every scripted message has arrived and been actioned or marked handled;
- no unit needs an owner, and no assignment is awaiting acceptance;
- **no task is due now or overdue** at the checkpoint;
- every open welfare case is listed with its reason, accepted owner and next deadline;
- a totals-only society update has been generated.

**“Due now” is excluded as well as overdue.** A handover with tasks at their deadline would become overdue the moment it happened. The rule does **not** require all households confirmed or all cases closed. B-902 (long-term care not arranged) and D-502 (medicine still being sought) remain open by design, and the handover summary says why.

### D. Is the interface right for a coordinator under pressure?

| Pattern in version 2 | Verdict |
|---|---|
| Dark gradient header, gradient “ख़” logo | Decorative. It draws the eye to the least important region and reads as a template. **Remove.** |
| Six equal KPI cards with coloured top borders | Equal weight hides the actionable numbers (needs an owner, awaiting acceptance, overdue). The coloured strips add nothing. **Replace** with one grouped summary line. |
| Coloured left strips on queue groups, owner cards and messages | Decorative and inconsistent: the same orange means “welfare” in one place and “warn” in another. **Remove.** Urgency goes in the heading text and count. |
| Shadows on every card; boxes inside boxes | Visual noise; everything floats at the same level. **Use** borders and dividers, with no shadows except on overlays. |
| Numbered circles on queue groups | They encode order, which the list order already shows. **Remove.** Add one “Next priority” line instead. |
| Many pill badges (priority, stage, household tag, due, counts) | Some carry state (priority, overdue, awaiting acceptance); some are decoration. **Keep** state as plain text labels, using colour only for urgency. |
| Header with seven controls, all equal | Import, export, settings and reset compete with daily work. **Keep** Bulk update visible; move the rest into a “More” menu. Label the demo clock as a demo control. |
| Free-order demo guide beside a 16-message inbox | The guide does not focus attention. **Guided sequence**, with the inbox ordered by the current step. |
| Grid cell markers (outline, ring, dots, “!”) | Functional and already text-labelled. **Keep**, in calmer colours. |
| Phone layout | Works, but the walkthrough sits below a long page. **Put** the guide above the work on narrow screens and keep it collapsible. |

**Redesign direction:**

- **Palette:** a warm, paper-like neutral (`#f6f4ef`) with near-black text, one calm blue accent for primary actions, and restrained status colours with text labels.
  - green: household confirmed;
  - terracotta: welfare case;
  - amber: awaiting acceptance or due now;
  - red: overdue, needs an owner, urgent.
- **Shape and type:** 1 px borders, 6–8 px radii, system fonts, tabular numbers.
- **No decoration:** no gradients and no decorative strips.

---

## Part 2: Revised scenario (fictional)

**Neelgiri Apartments, Sector 00, Gurugram:** 4 towers, 160 flats, roughly 550 residents before the Snap. That figure is a fictional estimate; Khairiyat does not count people. At about 6:30 pm yesterday, half of all people everywhere vanished. The loss here is uneven:

- some households lost no one, and some lost a parent, a carer or a child;
- some flats haven't answered at all;
- two of five guards are gone, Tower C's intercom panel is down, the Tower B lift has stopped, and the market chemist is shut.

The desk opens at 09:00, run by Priya, the RWA secretary.

| Time | Step | Situation | Capability shown |
|---|---|---|---|
| 09:00 | 1 | Import the register (duplicate row, missing identifier) | Validation without guessing |
| 09:00 | 2 | Six flats with no residents on record | A source for every confirmation |
| 09:00 | 3 | Guard's intercom round: no channel per line, one typo, one HELP line without a category | No invented evidence; fix, don't guess |
| 09:00 | 4 | A-402 resident: “we're fine, my husband is gone”. A B-801 resident: “B-704 probably vanished” | Household-level only; a rumour is not a source |
| 09:00 | 5 | B-902: older resident lost her attendant, the Tower B lift has stopped | Confirmed household *and* open case |
| 09:00 | 6 | Tower C intercom down: split between two wardens; Tower D upper floors | Workload; an assignment is a request |
| 09:15 | 7 | Arjun and Meena say YES; Farhan says NO (his wife is gone, his children are alone); Rohit takes over | Acceptance; a decline returns to the queue |
| 09:30 | 8 | Arjun's report (free text, child alone, no answers, an away flat) | Strict bulk format |
| 09:30 | 9 | C-702 child alone | Priority as judgement; a helper accepts |
| 09:30 | 10 | C-804: daughter's worry about a silent flat | A worry is a reason to check, not evidence |
| 09:45 | 11 | Helpers' interim reports (C-702, B-902) | Updates don't close cases |
| 09:45 | 12 | C-804: no answer; police reached, no commitment | Contact is not a handoff |
| 10:00 | 13 | D-502 (confirmed household): medicine ran out, chemist shut | New concern on a confirmed household |
| 10:15 | 14 | Meena overdue: 9 done, 6 left, lift stopping | Partial report; overdue keeps its owner; extension with a reason |
| 10:15 | 15 | C-702: aunt from D-603 arrives. C-804: son says she is in Faridabad, phone left at home | Outcomes need evidence; the household is recorded separately |
| 10:15 | 16 | Guard: “B-203 was really B-302” | Correction keeps history |
| 10:15 | 17 | Six flats still without an owner go to Arjun | Accepted next step for everything |
| 10:15 | 18 | Society update and handover summary | Honest end state |

**End state (designed):**

- 129 of 160 households confirmed.
- The 31 unconfirmed households all have an accepted next check: Rohit 19 (due 10:45), Meena 6 (10:30), Arjun 6 (11:15).
- Two welfare cases remain open with accepted helpers: B-902 (care not yet arranged, Sunita, next report 11:45) and D-502 (medicine not yet found, Nisha, 11:00).
- No unit needs an owner; nothing is awaiting acceptance, due now or overdue.
- All 23 scripted messages are handled.

**Runtime.** About 18–22 minutes: 18 steps, three of them short. The extra length over the 15-minute target buys three stories:

- partial household loss;
- a carer lost, with a case that legitimately stays open;
- a service that doesn't commit.

These are the stories that make the Snap legible. Cutting steps 4 and 5 would save about three minutes, at the cost of exactly those.

---

## Part 3: Change log (version 2 → version 3)

### Scenario and walkthrough (`app.js`)

- **Scenario introduction:** **More → About this scenario**, and step 1 links to it. It is labelled fictional, and gives an approximate pre-Snap population (about 550) with the explicit note that Khairiyat does not count people.
- **Guard's list:**
  - Its `B-204,HELP` line became `B-902,HELP`, which leads into the B-902 story.
  - B-204 is now confirmed normally.
  - The `A-1O3` typo is fixed inside the walkthrough (step 3).
- **Scripted messages:** 23 (was 16), each with a `step`, a short `label` and an `expect` text saying when it arrives. Nine are new:
  - the B-704 rumour;
  - Ramesh's call-back about B-902;
  - Sunita's YES and update;
  - Meena's and Rohit's YES;
  - Nisha's YES;
  - Meena's partial report (9 bulk lines);
  - Arjun's second YES.

  Farhan's NO now gives a Snap-related reason. Kavita's story now involves an aunt living in the same society. The C-804 son explains why his mother didn't answer.
- **Guide:** 18 steps (was 12), in a guided sequence.
  - **Shown for the current step:** situation, exact actions with on-screen labels and values, expected result, why it matters, the step's messages with their status, and a live **Done when** checklist.
  - **Navigation:** Back, Show me, and Next step (enabled only when the conditions hold), plus a list of all steps.
  - **Persistence:** the current step is saved with the data, so a reload keeps your place.
- **Completion and handover:**
  - Completion is read from the data, not from clicks, and is re-evaluated continuously: a step can become incomplete again.
  - Step 18 implements the completion rule in Part 1, C.
  - The new **Handover summary** (**More → Handover summary**, or the final step) works for any register.
- **Desk inbox:**
  - messages for the current step are highlighted and listed first;
  - a message counts as handled when its step is complete, or when you mark it handled;
  - handled messages collapse to one line.
- **Next priority line:** a new line at the top of Unresolved work answers “what needs my attention next?”, with a button when the answer is a welfare case.
- **Test hook:** `window.__khairiyat` gains read-only `guide()` and `messages()`.

### Interface (`styles.css`, `index.html`, `app.js` rendering)

- **Removed decoration:**
  - the dark gradient header, gradient logo and numbered queue circles;
  - coloured top strips on KPI cards, and left strips on queue groups, owner cards and messages;
  - card shadows (kept only on overlays: menu, drawer, dialog, toasts).
- **New palette:** warm neutral background (`#f5f3ee`), white working surfaces with 1 px borders, one blue accent (`#2b5a87`) for actions and the current step. Status colours are used only for status, always with text.
- **Header:** brand, a clearly labelled demo clock, **Bulk update**, and a **More** menu for import, export, handover, scenario, settings, reset and delete.
- **Summary:** six equal cards became three groups. Only “Next steps needing attention” is boxed, and its numbers turn red or amber only when they are non-zero.
- **Queue:** groups separated by rules rather than cards, with counts coloured by urgency.
- **Narrow screens:** below 1100 px the current walkthrough step goes above the work and the inbox below it. Below 640 px the summary stacks and register lists become labelled cards.

### Em dashes

Every U+2014 was removed from `app.js`, `README.md`, `docs/REVIEW-AND-CHANGES.md` and `qa/e2e-check.js`. Sentences were rewritten with colons, commas, parentheses, “for” or full stops. Empty table cells now say what is missing (“Not set”, “No task”, “No open case”). The new `qa/check-no-em-dash.js` reports the count, and the browser test also checks the rendered page.

### Tests (`qa/e2e-check.js`)

Rewritten to follow the 18 steps exactly as the guide instructs, and to check:

- each step's completion state;
- message statuses;
- the final handover content;
- that the completion rule breaks again when a deadline arrives.

The A–J acceptance checks, both irregular registers, privacy, export, persistence, reset/delete and the 390 px layout are kept.

### Design check, as a first-time coordinator

| Question | Answer after the redesign |
|---|---|
| Can I find the next priority without reading every panel? | Yes: the “Next priority” line names it, and the boxed counts show where the gaps are. |
| Can I tell household, welfare and acceptance apart? | Yes. The drawer has separate *Next step*, *Household* and *Welfare case* sections. Grid cells use fill for household and case, and markers for acceptance, with a legend and text labels. |
| Are overdue and awaiting-acceptance distinct? | Yes: separate groups, separate counts, red versus amber, and different wording. |
| Are the important actions obvious without tooltips? | Yes: every action is a labelled button, and primary actions are blue. |
| Does anything look clickable but isn't? | Unit chips inside dialogs look like the clickable chips elsewhere; they use a default cursor but keep the shape. Stage tags and badges are flat labels. A minor remaining inconsistency. |
| Is the walkthrough easier to follow? | One step at a time, exact labels, and a live “still missing” list. Untested with real evaluators. |
| Does it work at phone width? | At 390 px there is no horizontal page scroll; drawer, dialogs and handover fit. Checked in headless Chromium only. |
| Are errors, warnings and destructive actions consistent? | Field errors are red text under the field, and notices share one pattern. Reset and delete require a typed word. |

---

## Part 4: Test report (version 3)

### What was run

| Check | Tool | Result |
|---|---|---|
| Syntax | `node --check` on `app.js`, `qa/e2e-check.js`, `qa/check-no-em-dash.js` (Node 22.22.0) | Pass |
| Em dash scan | `node qa/check-no-em-dash.js` over `index.html`, `styles.css`, `app.js`, `README.md`, `docs/`, `qa/` | 0 occurrences in 8 files |
| End to end | `qa/e2e-check.js`: Playwright 1.56.1, headless Chromium, `file://`, 1440 × 900 and 390 × 844 | **132 / 132 passed on three consecutive runs** |
| Visual | Screenshots of the start, 09:15 queue, C-804 drawer, overdue list, handover, final state, and 390 px views, inspected by eye | Two layout fixes made (below) |

### What the end-to-end check covers (132 checks)

- **The walkthrough, steps 1–18, through the real interface:**
  - every step starts incomplete and becomes complete only from the data;
  - the guide shows what is missing, and Next stays disabled until then;
  - each scripted message arrives when the guide says it will and ends “actioned” or “marked”;
  - the final state is 129 confirmed, 31 unconfirmed (all accepted and in time) and 2 explained open cases (B-902, D-502). Everything else is zero, all 23 messages are handled, and all 18 steps are complete.
- **Completion stays honest:** one extra `+15 min` makes steps 17 and 18 incomplete again, and the handover summary says “6 tasks due now”.
- **The version 2 principles:**
  - A: household and case are separate (B-902, C-702, C-804, D-502);
  - B: pending is not covered, a decline returns work, overdue keeps its owner, an extension needs a reason;
  - C: no channel or source is invented, and typos are flagged, not fixed;
  - D: due now, then overdue;
  - E: contact is not an outcome, evidence is required, *Taken over* is refused without proof, corrections keep history;
  - F: workload warning;
  - G: priority defaults and ordering;
  - H: safety text, no emergency numbers, no calls;
  - I: no success claims;
  - J: three registers, string identifiers, ambiguity, CSV.
- **Regression:**
  - history and privacy hiding;
  - register and history CSV contents;
  - reload keeps state and walkthrough position;
  - Escape closes dialogs;
  - grid-cell text labels;
  - reset and delete;
  - 390 px layout (no page scroll; drawer, dialog and handover fit; the walkthrough step sits above the work);
  - no console errors;
  - no network requests;
  - no em dash in the rendered page at five checkpoints.

### Found during this round and fixed

| Found | Fix |
|---|---|
| On narrow screens the whole side panel, inbox included, sat above the work | Only the walkthrough step goes above; the inbox moves below |
| Handover summary said “Why still open: Open: no handoff yet”, which was circular | It now gives the latest report and says no outcome has been recorded with evidence |
| Two test assertions were wrong: one scanned the stored inbox text for “husband”, one treated the rule “Never included: any claim that everyone is safe” as a claim | Assertions corrected; no app change |

### Not tested

- Real evaluators or coordinators: timing (the 18–22 minutes is an estimate) and comprehension.
- Firefox, Safari, Edge, physical phones and touch.
- Screen readers and full keyboard-only use. Dialogs do not trap focus, and the narrow layout uses `display: contents`.
- Clipboard contents at the operating-system level.
- Behaviour when local storage is blocked.
