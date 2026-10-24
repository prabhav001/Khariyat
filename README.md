# Khairiyat (ख़ैरियत): clickable prototype, version 2

A roll-call and welfare follow-up desk for **one housing society** in Delhi-NCR, on the day after the Snap (2018).

The desk works towards one coordination aim: **no unresolved household and no open welfare case without an accepted next step.** That aim is not a safety guarantee. Khairiyat never decides that anyone is safe, missing or in danger.

> **All data is fictional.** *Neelgiri Apartments*, *Gulmohar Enclave* and *Palm Grove Villas* (all “Sector 00”), their units, every person and every message are invented for this demo.

Version 2 follows a critical review of version 1 (items A–J). The review, the change log and the test report are in [`docs/REVIEW-AND-CHANGES.md`](docs/REVIEW-AND-CHANGES.md).

---

## How to run it

1. Unzip the folder.
2. Double-click **`index.html`** to open it in a modern browser.

There is no server, install, internet connection, API key or external library. Everything is plain HTML, CSS and JavaScript.

- Progress is saved in the browser's local storage, so a reload keeps it.
- **Demo & data → Reset demo** starts again. *Reset demo, Neelgiri register loaded* skips step 1.
- If the browser blocks local storage for local files, the demo still works but won't survive a reload. A notice says so.

| File | What it is |
|---|---|
| `index.html` | Page shell |
| `styles.css` | All styling (system fonts only) |
| `app.js` | The application: state, rules, rendering, demo scenario |
| `README.md` | This file |
| `docs/REVIEW-AND-CHANGES.md` | Critical review (A–J), change log, test report |
| `qa/e2e-check.js` | Optional automated browser check. Needs Node and Playwright; **not needed** to use the prototype. |

---

## The model in one minute

Each unit has two **independent** records:

| Record | Values | What it means |
|---|---|---|
| **Household** | Unconfirmed · पुष्टि बाकी / Confirmed · पुष्टि हुई | Confirmed means someone in the household was reached (channel and reporter recorded), or a named source said it is away or vacant. It is household-level, not a check on every person. |
| **Welfare case** | none / open / closed | Open cases move through *open → contact attempted → handoff agreed*. Only a recorded **outcome with evidence** closes a case. |

- Confirming a household never closes a case, and closing a case never confirms a household.
- A confirmed household can get a new concern.

Each unresolved unit (household unconfirmed, or a case open) has at most one **task**: one owner, a deadline, and an acceptance status.

| Next-step state | Meaning |
|---|---|
| **Needs an owner** | Nobody has been asked. |
| **Awaiting acceptance** | Assigned; the person hasn't said yes. **Not counted as covered.** |
| **Covered** | Accepted, and the deadline hasn't passed. At the deadline minute the task shows **Due now** and is still covered. |
| **Overdue** | The deadline has passed. The owner is unchanged; the desk checks in, extends with a reason, or reassigns. |

**Next-step coverage** is the share of unresolved units whose next step is covered. The app records when it first reaches 100%. It is styled neutrally, and every place it appears says it is **not a safety measure** and lists what is still outstanding.

---

## Screen layout

- **Header:**
  - the demo clock with **+15 min**;
  - Import register, Bulk update, Export CSV, Settings;
  - *Demo & data* (reset and delete).
- **KPIs:**
  - Households confirmed, Households unconfirmed, Open welfare cases;
  - Needs an owner, Awaiting acceptance, Overdue (with “due now”);
  - a neutral next-step coverage line.
- **Tabs:**
  - **Unresolved work (बाकी काम):** six groups.
    1. Welfare cases needing action, ordered Urgent → Not yet assessed → Not urgent.
    2. Overdue, with check in / extend / reassign.
    3. Needs an owner.
    4. Awaiting acceptance, with Record response.
    5. Welfare cases in progress.
    6. Being followed up.
  - **Unit register (फ़्लैट सूची):**
    - Search, plus filters for household, welfare, next step and building.
    - Grid view (only when every unit has a building and a floor) or list view.
    - Multi-select.
  - **Tasks by owner:** each person's load (accepted / awaiting / overdue / due now), a soft warning above the desk's limit, copyable messages.
  - **Society update:** totals only.
  - **History (इतिहास):** append-only, with filters.
