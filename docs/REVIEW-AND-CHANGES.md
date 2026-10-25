# Khairiyat version 2: critical review, change log and test report

> Historical record of version 2. Some details below (the 12-step demo, the scripted messages, the 185-check test run) were superseded by version 3: see [`DEMO-AND-DESIGN-REVIEW.md`](DEMO-AND-DESIGN-REVIEW.md).

## Part 1: Critical review (written before any code was changed)

Each item records:

- **Now:** what the version 1 prototype did.
- **Risk:** what could go wrong for the coordinator, a volunteer or a resident.
- **Verdict:** whether the proposed change is justified, and any simpler or safer alternative.
- **Smallest change:** what was actually changed.
- **Verify:** how the behaviour was checked.

### A. Separate household accounting from welfare-case status

**Now.** Each flat had one status: Unconfirmed, Confirmed or Needs welfare check.
- A flat with an open case could not be confirmed.
- `actCloseCase()` set the flat to *Confirmed* whatever the outcome.

**Risk.**
- **Closing a case could invent an accounting fact.** "Care arranged" for a child said nothing about the rest of the household, yet the flat became Confirmed.
- **A real accounting fact couldn't be recorded.** If an adult answered the door and said "my mother needs medicine", the coordinator had to choose between recording the contact and recording the concern.
- **The count was wrong.** "Confirmed" understated households actually reached.

**Verdict.** Justified, with three limits:

- **Two simple dimensions, not a richer state machine:**
  - **household status:** Unconfirmed or Confirmed, with a basis;
  - **welfare case:** none, or open with a stage.
- **No person-level tracking**, and no "partially accounted" state. Either would drift towards a missing-persons database.
- **"Confirmed" is relabelled as household-level only:** contact was made with an adult in the household, or a named source says it is away or vacant. It is not a statement about every person linked to the flat.

**The old safety rule needs a replacement.** "You can't confirm while a case is open" stopped a case being forgotten once a flat looked confirmed. It goes away. Instead, an open case is always shown on its own, whatever the household status:
- its own KPI;
- the top of the queue;
- a ◆ marker on the grid.

**Smallest change.**
- `status` now has two values only, and the welfare case is tracked through `caseId`.
- Confirming a household no longer touches the case.
- Closing a case no longer touches the household. Where the outcome might also account for the household, the app offers a separate, explicit "record household status" action.
- A case can be opened on a confirmed household.

**Verify.**
- C-702: the household is confirmed while its case stays open.
- C-804: the case closes "located elsewhere" and the household stays Unconfirmed.
- D-502: a confirmed household gets a new concern and stays Confirmed.

### B. Make ownership meaningful, and reassess "zero unowned"

**Now.**
- Any open task counted as owned the moment it was typed.
- An overdue task was counted as unowned.
- The milestone was "zero unowned".

**Risk.**
- 38 flats could be "owned" by someone who never saw the message.
- Calling a task "unowned" when the person had accepted it and was simply late was false. It also hid who to chase.

**Verdict.** Justified, with two adjustments.

1. **Acceptance is recorded once per assignment batch, not once per flat.** One action covers "Arjun replied YES for his 19 flats"; 19 clicks would be friction a stressed coordinator would skip.
2. **The coordinator's own tasks are accepted automatically.** This covers *Desk (coordinator)* follow-ups: the person recording is the owner, so asking them to confirm to themselves adds nothing.

**Gaming risk.** Someone could park every flat on the desk to hit the milestone. The workload warning applies to the desk too.

**Was the old metric useful?** Not as defined: it counted pending assignments as owned, and overdue work as ownerless. It is replaced by **next-step coverage**:

- **Measures:** whether every unresolved flat (household unconfirmed, *or* welfare case open) has an open task, accepted by a named owner, whose deadline hasn't passed.
- **Does not prove:** that anyone is safe, that any household is accounted for, that any case is resolved, or that the work will be done.
- **Can fall back:** any deadline passing re-opens a gap.

It stays useful as a coordination-health measure, never on its own. It is always shown next to unconfirmed households, open cases and overdue tasks, in neutral rather than celebratory styling.

**Smallest change.**
- **Tasks:** each task carries an acceptance value, `pending` or `accepted`. New actions record accepted, declined, a deadline extension with a reason, and a check-in with the owner.
- **Queue groups:**
  1. Welfare cases needing action
  2. Overdue
  3. Needs an owner
  4. Awaiting acceptance
  5. Welfare cases in progress
  6. Being followed up
