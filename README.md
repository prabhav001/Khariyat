# Khairiyat (ख़ैरियत): clickable prototype, version 3

A roll-call and welfare follow-up desk for **one housing society** in Delhi-NCR, on the day after the Snap (2018).

Khairiyat helps the society's coordinator make sure that:

- every household is either confirmed or has someone responsible for checking it;
- every reported welfare concern has a next step that a named person has **accepted**, with a deadline;
- nothing is quietly dropped.

It is a coordination tool. It is not a safety guarantee, not an emergency service, and not a register of missing people.

> **All data is fictional.** Neelgiri Apartments, Gulmohar Enclave and Palm Grove Villas (all “Sector 00”), their units, every person and every message are invented.

What changed in version 3, and why, is in [`docs/DEMO-AND-DESIGN-REVIEW.md`](docs/DEMO-AND-DESIGN-REVIEW.md). Version 2's review is kept in [`docs/REVIEW-AND-CHANGES.md`](docs/REVIEW-AND-CHANGES.md).

---

## How to run it

1. Unzip the folder.
2. Double-click **`index.html`** to open it in a modern browser.

There is no server, install, internet connection, API key or external library.

- Progress is saved in the browser's local storage, so a reload keeps your place in the walkthrough.
- If the browser blocks local storage for local files, the demo still works but won't survive a reload.

| File | What it is |
|---|---|
| `index.html` | Page shell |
| `styles.css` | All styling (system fonts only) |
| `app.js` | State, rules, rendering, scenario and walkthrough |
| `docs/` | Review documents, change logs and test reports |
| `qa/e2e-check.js` | Optional automated browser check (needs Node and Playwright) |
| `qa/check-no-em-dash.js` | Optional check that no file contains an em dash (needs Node) |

---

## The scenario (fictional)

Yesterday at about 6:30 pm, half of all people everywhere vanished. This is the next morning at Neelgiri Apartments, Sector 00, Gurugram:

- **Size:** 4 towers and 160 flats. Roughly 550 people lived here before. That figure is a fictional estimate for context only; Khairiyat does not count people.
- **Households:** the loss is uneven. Some households lost no one, some lost a parent, partner, carer or child, and some flats haven't answered at all.
- **Staff and services:**
  - two of the five guards are gone;
  - Tower C's intercom panel is down;
  - the Tower B lift has stopped;
  - the market chemist is shut.
- **You** are Priya, the RWA secretary, running the desk from 09:00. Your job is not to find out who vanished. It is to make sure every household is reached, every welfare concern has a responsible next step, and nothing is dropped.

**Inside the app:** the full text is under **More → About this scenario**. The demo clock moves only when you press **+15 min**, so a morning is compressed into about 75 minutes.

---

## The model in one minute

- **Household** (per unit): *Unconfirmed* or *Confirmed*.
  - Confirmed means an adult in the household was reached, with the channel and reporter recorded, or a named source said the flat is away or vacant.
  - It never means everyone linked to the flat is safe.
- **Welfare case** (per unit, independent of the household): open, moving through *open → contact attempted → handoff agreed*.
  - Only an outcome recorded **with evidence** closes it.
  - A confirmed household can get a new case, and closing a case never confirms a household.