- **Unit drawer:** summary chips, then sections for Next step, Household, Welfare case and the unit's history. Only valid actions are offered.
- **Demo guide:** a 12-step checklist that ticks off from the data. **Show me** jumps to the right place.
- **Desk inbox:** scripted messages that arrive as the clock moves and as you act. Some are in Hinglish. **Khairiyat never interprets them**; you decide what to record.

---

## The demo (12 guide steps, designed for about 10–15 minutes)

Start with **Demo & data → Reset demo**. The clock starts at **09:00**. The steps can be done in any order, but the scripted messages assume roughly this timeline. (The 10–15 minutes is a design target; it has not been timed with a presenter.)

### 09:00

1. **Import the register.**
   - *Import register → Neelgiri sample → Validate*: a duplicate `C-1004` row and a row with no unit identifier are flagged.
   - Import the 160 valid units. Every household starts Unconfirmed.
2. **Confirm the six vacant flats.**
   - *Show me* selects them, then *Confirm household — away / vacant…*.
   - The source is prefilled with the literal register note, nothing more.
3. **Apply the guard's intercom round.**
   - *Copy to bulk update → Validate.* Every `OK` line is rejected because none names a channel.
   - The guard's message says every call was on the intercom, so set *Channel for OK lines* to **Intercom** and validate again. Now 92 lines are valid; `A-1O3` (a letter O) and `B-204,HELP` (no category) stay flagged. Apply.
   - Then open **A-402** → *Confirm — adult reached*, channel *Message from the household*, reported by the resident.
4. **Split Tower C between two wardens.**
   - *Show me* selects floors 6–10: assign them to “Arjun (C-304)”, +45 min.
   - *Show me* again selects floors 1–5: assign them to “Farhan (B-703)”, +45 min.
   - Optional: select all 38 for one person to see the soft workload warning.
   - Both batches are **Awaiting acceptance**; coverage stays 0.

### +15 min → 09:15

5. **Record a YES and a NO, then reassign.**
   - Arjun replies YES and Farhan NO. Record both in *Awaiting acceptance → Record response…*. A NO needs a reason.
   - Farhan's 19 flats go back to **Needs an owner**: reassign them to “Rohit (B-501)” with +90 min, and record his YES in person.

### +15 min → 09:30

6. **Apply Arjun's reply.**
   - *Copy to bulk update → Validate*: the Hinglish line is flagged, not guessed. Each line names its own channel. Apply.
   - **C-702** opens a welfare case with priority *Not yet assessed*.
   - **C-804** and **C-1004** (no answer) need an owner.
   - **C-803** is confirmed away, with its source.
7. **C-702**, first part: *Set priority…* (Urgent), *Assign helper…* “Dr. Kavita (A-201)”, then record her YES.
8. **C-804**, first part:
   - After the relative's call: *Report a welfare concern* (Adult who can't manage alone).
   - Assign “Nisha (D-503) + Sunita (A-603)” and record their YES.
9. **Meena**, first part: *Show me* selects Tower D's 15 unowned flats. Assign them to “Meena (D-204)” with +30 min (deadline 10:00), and record her YES.

### +15 min → 09:45

- **Step 7, C-702:** *Record interim update* (Helper is with the resident) with a next deadline. The household stays Unconfirmed: only a child has been reached.
- **Step 8, C-804:**
  - Record “no answer”, then *Record contact…* → Police, *They agreed to act or take over*, with a recipient and reference.
  - The case stays open as **Handoff agreed — not yet confirmed**, with a follow-up owned by the desk.
  - Optional: try closing it as *Taken over by a service* with weak evidence. It is refused.

### +15 min → 10:00

- **Step 9:** Meena's 15 tasks show **Due now**. They are still covered, and nothing is overdue.
- The son's call, the grandmother update, Meena's “running late” message and the D-502 report arrive.

### +15 min → 10:15