- **KPIs:** Needs an owner, Awaiting acceptance and Overdue are counted separately.

**Verify.**
- Pending work is not counted as covered.
- Farhan's decline sends 19 flats back to *Needs an owner*.
- Meena's overdue tasks are flagged as overdue and still show her as owner.
- The KPIs keep showing unconfirmed households and open cases throughout.

### C. Never invent evidence during bulk updates

**Now.**
- `OK` with no channel was silently recorded as a door visit.

**More invented evidence found during the review:**
- **Vacant-flat source:** the default source for the vacant flats was "Register + guard", though no guard had confirmed anything.
- **Escalation service:** "Police" was pre-selected in the escalation form.
- **Interim update type:** "Helper is with the resident" was pre-selected.
- **"Reported by":** defaulted to the coordinator, even when someone else gave the information.

**Risk.** The record looked more certain than the evidence. The next shift might skip a flat that was only "OK'd" second-hand.

**Verdict.** Justified. The simplest consistent rule:

- An `OK` line needs a channel: `INTERCOM`, `PHONE`, `VISIT`, `MESSAGE`, or `UNKNOWN` (recorded as "channel not stated").
- Otherwise it takes a **batch channel** that the coordinator explicitly chose for this paste.
- The default batch setting is "require a channel on each line".
- Nothing is pre-selected for the service contacted, the interim-update type or "reported by".

**Verify.**
- The guard's lines (no channel given) are all rejected until Intercom is chosen as the batch channel, then all 92 apply with "channel from batch setting" shown.
- `OK` with no channel never becomes Door visit.

### D. Make deadline behaviour match the displayed time

**Now.** A task counted as overdue only when `clock > due`. With a 15-minute clock, a task "due 09:15" looked no different at 09:15 than at 09:00.

**Risk.** The deadline the user saw and the app's behaviour disagreed. The moment that needs attention passed silently.

**Verdict.** Justified. A deadline of "by 09:45" includes 09:45, so making the task overdue *at* 09:45 would be wrong. Convention:

| When | State |
|---|---|
| Before the deadline | upcoming ("due 09:45") |
| At the deadline | **Due now** (amber; listed first; still covered) |
| After the deadline | **Overdue since 09:45** |

A deadline set between clock steps (for example 09:50) goes straight from upcoming to overdue at 10:00. That is correct and documented. "Overdue" never removes the owner.

**Verify.** Meena's tasks were checked at 09:45, 10:00 and 10:15. The drawer, queue group and KPIs agreed each time.

### E. Distinguish a contact attempt from an accepted handoff and a resolved case

**Now.**
- "Escalate" logged a service and a reference.
- The case could be closed as "Handed over to a service" or "Care arranged" on typed text alone.

**Risk.** A phone call that nobody acted on could close the case. The desk would stop following up while a resident still needed help.

**Verdict.** Justified, with deliberately few stages:

- **Open** (no handoff yet)
- **Contact attempted** (no commitment yet)
- **Handoff agreed** (a named recipient said they will act, but this isn't confirmed)
- **Closed** (an outcome with stated evidence)

**Closing requires:**
- an outcome;
- details;
- *how it is known*: seen in person, spoke to the resident, spoke to family or carer, service confirmed, or other.

**"Taken over by a service" also requires** "service confirmed" or "seen in person". There is no contact-attempt option among the evidence choices.

**Not adopted:** document proof or an integration with emergency services. Both would be impossible on day one.

**Verify.**
- Recording the police contact for C-804 leaves the case open, with an owned follow-up.
- Closing as "Taken over" with only family evidence is refused.
- Closing C-702 as "Care in place", seen in person, keeps the history and leaves the household status unchanged.
- Reopening a closed case requires a reason.

### F. Account for realistic volunteer workload

**Now.** The demo assigned all 38 Tower C flats to one warden without comment.

**Risk.** The plan looked covered but wasn't doable. That gives the coordinator false confidence.

**Verdict.** Partly adopted:

- **Visible load per person:** the open-task count appears in the owner suggestions, the assign dialog and the owner cards.
- **A soft warning** above a threshold set in Settings (default 20 flats). It is labelled an adjustable assumption, not a validated standard.
- **No hard cap and no optimiser.**
- **The demo now splits Tower C:** Arjun takes floors 6–10. Farhan takes floors 1–5, declines, and the work is reassigned to Rohit.

**Verify.**
- Selecting all 38 Tower C flats for one person shows the warning.
- After the decline, the queue shows exactly those 19 flats under *Needs an owner*, and they leave it once reassigned.

### G. Make urgency rules consistent, without pretending to triage

**Now.** The two input routes behaved differently:

- **Bulk updates** inferred High urgency for CHILD or MEDICAL, and Normal otherwise.
- **The manual form** pre-selected High for everything.

**Risk.**
- The same concern got different priorities depending on how it was typed.
- The category implied a clinical assessment that nobody had made.

**Verdict.** Justified:

- **The concern** is what was reported.
- **The priority** is the coordinator's judgement: Urgent, Not urgent, or **Not yet assessed**, which is the default on both routes.
- **Queue order:** Urgent, then Not yet assessed, then Not urgent. The rule is shown in the interface.
- **Every welfare form says the same thing:** this is not medical triage, and anyone who may be in immediate danger should get emergency help directly, without waiting for the desk.

**Verify.**
- `HELP,CHILD` from a bulk paste and the same concern entered manually produce the same record (concern CHILD, priority Not yet assessed).
- A priority change re-orders the queue and is logged.

### H. Improve volunteer-safety instructions

**Now.** The helper message said "Stay until the desk confirms the next step."

**Risk.** It could keep a volunteer somewhere unsafe, and imply they may enter a home or attempt a rescue.

**Verdict.** Justified. Messages now:

- ask for YES or NO, which feeds acceptance tracking (item B);
- say knock or call only;
- say don't enter or force entry, and leave if unsafe;
- say to call emergency services *directly* if anyone may be in immediate danger, without waiting for the desk.

**Emergency numbers are left out of volunteer messages.** The numbers in Settings haven't been checked for every location. The escalation dialog says plainly that Khairiyat places no calls.

**Verify.** The generated messages contain these instructions, never require entry or staying, and contain no emergency numbers.

### I. Avoid misleading success signals and claims

**Now.**
- A green "zero unowned" banner, with a reassuring toast.
- The brief's tagline was "Every resident looked after."

**Risk.** Coordinators or residents could read either as "the emergency is handled".

**Verdict.** Justified:

- **KPIs that stay separate:** Confirmed households, Unconfirmed households, Open welfare cases, Needs an owner, Awaiting acceptance, Overdue (plus Due now).
- **Neutral coverage banner:** it always lists what is still outstanding.
- **New promise:** "No unresolved flat without an accepted next step", described as a coordination aim, not a safety guarantee.
- **The brief's tagline must change** in the written submission too.

**Verify.** The banner text, and the KPIs staying visible and non-zero, at the coverage milestone.

### J. Make housing-society registers flexible

**Now.** Imports had to fit the demo building exactly:

- a fixed `T-FFUU` pattern;
- towers A–D;
- floors 1–10;
- flats 1–4 per floor.

**Risk.** A real society would have to rewrite its register under pressure, or would be rejected outright.

**Verdict.** Justified, with limits.

**How identifiers are handled:**
- **Plain strings**, kept exactly as given (leading zeros, separators, letter case).
- **Optional metadata:** building or tower, floor, and a note.
- **CSV:** a header row is matched by name, and quoted fields are supported.
- **Commas are rejected in identifiers**, because the bulk format separates fields with commas.

**What the importer checks:**
- **Distinguishable:** two identifiers that differ only by case or spacing are flagged as ambiguous, and neither is kept.
- **Not guessed:**
  - The same identifier in different, explicitly named buildings is kept and shown as `Building/ID`.
  - The same identifier where building context is missing is flagged.
  - Exact duplicate rows keep the first copy only.
- **Look-alikes:** identifiers that match apart from leading zeros (`Plot 04` and `Plot 4`) get a warning, not an error.
- **No structural limits** are imposed.

**How the register is displayed:**
- **Grid** only when every unit has both a building and a floor.
- **Searchable list** otherwise.

**Not adopted:** a floor-plan editor or a layout designer. Scripted demo messages run only for the Neelgiri sample register.

**Verify.** Three fictional registers were imported: the regular towers, an irregular building, and independent homes. The checks covered:
- duplicates, missing identifiers and ambiguity;
- no floor limit;
- search;
- assigning, confirming, opening a case and correcting on irregular identifiers;
- CSV export.

### Conflicts and trade-offs between the requirements

- **B and F against demo length.** Acceptances and a decline add steps. They are kept affordable with batch-level recording and scripted YES/NO replies; the demo grows from 11 to 12 steps.
- **A and I.** "Confirmed" alone reads like "safe", so it is always shown as *household confirmed*, with a note.
- **D and B.** "Due now" still counts as covered: the owner has accepted and the deadline hasn't passed. It is highlighted rather than treated as a gap.
- **J and the bulk format.** Identifiers may contain spaces and `/`, but not commas.
- **E and simplicity.** Four stages at most; contact attempts are entries in the history, not more stages.

---

## Part 2: Change log (version 1 → version 2)

The v1 files were the starting point: layout, helpers, rendering pattern, modal and form framework, history, CSV, reset and delete were kept. The data model and the rules around it were rewritten.

### `app.js`

**Data model (A, B, E)**
- **Two independent records per unit:** household status (Unconfirmed / Confirmed with a basis) and a welfare case (none / open with a stage / closed with outcome and evidence). The v1 single status and the “can't confirm while a case is open” block are gone.
- **Tasks** carry `accept` (`pending` / `accepted`), how acceptance was given, and a list of deadline extensions with reasons. Tasks for *Desk (coordinator)* are accepted automatically.
- **Storage key** is now `khairiyat-prototype-v2`. v1 data is not migrated. *Delete all data* also removes a leftover v1 copy.

**Acceptance, deadlines and workload (B, D, F)**
- New actions:
  - **Record response** (YES/NO for a whole batch; a NO needs a reason and returns the units to *Needs an owner*);
  - **Extend deadline** (reason required, same owner);
  - **Record check-in** (logged, task unchanged).
- **Deadline convention:** upcoming before, **Due now** at, **Overdue** after. Advancing the clock logs one “deadline passed” entry per task, and never removes the owner.
- **Workload:** owner suggestions, the assign dialog and owner cards show open-task counts. A soft warning above the Settings limit (default 20) never blocks.

**Coverage and success signals (B, I)**
- **Next-step coverage** replaces “zero unowned”: an unresolved unit is covered only when its task is accepted and not past its deadline. Gaps = needs an owner + awaiting acceptance + overdue.
- **The first time coverage reaches 100%** is logged as a milestone, in neutral wording. It says it is not a safety measure and how many households and cases are still outstanding.
- **KPIs:** six separate cards plus a coverage line. No green success banner.

**Evidence (C, E)**
- **Bulk `OK` needs a channel**, or an explicit batch channel; the default is to require one per line. Entries record when the channel came from the batch setting. `UNKNOWN` is recorded as “Channel not stated”.
- **No pre-selected evidence:** nothing is pre-selected for the contacted service, the interim-update type, the confirmation channel or “reported by”.
- **Vacant-flat source:** prefilled only when every selected unit carries a register note, and then only with the literal note.
- **Case stages:**
  - **Record contact** moves an open case to *contact attempted* or *handoff agreed*. A handoff needs a named recipient.
  - Recording contact never closes the case. A follow-up owner is required when nobody owns the next step.
- **Closing a case** needs an outcome, details, evidence and who recorded it. *Taken over by a service* needs *service confirmed* or *seen in person*.
- **Corrections:** reopen and withdraw, each with a reason. Household correction back to Unconfirmed keeps the earlier entry.

**Priority (G)**
- Concern and priority are separate. Priority is *Urgent / Not yet assessed / Not urgent*, defaulting to *Not yet assessed* on both the bulk and manual routes.
- The queue orders welfare cases Urgent → Not yet assessed → Not urgent. A priority change is logged as the coordinator's judgement, not a clinical assessment.

**Safety wording (H)**
- **Task messages:**
  - ask for YES/NO;
  - say knock or call only;
  - say don't enter a home or force a door, and leave if unsafe;
  - say call emergency services directly in an emergency.

  They contain no emergency numbers.
- **The contact form** says Khairiyat places no calls and that the numbers haven't been verified for every location.
- **Every welfare form** says it is not medical triage.

**Registers (J)**
- **Identifiers are strings.** The importer:
  - matches header names, supports quoted fields, and treats building, floor and note as optional;
  - rejects missing identifiers, duplicate rows, commas in identifiers, over-long identifiers and notes, and case- or space-only ambiguity;
  - qualifies a repeated identifier in named buildings as `Building/ID`, with a warning;
  - warns about leading-zero look-alikes.
- **Views:** the grid sizes itself from the register and is offered only when every unit has a building and a floor; otherwise the list is used. Building, floor and note can be edited, with history.
- **Three fictional sample registers:** Neelgiri, Gulmohar Enclave, Palm Grove Villas.
- **Bulk lines** match identifiers case-insensitively, and flag a bare identifier that exists only in qualified form.

**Demo**
- **Guide:** a 12-step guide with *Show me* helpers.
- **Inbox:** 16 scripted messages that run only for the Neelgiri register. New messages cover:
  - Arjun's YES, Farhan's NO and Kavita's YES;
  - the pair's YES and Meena's YES;
  - Meena's “running late”;
  - the grandmother arriving;
  - the D-502 concern.
- **Testing hook:** a read-only `window.__khairiyat.snapshot()` / `stats()` for the automated check.

**Fixed during testing**
- The unit list becomes one labelled card per unit on screens ≤ 640 px. At 390 px the household and next-step columns had been scrolled out of view.

### `styles.css`

- **Grid:**
  - columns come from the register (`--cols`), and wide floors scroll inside the building card;
  - the household status icon sits in the cell corner, so labels such as `1001` aren't truncated (seen in testing);
  - coverage markers: dashed outline for *Needs an owner*, ring for *Awaiting acceptance*, amber dot for *Due now*, blue dot for *Covered*, red “!” for *Overdue*;
  - a welfare case changes the fill, and the border still shows the household status.
- **New styles:**
  - priority badges and case-stage tags;
  - the *Awaiting acceptance* tone;
  - the neutral coverage line and banner (info blue, not success green).
- **KPIs:** use flex rows (6 / 3 × 2 / 2 × 3). The v1 grid left an empty column at desktop width.
- **Phone list layout:** the stacked unit list described above.
- **Removed:** dead v1 rules (blocked-attempt styles, old action grid, `own-*` cell markers).

### `index.html`

- The footer now states the coordination aim and that it is not a safety guarantee.
- It now says data leaves the page only as copied text or downloaded CSV. v1 said “copy-to-clipboard is the only way”, which ignored CSV export.

### `README.md`

Rewritten for v2:

- the model;
- the 12-step demo as a clock timeline;
- register and bulk rules, and the cross-cutting rules;
- privacy;
- limitations (including that coverage can be gamed by parking work on the desk);
- verification.

### `qa/e2e-check.js`

Rewritten for v2 (185 checks). It is portable: it resolves `../index.html` from its own folder.

---

## Part 3: Test report

### What was run

| Check | Tool | Result |
|---|---|---|
| Syntax | `node --check app.js` and `node --check qa/e2e-check.js` (Node 22.22.0) | Pass |
| End-to-end | `qa/e2e-check.js`: Playwright 1.56.1, headless Chromium, page loaded from disk (`file://`), 1440 × 900 except where noted | **185 / 185 passed**, on three consecutive runs of the final files |
| Visual | A separate capture script took screenshots at 1440 px, 1000 px and 390 px. They were inspected by eye. | Three layout problems found and fixed (see below) |

### Checks by area (final run)

| Area | Checks | What is asserted (examples) |
|---|---|---|
| Step 1 · Import (J) | 7 | 160 valid / 2 errors; duplicate and missing identifier named; all units start Unconfirmed and need an owner; grid of 160 cells |
| Step 2 · Vacant (C) | 4 | Six noted flats selected; source prefilled with the literal note; basis stored |
| Step 3 · Guard round (C) | 14 | 94 errors without a channel; Apply disabled; 92 valid with batch Intercom; letter-O hint not auto-applied; B-203 basis records the batch channel and reporter; manual confirm refuses without channel and the adult tick |
| Step 4 · Split (B, F) | 12 | Warning at 38 tasks, not blocking; 19 + 19 split; the message asks YES/NO, has the safety lines, no emergency numbers, and no claim that a call was placed; 38 pending and 0 covered; no milestone |
| Step 5 · YES/NO (B, F) | 10 | Acceptance makes 19 covered; NO needs a reason, closes tasks and returns 19 to *Needs an owner*; reason in history; Rohit's YES makes them covered, due 10:45 |
| Step 6 · Arjun's reply (C, G) | 9 | Free text flagged; per-line channels kept; HELP → *Not yet assessed*, household unchanged; NOANS leaves the unit unowned with an attempt count |
| Step 7 · C-702 (E, G) | 8 | Separate household and case chips; priority change logged as not clinical; helper message; acceptance recorded |
| Step 8a / 8b · C-804 (A, E, G, H) | 4 + 13 | Manual welfare form defaults to *Not yet assessed*; required fields; interim update keeps everything open. In the contact form: required recipient, desk follow-up, “no call placed” in the history. *Taken over by a service* with “Other” evidence is refused and the case stays open. |
| Step 9a / 9b · Deadlines (B, D) | 4 + 12 | 09:45 “due 10:00”; 10:00 “Due now” (15 tasks, still covered, nothing logged as passed); 10:15 overdue (15, still Meena's, one entry each). Overdue group offers extend / check-in / reassign. Check-in leaves the task overdue. Extension needs a reason, keeps the owner and moves the deadline to 10:30. |
| Step 10 · Outcomes (A, E) | 8 | Household confirmed while the case stays open; close needs details and evidence; C-804 closed and household still Unconfirmed; “no answer” refused as a source |
| Step 11 · Correction (A, E) | 4 | Correction keeps the original entry; a confirmed household gets a new case and stays Confirmed |
| Step 12 · Update and coverage (I) | 12 | Totals only, “fewer than 5”, no unit numbers, no “everyone safe”; pending acceptances block coverage. Coverage first reached at 10:15; milestone text says it is not a safety measure. Banner isn't success-green; no success claims on the page; 12/12 guide steps done. |
| Tasks by owner (F) | 2 | Per-person counts; the Settings limit flags 19 > 10 |
| Regression | 13 | History filter shows the original and the correction; welfare details hidden by default in history and drawer; register and history CSV contents; state survives reload; Escape closes drawer and dialog; every grid cell has a text label |
| Gulmohar (J) | 33 | Detailed below |
| Palm Grove (J) | 5 | 5 valid / 2 errors / 1 warning; comma, duplicate and `Plot 4` / `Plot 04` handled; assignment on a villa id; list view without buildings |
| Reset, delete, 390 px | 9 | Reset with sample loaded; at 390 px no horizontal page scroll on queue, grid and history, and the drawer and dialog fit the screen; DELETE needed; delete clears the v2 and leftover v1 keys; reload starts empty |
| Whole run | 2 | No console or page errors; **no network requests** other than `file:`, `data:` or `blob:` |

The Gulmohar checks covered:

- **Import:** 12 valid, 4 errors, 2 warnings; ambiguity and qualification; the replace tick is required.
- **Identifiers:** `007`, `T2/08/03`, `Rose/101` and others preserved; searching for them.
- **Recording:** “channel not stated” recorded as such; an edit kept in the history; a desk task auto-accepted.
- **Bulk:** case-insensitive and slash identifiers; ambiguous bare `101`; `OK` on a unit with an open case keeps the case; priority order Urgent → Not yet assessed → Not urgent.
- **Cases:** unanswered contact; reopen with the previous outcome kept; withdraw.
- **Deadlines:** due now, then overdue, then reassigned (old task closed “was overdue”, new one pending).
- **Export:** the CSV keeps identifiers exactly.

### Problems found during testing, and fixes

| Found | Type | Fix |
|---|---|---|
| Grid labels on floor 10 truncated to “10…” at desktop width | Product | Status icon moved to the cell corner |
| KPI row left an empty column at 1440 px | Product | Flex layout with 6 / 3 / 2 cards per row |
| Unit list (the only view for irregular registers) hid the household and next-step columns at 390 px | Product | Stacked, labelled card per unit at ≤ 640 px |
| “Delete all data” left v1 data in the same browser | Product | Old storage key also removed |
| Footer claimed copy-to-clipboard was the only way data leaves the page | Wording | Now mentions CSV downloads |
| Three test-script errors: wrong tab for a check, a leftover search filter, and not waiting for the asynchronous copy | Test | Fixed in the test; no app change |

### Not tested

- **Other browsers and devices:** Firefox, Safari, Edge, a physical phone, touch interaction.
- **Assistive technology:** screen readers and full keyboard-only operation. Focus trapping in dialogs is not implemented.
- **Clipboard:** whether the copied text actually reached the system clipboard. The test checks only that the app recorded the copy.
- **Blocked storage:** behaviour when the browser blocks `localStorage`. The code path exists but was not exercised.
- **Demo timing:** a 10–15-minute run with a real presenter.
- **Very large registers** (thousands of units) and performance.