- **Next step** (one task per unresolved unit): an owner, a deadline and an acceptance.
  - *Needs an owner*
  - *Awaiting acceptance* (not counted as covered)
  - *Covered* (accepted, not past the deadline; **Due now** at the deadline minute)
  - *Overdue* (still the owner's task: check in, extend with a reason, or reassign)
- **Next-step coverage:** the share of unresolved units whose next step is covered. A coordination measure, never a safety measure.

---

## Screen layout

- **Header:** the demo clock with **+15 min**, **Bulk update**, and **More** (Import register, Export CSV, Handover summary, About this scenario, Settings, Reset demo, Delete all data).
- **Summary:**
  - households confirmed and unconfirmed;
  - open welfare cases;
  - a boxed group of the counts that need action: need an owner, awaiting acceptance, overdue, due now;
  - a neutral coverage line.
- **Unresolved work:** a **Next priority** line, then six groups in priority order:
  1. Welfare cases needing action
  2. Overdue: check with the owner
  3. Needs an owner
  4. Awaiting acceptance
  5. Welfare cases in progress
  6. Being followed up
- **Other tabs:**
  - **Unit register:** grid or list, search, filters, multi-select;
  - **Tasks by owner:** per-person load, with a soft warning;
  - **Society update:** totals only;
  - **History:** append-only.
- **Unit drawer:** separate sections for *Next step*, *Household* and *Welfare case*, each with only its valid actions, plus the unit's own history.
- **Walkthrough panel:**
  - one step at a time, with what has happened, exact actions, what you should see, why it matters, the step's messages, and a live **Done when** checklist that doubles as “still missing”;
  - **Back**, **Show me** and **Next step** (enabled only when the data shows the step is done);
  - a list of all 18 steps for going back or jumping ahead.
- **Desk inbox:** the scripted messages. Each is labelled with its step; the current step's messages are highlighted. A message counts as handled when its step is complete, or when you mark it handled.

On screens narrower than 1100 px, the walkthrough step appears above the work area and the inbox below it.

---

## Reset and complete the walkthrough (about 18–22 minutes)

**Reset first.** Choose **More → Reset demo (empty register)**, type `RESET`, and confirm. The clock returns to 09:00 and the walkthrough to step 1. Then follow the panel on the right; each step below matches it exactly. Press **+15 min** only when a step tells you to: an extra press makes deadlines pass, and the final review will say so.

### 09:00

1. **Import the register.**
   - Click **Import the register**, then the sample **Neelgiri Apartments (regular towers, scripted demo)**, then **Validate**.
   - A duplicate `C-1004` row and a row with no unit are flagged. Click **Import 160 units (skip 2)**.
2. **Vacant flats.**
   - **Show me** selects the six flats noted “no residents on record”.
   - Click **Confirm household: away / vacant…** and keep the source `Register note: no residents on record`.
3. **Guard's intercom round.**
   - Inbox → Ramesh → **Copy to bulk update** → **Validate**: all 95 lines are rejected (no channel).
   - Set **Channel for OK lines that don't name one** to **Intercom** → **Validate** (93 valid) → **Apply 93 valid lines**.
   - In the box, change `A-1O3` to `A-103` and delete `B-902,HELP`, then **Validate** → **Apply 1 valid line**.
4. **Self-reports and a rumour.**
   - Open A-402 → **Confirm: adult reached…** → **Message from the household**, reported by `Resident of A-402`, tick the adult box.
   - On the B-704 rumour, click **Mark handled** and record nothing.
5. **B-902 has lost her carer.**
   - **Show me** → **Confirm: adult reached…** → **Intercom**, `Guard room`; tick the adult box and **They reported someone who may need help**.
   - In the welfare form: **Adult who can't manage alone**, **Urgent**, source `Guard's intercom call`.
   - **Assign helper…** `Sunita (A-603)`, **+60 min**. Record her **YES** (**Phone call**).
6. **Hand out the flats nobody reached.** Use **Show me** three times:
   - Tower C floors 6–10 → `Arjun (C-304)`, +45 min;
   - floors 1–5 → `Farhan (B-703)`, +45 min;
   - Tower D floors 7–10 → `Meena (D-204)`, +60 min.

### +15 min → 09:15

7. **YES, NO, reassign.**
   - Under **Awaiting acceptance**, record Arjun's and Meena's YES, and Farhan's NO with reason `Children alone at home`.
   - His 19 flats return to **Needs an owner**: **Assign 19…** → `Rohit (B-501)`, +90 min. Record Rohit's YES (**In person at the desk**).

### +15 min → 09:30

8. **Arjun's report.** **Copy to bulk update** → **Validate** (the Hinglish line is flagged) → **Apply 19 valid lines**.
9. **C-702, child alone.**
   - **Set priority…** → **Urgent**, reason `Young child alone`.
   - **Assign helper…** `Dr. Kavita (A-201)`, +30 min. Record her YES (**Phone call**).
10. **C-804, daughter's worry.**
    - **Report a welfare concern…** → **Adult who can't manage alone**, priority **Not yet assessed**, source `Daughter's phone call`.
    - Assign `Nisha (D-503) + Imran (C-601)`, +30 min. Record their YES.

### +15 min → 09:45

11. **Interim updates.**
    - C-702: **Record interim update…** → **Helper is with the resident**, note `Aunt from D-603 on her way`, +60 min.
    - B-902: **Visit made: more help needed**, note `Neighbours bringing meals; daughter travelling`, +120 min.
12. **No answer, no commitment.**
    - C-804 → **Record “no answer”**.
    - **Record contact with a service or person…** → **Police (100)**, **Reached them, but no commitment yet**. Keep the follow-up with `Desk (coordinator)`, +60 min.

### +15 min → 10:00

13. **New concern at a confirmed household.**
    - Meena's flats now show **due now**: still hers, still covered.
    - D-502 → **Report a welfare concern…** → **Essentials (food, water, medicines)**, **Not yet assessed**, source `Neighbour's WhatsApp message`.
    - Assign `Nisha (D-503)`, +60 min. Record her YES.

### +15 min → 10:15

14. **Overdue list.**
    - Meena's 15 tasks are overdue and still hers. On her message: **Copy to bulk update** → **Validate** → **Apply 9 valid lines**.
    - In **Overdue**, click **Extend deadline…** for her remaining 6: +15 min, reason `Lift stopping; 6 flats left`.
15. **Outcomes with evidence.**
    - C-702: **Confirm: adult reached…** (**Door visit**, `Dr. Kavita (A-201)`). Then **Close case with outcome…** → **Care in place**, details `Aunt from D-603 staying with the child`, **Seen in person by a volunteer or helper**.
    - C-804: **Close case with outcome…** → **Resident located elsewhere and safe**, `With her son in Faridabad`, **Spoke to family or the carer**. Then **Confirm: away / vacant…** with source `Son phoned the desk`.
16. **Correction.**
    - B-203 → **Correct household status…**, reason `Guard entered B-203 by mistake; it was B-302`.
    - Then confirm B-302 (**Intercom**, `Guard room`).
17. **Everything accepted.**
    - **Needs an owner → Assign all 6 flats needing an owner…** → `Arjun (C-304)`, +60 min. Record his YES.
    - Coverage is recorded at 10:15.
18. **Final review.** **Society update → Copy update**, then **Open handover summary** in the walkthrough panel.

**The 23 scripted messages**, in walkthrough order:

| Arrives | Messages |
|---|---|
| at import | Ramesh's intercom list; A-402 resident; the B-704 rumour |
| after the guard's list is applied | Ramesh about B-902 |
| on assignment | Sunita's reply; Rohit's YES; Kavita's YES; the pair's YES; Nisha's YES; Arjun's second YES |
| 09:15 | Arjun's YES; Farhan's NO; Meena's YES |
| 09:30 | Arjun's report; then, once C-804's no answer is applied, the daughter's call |
| 09:45 | Kavita's update; Sunita's update; the pair's second visit |
| 10:00 | the D-502 report; Ramesh's B-203 correction |
| 10:15 | Meena running late; the aunt arrives at C-702; the C-804 son's call |

### The designed end state, and what “complete” means

**Step 18 is complete only when all of these hold:**

- steps 1–17 are true in the data **now**;
- all 23 messages have arrived and been actioned or marked handled;
- nothing needs an owner, awaits acceptance, or is due or overdue;
- a society update has been generated since coverage was reached.

**At 10:15 the summary shows:**

- **129 of 160** households confirmed.
- **31 unconfirmed**, each with an accepted owner and a deadline:
  - Meena: 6, due 10:30;
  - Rohit: 19, due 10:45;
  - Arjun: 6, due 11:15.
- **Two welfare cases deliberately open**, each with its reason:
  - **B-902:** long-term care not arranged. Sunita accepted; next report 11:45.
  - **D-502:** medicine not yet found. Nisha accepted; due 11:00.

Closing those cases to tidy the screen would be dishonest. The walkthrough is complete when nothing is unowned, unaccepted, overdue or unexplained; the emergency is not over.

If you press **+15 min** after finishing, Meena's tasks fall due at 10:30. Steps 17 and 18 then show as incomplete again, and the handover summary says why.

**Other things to try:**

- the two irregular registers: **More → Import register**, then *Gulmohar Enclave* or *Palm Grove Villas*;
- the workload limit in **Settings**;
- the history filters;
- *Hide welfare details*;
- **Export CSV**.

---

## Rules that apply everywhere

- **Evidence is never invented.**
  - A bulk `OK` line needs a channel (`INTERCOM`, `PHONE`, `VISIT`, `MESSAGE`, or `UNKNOWN` for “channel not stated”), unless you explicitly choose a batch channel for that paste.
  - Free text is flagged, never interpreted, and typos are flagged, never corrected.
  - “No answer” is never accepted as a source.
- **Acceptance** is recorded from what the person said: YES or NO, and how. A NO needs a reason and returns the units to *Needs an owner*. Tasks given to *Desk (coordinator)* are accepted automatically.
- **Deadlines:** upcoming, then **due now**, then **overdue**. An extension needs a reason. Reassigning closes the old task with a reason. Everything stays in the history.
- **Cases:**
  - recording a contact never closes a case;
  - closing needs an outcome, details and evidence;
  - *Taken over by a service* needs the service's confirmation or a sighting;
  - cases can be reopened, or withdrawn as entered in error, each with a reason.
- **Priority** is the coordinator's judgement (Urgent / Not yet assessed / Not urgent), never medical triage. “Not yet assessed” is the default on both the bulk and manual routes.
- **Volunteer safety:**
  - task messages say knock or call only;
  - never enter or force a door, and leave if unsafe;
  - call emergency services directly in an emergency.

  They contain no emergency numbers. Khairiyat never calls or messages anyone.
- **Registers:**
  - Unit identifiers are strings, kept exactly as written (`A-1204`, `T2/08/03`, `007`, `Villa 18A`).
  - Duplicates, missing identifiers and ambiguity are flagged, never guessed. The same identifier in two named buildings becomes `Building/ID`.
  - The grid is shown only when every unit has a building and a floor; otherwise the list.

---

## Privacy and security

**It demonstrates:**

- **Minimal data:** unit, household basis, concern category, outcome and evidence, owner and deadline. No names of missing people, no diagnoses.
- **Display only:** welfare details are hidden on screen by default. This is a display setting, not access control.
- **Limited messages:**
  - volunteer messages carry only what the task needs;
  - the society update is totals only, with welfare counts of 1–4 shown as “fewer than 5”.

**It does not provide:**

- accounts or permissions;
- encryption (data sits in this browser's `localStorage`);
- control over text once you paste it elsewhere;
- any real calls or messages.

A production version would need authenticated multi-user access, encryption, retention rules, a notice to residents, and compliance with India's IT (SPDI) Rules 2011 for health-related data.

---

## Known limitations

- **One device, no sync.** Acceptances and outcomes are only as accurate as what the coordinator records.
- **Gaming coverage.** Coverage can be gamed by assigning everything to the desk. The workload warning makes it visible but doesn't block it.
- **Scripted inbox.** It runs only for the Neelgiri register, and assumes roughly the walkthrough's order. Other paths are possible, but some messages may arrive early or never.
- **Re-importing** replaces the whole register (after an explicit tick).
- **Clipboard copy** was not verified at the operating-system level.
- **Accessibility.** In place:
  - text labels alongside colour;
  - focus outlines;
  - Escape closes dialogs;
  - the walkthrough's state is in text.

  Not screen-reader tested; dialogs don't trap focus. The narrow-screen layout uses CSS `display: contents` on the side panel, which some older browsers expose poorly to assistive technology.
- **Language.** English interface with Hindi labels only.

---

## Verification

See the test report in [`docs/DEMO-AND-DESIGN-REVIEW.md`](docs/DEMO-AND-DESIGN-REVIEW.md).

To re-run the automated checks (needs Node, and Playwright with Chromium):

```
npm install playwright        # once, if not installed
node qa/check-no-em-dash.js
node qa/e2e-check.js [screenshot-folder]
```