- **Step 9:** the 15 tasks are **Overdue**, still Meena's. *Record check-in…*, then *Extend deadline…* with her reason (or reassign).
- **Step 10, outcomes with evidence:**
  - C-702: *Confirm — adult reached* (door visit, reported by the helper). The case stays open. Then *Close case*: Care in place, *Seen in person*.
  - C-804: *Close case*: Resident located elsewhere, *Spoke to family*. The household stays Unconfirmed; record it separately (*Confirm — away / vacant*, source: the son's call).
- **Step 11, a correction and a new concern:**
  - B-203 → *Correct household status…* with a reason, then confirm B-302.
  - D-502, already confirmed: *Report a welfare concern*. The household stays Confirmed.
- **Step 12, society update and coverage:**
  - *Society update → Copy update.*
  - Assign the remaining units and record acceptance. Coverage is recorded at 10:15, alongside what is still outstanding.

**Also try:**

- Settings: change the workload limit, then check *Tasks by owner*.
- Search the register (`c702`, an owner's name).
- *Hide welfare details* on and off.
- History filters such as *Corrections and edits*.
- Export CSV.
- The two irregular sample registers (below).

---

## Registers: identifiers are strings

**Format.** CSV, one row per unit, with an optional header:

- `UNIT` (also *FLAT*, *HOUSE*, *VILLA*, *PLOT*, *ID*) is required.
- `BUILDING` (or *TOWER*, *BLOCK*, *WING*), `FLOOR` and `NOTE` are optional.
- Without a header, columns are read in that order. Quoted fields are supported.

**What is checked:**

- Identifiers are kept exactly as written: `A-1204`, `B2-307`, `T2/08/03`, `007`, `Villa 18A`, `Shop 3`. Nothing is inferred from their format.
- Rejected rows: a missing identifier, a duplicate row (also after trimming spaces), a comma inside an identifier, identifiers over 40 characters, and notes over 60 characters.
- **Ambiguity is never guessed.** Two identifiers that differ only by letter case or spacing are both rejected.
- The same identifier in two named buildings is kept and qualified as `Building/ID` (`Rose/101`, `Lily/101`), with a warning. A bare `101` in a bulk line is then flagged as ambiguous.
- `Plot 4` and `Plot 04` are both imported, with a warning to check that they are different units.

**Layout:**

- The **grid** is used only when every unit has a building and a floor. It sizes itself from the register.
- Otherwise the **list** is used. There is no floor-plan editor.
- Building, floor and note can be edited per unit, with a history entry. The identifier can't; re-import to change it.

**Fictional samples** (Import → *Insert a fictional sample*):

| Sample | Shows |
|---|---|
| Neelgiri Apartments | The scripted demo: 4 towers × 10 floors × 4 units. A duplicate row and a missing identifier are flagged. |
| Gulmohar Enclave | Irregular buildings: `A-1204`, `B2-G01`, `T2/08/03`, `007`, `Shop 3` (no building), `101` in two buildings, a trailing-space duplicate, a case-only ambiguity. |
| Palm Grove Villas | Independent homes, no buildings or floors: `Villa 18A`, `Plot 4` / `Plot 04`, a quoted identifier with a comma (rejected), a duplicate. |

Every feature works with imported registers: search, assignment, acceptance, cases, bulk updates, history and export. The scripted inbox and the demo guide only follow Neelgiri.

---

## Bulk update: strict `UNIT,CODE[,DETAIL]`

| Line | Effect |
|---|---|
| `C-701,OK,VISIT` | Household confirmed: adult reached. A channel is **required**: `INTERCOM`, `PHONE`, `VISIT`, `MESSAGE` or `UNKNOWN` (recorded as “Channel not stated”). |
| `C-803,AWAY,family phoned warden` | Household confirmed as away or vacant, with that source. “No answer” is refused as a source. |
| `C-804,NOANS` | An attempt on the unit's open task. The task closes and the unit needs a new owner. Not evidence of anything. |
| `C-702,HELP,CHILD` | A welfare case opens (`CHILD`, `ADULT`, `MEDICAL` or `ESSENTIALS`) with priority **Not yet assessed**, the same default as the manual form. |

- **Channels.** Lines without a channel are rejected, unless you choose a **batch channel** because the reporter told you how every contact was made. Entries record that the channel came from the batch setting. Khairiyat never fills in a channel or a source by itself.
- **Free text** in English or Hinglish is flagged, never interpreted.
- **Typos.** A letter O typed for a zero gets a “did you mean” hint but is not changed.
- **Duplicates and no-ops.** Duplicate units in one paste are flagged. `OK` on an already-confirmed household is a no-op. `OK` on a unit with an open case confirms the household and keeps the case.
- **Preview.** Errors are listed first. Only valid lines are applied, and error lines stay in the box.

---

## Rules that apply everywhere

- **Acceptance.** Recorded by the coordinator from what the person said: YES or NO, plus how they said it. A NO needs a reason and returns the units to *Needs an owner*. Tasks given to “Desk (coordinator)” are accepted automatically, because they are the coordinator's own.
- **Deadlines.** Upcoming before the deadline, **due now** at it, **overdue** after it. Overdue never removes the owner. Extensions need a reason. Reassignment closes the old task with a reason, and both stay in the history.
- **Cases.**
  - Contact with a service or person is recorded with its result: no reply, reached but no commitment, or handoff agreed. Recording it never closes the case. If nobody owns the next step, a follow-up owner and deadline are required.
  - Closing needs an outcome, details, **evidence** and who recorded it. *Taken over by a service* needs the service's confirmation or someone seeing it.
  - Cases can be reopened, or withdrawn as entered in error, with a reason.
- **Priority** is the coordinator's judgement (Urgent / Not yet assessed / Not urgent). It is not medical triage. Every welfare form says: *if anyone may be in immediate danger, call emergency services directly now; don't wait for this desk.*
- **Volunteer safety.** Every task message says:
  - knock or call only;
  - don't enter a home or force a door;
  - don't stay anywhere unsafe;
  - call emergency services directly in an emergency.

  Messages contain no emergency numbers. The contact form says Khairiyat places no calls and that the numbers in Settings haven't been verified for every location.
- **Workload.** A soft warning above a per-person limit (default 20 open tasks, editable in Settings). The limit is an assumption, not a standard. It never blocks.

---

## Privacy and security: what this prototype does and does not do

**It demonstrates:**

- **Minimal data:** unit, household basis, case concern category, outcome and evidence, owner and deadline. No names of missing people, no ID numbers, no diagnoses.
- **Welfare details hidden on screen by default.** This is a display setting, **not access control**.
- **Limited-information messages:**
  - wardens see unit numbers and the reply format only;
  - a helper's message names only their own case's reported concern;
  - the society update is totals only, with welfare counts of 1–4 shown as “fewer than 5”.
- **Careful wording:** “Unconfirmed” and “no answer” are never treated as evidence that anyone has vanished or needs help.

**It does not provide:**

- **Accounts or permissions:** no accounts, logins or role-based access. Acceptance is the coordinator's record of what someone said, not a signature.
- **Confidentiality:** data sits in the browser's `localStorage`, which is **not encrypted**. Anyone using that browser profile can read it.
- **Control over copied text:** once pasted into WhatsApp or SMS, it lives on those phones.
- **Real calls or messages:** Khairiyat never dials, sends or posts anything. The only ways data leaves the page are text you copy and CSV files you download.

**A production version would need:** authenticated multi-user access with server-side permissions, encryption, retention and deletion rules, a notice to residents, and compliance with India's IT (SPDI) Rules 2011 for health-related data.

---

## Known limitations

- **One device, no sync** (the approved scope). Acceptance and outcomes are only as accurate as what the coordinator records.
- **Coverage can be gamed:** assigning everything to the desk makes it “covered” at once. *Tasks by owner* and the workload warning make this visible but don't prevent it.
- **Demo clock:** time moves only with **+15 min**.
- **Scripted inbox:** only for the Neelgiri register. If you take a different path, some messages may never arrive.
- **Re-importing replaces the whole register** (after an explicit tick). There is no merge.
- **Identifiers** can't contain commas and can't be renamed in place.
- **Clipboard:** copy uses the Clipboard API, falling back to `execCommand`. If both fail, the text is selected for manual copying. Clipboard contents were **not verified** in testing.
- **Accessibility:** the following are in place:
  - semantic buttons and labels;
  - focus styles;
  - text alongside colour, and an `aria-label` on every grid cell;
  - Escape closes dialogs and the drawer.

  Not screen-reader tested; dialogs don't trap focus.
- **No dark mode.** English interface with Hindi labels only.

---

## Verification performed

See [`docs/REVIEW-AND-CHANGES.md`](docs/REVIEW-AND-CHANGES.md) for the full test report.

- `node --check` passes for `app.js` and `qa/e2e-check.js`.
- The automated run uses **headless Chromium** (Playwright 1.56.1). It loads `index.html` from disk (`file://`).
  - It covers the 12 demo steps, the A–J acceptance checks and the regression checks.
  - **185 of 185 checks passed** on three consecutive runs, with no console errors and no network requests.
- **Not verified:**
  - Firefox, Safari, Edge or a physical phone;
  - screen readers;
  - actual clipboard contents;
  - demo timing with a real presenter.

To re-run the automated check (needs Node and Playwright with Chromium):

```
npm install playwright        # once, if not installed
node qa/e2e-check.js [screenshot-folder]
```
