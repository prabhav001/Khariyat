/*!
 * Khairiyat (ख़ैरियत): roll-call and welfare follow-up desk for one housing society.
 * Clickable prototype, version 2. Plain JavaScript: no libraries, no network requests, no backend.
 * Every society, unit, person and message in this file is fictional.
 *
 * Model (see docs/REVIEW-AND-CHANGES.md):
 *  - Household status per unit: Unconfirmed | Confirmed (with a recorded basis). Household-level only.
 *  - Welfare case per unit, independent of the household status: open (stage) | closed (outcome + evidence).
 *  - At most one open task per unit, with one owner, a deadline, and acceptance: pending | accepted.
 *  - Coverage: an unresolved unit is covered only when its open task is accepted and not past its deadline.
 */
(() => {
  'use strict';

  // ── Configuration ──────────────────────────────────────────────────────────
  const STORAGE_KEY = 'khairiyat-prototype-v2';
  const OLD_KEYS = ['khairiyat-prototype-v1']; // earlier prototype versions; removed by "Delete all data"
  const START = 9 * 60; // demo clock starts at 09:00 on the day after the Snap
  const STEP = 15; // minutes added by the "+15 min" control
  const DESK_OWNER = 'Desk (coordinator)';
  const DEADLINES = [15, 30, 45, 60, 90, 120];

  // Fictional sample building used for the scripted demo only. The importer imposes none of this.
  const SAMPLE = { name: 'Neelgiri Apartments', place: 'Sector 00, Gurugram', towers: ['A', 'B', 'C', 'D'], floors: 10, units: 4 };
  const SAMPLE_SOCIETY = `${SAMPLE.name}, ${SAMPLE.place}`;
  const VACANT = ['A-904', 'B-1001', 'C-303', 'C-1002', 'D-403', 'D-802'];

  const HOUSEHOLD = {
    unconfirmed: { en: 'Unconfirmed', hi: 'पुष्टि बाकी', icon: '○' },
    confirmed: { en: 'Confirmed', hi: 'पुष्टि हुई', icon: '✓' }
  };
  const CONCERN = {
    CHILD: 'Child without an adult',
    ADULT: 'Adult who can’t manage alone',
    MEDICAL: 'Medical need reported',
    ESSENTIALS: 'Essentials (food, water, medicines)'
  };
  const PRIORITY = { urgent: 'Urgent', unknown: 'Not yet assessed', routine: 'Not urgent' };
  const PRIORITY_RANK = { urgent: 0, unknown: 1, routine: 2 };
  const CHANNEL = { INTERCOM: 'Intercom', PHONE: 'Phone call', VISIT: 'Door visit', MESSAGE: 'Message from the household', UNKNOWN: 'Channel not stated' };
  const STAGE = {
    open: 'Open: no handoff yet',
    contacted: 'Contact attempted: no commitment yet',
    acknowledged: 'Handoff agreed: not yet confirmed'
  };
  const CONTACT_RESULT = {
    NOREPLY: 'Couldn’t get through / no reply',
    ATTEMPT: 'Reached them, but no commitment yet',
    ACK: 'They agreed to act or take over (handoff agreed, not yet confirmed)'
  };
  const OUTCOME = {
    CARE: { label: 'Care in place', ask: 'Who is now caring for the resident?', ph: 'e.g. Grandmother is with the child' },
    TRANSFERRED: { label: 'Taken over by a service', ask: 'Which service took over, and the reference', ph: 'e.g. Childline team took the child, ref 4471', needs: ['SERVICE', 'SEEN'] },
    NOHELP: { label: 'Checked: no help needed', ask: 'Who checked, and what they found', ph: 'e.g. Visited; resident managing on her own' },
    ELSEWHERE: { label: 'Resident located elsewhere and safe', ask: 'Where, according to whom', ph: 'e.g. With her son in Faridabad' },
    WITHDRAWN: { label: 'Withdrawn: entered in error' }
  };
  const EVIDENCE = {
    SEEN: 'Seen in person by a volunteer or helper',
    RESIDENT: 'Spoke to the resident directly',
    FAMILY: 'Spoke to family or the carer',
    SERVICE: 'The service confirmed it has taken over',
    OTHER: 'Other (explain in the details)'
  };
  const TASK_TYPE = { check: 'Household check', welfare: 'Welfare visit', followup: 'Follow-up' };
  const ACCEPT_VIA = { MESSAGE: 'Reply by WhatsApp or SMS', PHONE: 'Phone call', PERSON: 'In person at the desk' };
  const INTERIM = ['Helper is with the resident', 'Visit made: more help needed', 'Other update'];
  const PEOPLE = [
    ['Arjun (C-304)', 'Floor warden'],
    ['Farhan (B-703)', 'Floor warden'],
    ['Rohit (B-501)', 'Floor warden'],
    ['Meena (D-204)', 'Floor warden'],
    ['Sunita (A-603)', 'Volunteer'],
    ['Nisha (D-503) + Imran (C-601)', 'Volunteer pair'],
    ['Dr. Kavita (A-201)', 'Volunteer, doctor'],
    ['Nisha (D-503)', 'Volunteer, nurse'],
    [DESK_OWNER, 'Coordinator: own tasks are accepted automatically'],
    ['Guard room', 'Reporter']
  ];

  // ── Small helpers ──────────────────────────────────────────────────────────
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const hhmm = (min) => {
    if (min == null) return 'not set';
    const day = Math.floor(min / 1440);
    const m = ((min % 1440) + 1440) % 1440;
    return `${pad(Math.floor(m / 60))}:${pad(m % 60)}${day > 0 ? ` (+${day}d)` : ''}`;
  };
  const dur = (min) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h ? `${h} h ${m} min` : `${m} min`;
  };
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many || `${one}s`}`;
  const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
  const natCmp = (a, b) => collator.compare(String(a || ''), String(b || ''));
  const normKey = (s) => String(s == null ? '' : s).trim().replace(/\s+/g, ' ').toUpperCase();
  const floorNum = (fl) => (/^-?\d+$/.test(String(fl == null ? '' : fl).trim()) ? Number(fl) : null);
  const uniq = (arr) => [...new Set(arr)];

  function cmpUnitIn(s, a, b) {
    const A = s.flats[a];
    const B = s.flats[b];
    if (!A || !B) return natCmp(a, b);
    if (!!A.building !== !!B.building) return A.building ? -1 : 1;
    const cb = natCmp(A.building, B.building);
    if (cb) return cb;
    const fa = floorNum(A.floor);
    const fb = floorNum(B.floor);
    if (fa != null && fb != null && fa !== fb) return fa - fb;
    const cf = natCmp(A.floor, B.floor);
    if (cf) return cf;
    return natCmp(A.id, B.id);
  }
  const cmpUnit = (a, b) => cmpUnitIn(state, a, b);

  const householdChip = (st, small) =>
    `<span class="chip-status st-${st}${small ? ' sm' : ''}"><span aria-hidden="true">${HOUSEHOLD[st].icon}</span> Household ${HOUSEHOLD[st].en.toLowerCase()} <span class="hi" lang="hi">· ${HOUSEHOLD[st].hi}</span></span>`;
  const caseChip = (small) => `<span class="chip-status st-case${small ? ' sm' : ''}"><span aria-hidden="true">◆</span> Welfare case open <span class="hi" lang="hi">· हालचाल जाँच</span></span>`;
  const priorityBadge = (p) => `<span class="badge pr-${p}">${p === 'unknown' ? 'Priority not yet assessed' : PRIORITY[p]}</span>`;

  // ── Sample registers (all fictional) ───────────────────────────────────────
  function neelgiriIds() {
    const out = [];
    SAMPLE.towers.forEach((t) => {
      for (let fl = 1; fl <= SAMPLE.floors; fl++) for (let u = 1; u <= SAMPLE.units; u++) out.push(`${t}-${fl * 100 + u}`);
    });
    return out;
  }
  function sampleNeelgiriCsv() {
    const lines = ['UNIT,TOWER,FLOOR,NOTE'];
    neelgiriIds().forEach((id) => {
      const t = id[0];
      const fl = Math.floor(Number(id.slice(2)) / 100);
      lines.push(`${id},Tower ${t},${fl},${VACANT.includes(id) ? 'no residents on record' : ''}`);
      if (id === 'C-1004') {
        lines.push('C-1004,Tower C,10,'); // exact duplicate row: flagged on purpose
        lines.push(',Tower C,11,'); // missing unit identifier: flagged on purpose
      }
    });
    return lines.join('\n');
  }
  const SAMPLES = {
    neelgiri: { label: 'Neelgiri Apartments (regular towers, scripted demo)', society: SAMPLE_SOCIETY, csv: sampleNeelgiriCsv },
    irregular: {
      label: 'Gulmohar Enclave (irregular buildings)',
      society: 'Gulmohar Enclave, Sector 00, Faridabad',
      csv: () => [
        'UNIT,BUILDING,FLOOR,NOTE',
        'A-1204,Tower A,12,',
        'A-1205,Tower A,12,',
        'A-1301,Tower A,13,top floor',
        'B2-307,Block B2,3,',
        'B2-308,Block B2,3,',
        'B2-G01,Block B2,G,ground floor',
        'T2/08/03,Tower 2,8,',
        'T2/08/04,Tower 2,8,',
        '007,Annexe,1,staff quarters',
        '101,Rose,1,',
        '101,Lily,1,',
        '102,Lily,1,',
        'Shop 3,,,',
        ',Tower A,12,',
        'B2-307 ,Block B2,3,',
        'b2-308,Block B2,3,'
      ].join('\n')
    },
    homes: {
      label: 'Palm Grove Villas (independent homes, no towers or floors)',
      society: 'Palm Grove Villas, Sector 00, Noida',
      csv: () => ['UNIT,NOTE', 'Villa 17,', 'Villa 18,', 'Villa 18A,', 'Plot 4,', 'Plot 04,', '"Farmhouse 2, back lane",owner abroad', 'Villa 17,'].join('\n')
    }
  };

  // Guard's intercom round for the Neelgiri demo: no channel on each line, on purpose.
  function guardRoundLines() {
    const skipA = ['A-904', 'A-402', 'A-302', 'A-604', 'A-1003'];
    const skipB = ['B-1001', 'B-302', 'B-704'];
    const lines = [];
    neelgiriIds().forEach((id) => {
      const t = id[0];
      const fl = Math.floor(Number(id.slice(2)) / 100);
      if (t === 'A') {
        if (id === 'A-103') lines.push('A-1O3,OK'); // letter O instead of zero, on purpose
        else if (!skipA.includes(id)) lines.push(`${id},OK`);
      } else if (t === 'B') {
        if (id === 'B-902') lines.push('B-902,HELP'); // concern category missing, on purpose (step 5)
        else if (!skipB.includes(id)) lines.push(`${id},OK`); // includes B-203, which was really B-302
      } else if (t === 'D' && fl <= 6 && id !== 'D-403') lines.push(`${id},OK`);
    });
    return lines;
  }

  // ── Scripted demo messages (Neelgiri register only) ────────────────────────
  // Each message belongs to one walkthrough step. It arrives once its condition has held for
  // `delay` demo-minutes. Khairiyat never interprets them: the coordinator decides what to record.
  const MSG_SPECS = [
    {
      id: 'guard',
      label: 'Ramesh (guard room): intercom list',
      step: 3,
      delay: 0,
      expect: 'Arrives when the register is imported.',
      cond: (s) => s.order.length > 0,
      build: () => {
        const lines = guardRoundLines();
        return {
          from: 'Ramesh, guard room',
          channel: 'Intercom round, typed up by the guard',
          text: 'Raat bhar intercom kiya, saari calls intercom se hi. Tower A, B aur D ki list neeche hai. Kai gharon ne bataya ki ghar ka koi nahi raha; humne sirf likha ki phone kisne uthaya. Tower C ka intercom panel band hai. Suresh aur Pappu kal se nahi hain, hum do hi guard bache hain.',
          translation: '“We rang flats through the night, every call on the intercom. The list for Towers A, B and D is below. Many homes said someone in the family is gone; we only noted who answered. Tower C’s intercom panel is down. Suresh and Pappu (guards) have been gone since yesterday; only two of us are left.”',
          lines: lines.join('\n'),
          lineCount: lines.length,
          reporter: 'Guard room (intercom round)',
          hint: 'Step 3. The lines don’t name a channel, but Ramesh says every call was on the intercom: choose Intercom as the batch channel. Fix the A-1O3 typo and hold back the B-902 line.'
        };
      }
    },
    {
      id: 'a402',
      label: 'A-402 resident: WhatsApp message',
      step: 4,
      delay: 0,
      expect: 'Arrives when the register is imported.',
      cond: (s) => !!s.flats['A-402'],
      build: () => ({
        from: 'Resident of A-402, society WhatsApp group',
        channel: 'WhatsApp group',
        text: 'A-402: main aur bachche theek hain. Mere pati kal shaam se nahi hain. Abhi koi madad nahi chahiye. 🙏',
        translation: '“A-402: the children and I are fine. My husband has been gone since yesterday evening. We don’t need help right now.”',
        flat: 'A-402',
        hint: 'Step 4. Confirm the household from her own message. Khairiyat records the household, not who is gone.'
      })
    },
    {
      id: 'rumour704',
      label: 'B-801 resident: rumour about B-704',
      step: 4,
      delay: 0,
      expect: 'Arrives when the register is imported.',
      cond: (s) => !!s.flats['B-704'],
      build: () => ({
        from: 'Resident of B-801, society WhatsApp group',
        channel: 'WhatsApp group',
        text: 'B-704 wali family shayad gayab ho gayi hai. Kal se koi awaaz nahi aayi.',
        translation: '“The B-704 family have probably vanished. No sound from there since yesterday.”',
        flat: 'B-704',
        hint: 'Step 4. A guess is not a source. Record nothing for B-704, and mark this message handled.'
      })
    },
    {
      id: 'b902',
      label: 'Ramesh: about the B-902 line',
      step: 5,
      delay: 0,
      expect: 'Arrives once the guard’s list has been applied (step 3).',
      cond: (s) => !!s.flags.guardApplied,
      build: () => ({
        from: 'Ramesh, guard room',
        channel: 'Intercom, guard to desk',
        text: 'B-902 wali line: Bhalla aunty ne khud intercom uthaya tha. Unki attendant kal se nahi hai. Woh wheelchair par hain aur Tower B ki lift band hai. Kal raat se kuch khaya nahi.',
        translation: '“About the B-902 line: Mrs Bhalla answered the intercom herself. Her live-in attendant has been gone since yesterday. She uses a wheelchair and the Tower B lift has stopped. She hasn’t eaten since last night.”',
        flat: 'B-902',
        hint: 'Step 5. She answered, so her household can be confirmed. Her situation is a separate welfare concern.'
      })
    },
    {
      id: 'sunitaYes',
      label: 'Sunita: reply',
      step: 5,
      delay: 0,
      expect: 'Arrives as soon as you assign the B-902 visit.',
      cond: (s) => pendingOn(s, 'B-902', /^sunita/i),
      build: () => ({
        from: 'Sunita (A-603), volunteer',
        channel: 'Phone call to the desk',
        text: 'Haan, main abhi B-902 jaati hoon, kuch khaana le kar.',
        translation: '“Yes, I’ll go to B-902 now and take some food.”',
        flat: 'B-902',
        hint: 'Step 5. Record her YES (Phone call).'
      })
    },
    {
      id: 'arjunYes',
      label: 'Arjun: reply',
      step: 7,
      delay: STEP,
      expect: 'Arrives 15 demo-minutes after you assign Arjun.',
      cond: (s) => pendingOf(s, /^arjun/i).length > 0,
      build: (s) => {
        const n = pendingOf(s, /^arjun/i).length;
        return {
          from: 'Arjun (C-304), floor warden',
          channel: 'WhatsApp, warden to desk',
          text: `YES. ${n} flats le liye, seedhiyon se shuru kar raha hoon.`,
          translation: `“YES. I’ve taken the ${n} flats; starting on the stairs now.”`,
          hint: 'Step 7. Record his YES (Reply by WhatsApp or SMS).'
        };
      }
    },
    {
      id: 'farhanNo',
      label: 'Farhan: reply',
      step: 7,
      delay: STEP,
      expect: 'Arrives 15 demo-minutes after you assign Farhan.',
      cond: (s) => pendingOf(s, /^farhan/i).length > 0,
      build: () => ({
        from: 'Farhan (B-703), floor warden',
        channel: 'WhatsApp, warden to desk',
        text: 'NO, sorry. Meri wife kal shaam se nahi hai. Bachche ghar par akele hain, main aaj nahi nikal sakta.',
        translation: '“NO, sorry. My wife has been gone since yesterday evening. The children are alone at home; I can’t go out today.”',
        hint: 'Step 7. Record the NO with his reason. His flats go back to “Needs an owner”.'
      })
    },
    {
      id: 'meenaYes',
      label: 'Meena: reply',
      step: 7,
      delay: STEP,
      expect: 'Arrives 15 demo-minutes after you assign Meena.',
      cond: (s) => pendingOf(s, /^meena/i).length > 0,
      build: () => ({
        from: 'Meena (D-204), floor warden',
        channel: 'WhatsApp, warden to desk',
        text: 'YES, Tower D ki upar wali manzilein main dekh leti hoon.',
        translation: '“YES, I’ll take Tower D’s upper floors.”',
        hint: 'Step 7. Record her YES (Reply by WhatsApp or SMS).'
      })
    },
    {
      id: 'rohitYes',
      label: 'Rohit: reply',
      step: 7,
      delay: 0,
      expect: 'Arrives as soon as you assign Rohit.',
      cond: (s) => pendingOf(s, /^rohit/i).length > 0,
      build: () => ({
        from: 'Rohit (B-501), at the desk',
        channel: 'In person at the desk',
        text: 'Haan, Farhan wale flats main le leta hoon.',
        translation: '“Yes, I’ll take Farhan’s flats.”',
        hint: 'Step 7. Record his YES (In person at the desk).'
      })
    },
    {
      id: 'arjunReport',
      label: 'Arjun: report for his flats',
      step: 8,
      delay: STEP,
      expect: 'Arrives 15 demo-minutes after you record Arjun’s YES.',
      cond: (s) => tasksOf(s, /^arjun/i).some((t) => t.type === 'check' && t.accept === 'accepted'),
      build: (s) => {
        const ts = tasksOf(s, /^arjun/i).filter((t) => t.type === 'check' && t.accept === 'accepted').sort((a, b) => cmpUnitIn(s, a.flatId, b.flatId));
        const special = { 'C-702': 'C-702,HELP,CHILD', 'C-804': 'C-804,NOANS', 'C-803': 'C-803,AWAY,family phoned warden', 'C-1004': 'C-1004,NOANS' };
        const lines = ['C-804 mein do baar bell bajayi, koi jawab nahi'].concat(ts.map((t) => special[t.flatId] || `${t.flatId},OK,VISIT`));
        return {
          from: 'Arjun (C-304), floor warden',
          channel: 'WhatsApp, warden to desk',
          text: 'Meri list ho gayi. C-804 mein do baar bell bajayi, koi jawab nahi. Bahut gharon mein koi na koi nahi raha; maine sirf likha ki kisse baat hui. Baaki neeche.',
          translation: '“My list is done. Rang C-804’s bell twice, no answer. Many homes have lost someone; I only noted who I spoke to. The rest is below.”',
          lines: lines.join('\n'),
          lineCount: lines.length,
          reporter: 'Arjun (C-304)',
          hint: 'Step 8. The first line is free text and will be flagged. Every other line names its own channel.'
        };
      }
    },
    {
      id: 'kavitaYes',
      label: 'Dr. Kavita: reply',
      step: 9,
      delay: 0,
      expect: 'Arrives as soon as you assign the C-702 visit.',
      cond: (s) => pendingOn(s, 'C-702', /kavita/i),
      build: () => ({
        from: 'Dr. Kavita (A-201), volunteer',
        channel: 'Phone call to the desk',
        text: 'Haan, main jaa rahi hoon. Das minute mein pahunchungi.',
        translation: '“Yes, I’m going. I’ll be there in ten minutes.”',
        flat: 'C-702',
        hint: 'Step 9. Record her YES (Phone call).'
      })
    },
    {
      id: 'rel804',
      label: 'Daughter of the C-804 resident: phone call',
      step: 10,
      delay: 0,
      expect: 'Arrives once C-804’s “no answer” has been recorded (step 8).',
      cond: (s) => !!s.flats['C-804'] && hasEventIn(s, 'C-804', 'outcome', /no answer/i),
      build: () => ({
        from: 'Caller on the desk phone',
        channel: 'Desk phone',
        text: 'Meri mummy C-804 mein akeli rehti hain. Subah se phone nahi utha rahi. Unki umar 78 hai. Main Dwarka mein hoon, aa nahi sakti.',
        translation: '“My mother lives alone in C-804. She hasn’t answered her phone since morning. She is 78. I’m in Dwarka and can’t get there.”',
        flat: 'C-804',
        hint: 'Step 10. A worry is a reason to check, not proof of anything.'
      })
    },
    {
      id: 'pairYes',
      label: 'Nisha and Imran: reply',
      step: 10,
      delay: 0,
      expect: 'Arrives as soon as you assign the C-804 visit to the pair.',
      cond: (s) => pendingOn(s, 'C-804', /\+/),
      build: () => ({
        from: 'Nisha (D-503) + Imran (C-601), volunteers',
        channel: 'WhatsApp, volunteers to desk',
        text: 'YES, hum dono saath jaate hain.',
        translation: '“YES, the two of us will go together.”',
        flat: 'C-804',
        hint: 'Step 10. Record their YES.'
      })
    },
    {
      id: 'kavitaUpdate',
      label: 'Dr. Kavita: update from C-702',
      step: 11,
      delay: STEP,
      expect: 'Arrives 15 demo-minutes after Kavita accepts.',
      cond: (s) => acceptedOn(s, 'C-702', /kavita/i) && !!caseIn(s, s.flats['C-702']),
      build: () => ({
        from: 'Dr. Kavita (A-201), volunteer',
        channel: 'Phone call to the desk',
        text: 'Main C-702 mein hoon. Bachchi theek hai, uske mummy papa kal raat se ghar nahi aaye. Uski bua D-603 mein rehti hain; maine phone kiya, woh aa rahi hain. Tab tak main yahin hoon.',
        translation: '“I’m at C-702. The girl is fine; her parents haven’t come home since last night. Her aunt lives in D-603; I phoned her and she’s coming. I’ll stay until then.”',
        flat: 'C-702',
        hint: 'Step 11. An update, not an outcome. The case stays open and the household stays Unconfirmed.'
      })
    },
    {
      id: 'sunitaUpdate',
      label: 'Sunita: update from B-902',
      step: 11,
      delay: 45,
      expect: 'Arrives 45 demo-minutes after Sunita accepts (09:45 in the walkthrough).',
      cond: (s) => acceptedOn(s, 'B-902', /^sunita/i) && !!caseIn(s, s.flats['B-902']),
      build: () => ({
        from: 'Sunita (A-603), volunteer',
        channel: 'Phone call to the desk',
        text: 'B-902 mein hoon. Aunty ne khaana kha liya. B-901 wale dopahar aur raat ka khaana denge. Unki beti Pune se kal aane ki koshish kar rahi hai. Lambi dekhbhaal ka intezaam abhi nahi hua.',
        translation: '“I’m at B-902. Aunty has eaten. The B-901 family will bring lunch and dinner. Her daughter in Pune is trying to get here tomorrow. Longer-term care isn’t arranged yet.”',
        flat: 'B-902',
        hint: 'Step 11. Progress, not an outcome: her care isn’t settled, so the case stays open.'
      })
    },
    {
      id: 'pairUpdate',
      label: 'Nisha and Imran: second visit to C-804',
      step: 12,
      delay: STEP,
      expect: 'Arrives 15 demo-minutes after the pair accepts.',
      cond: (s) => acceptedOn(s, 'C-804', /\+/) && !!caseIn(s, s.flats['C-804']),
      build: () => ({
        from: 'Nisha (D-503) + Imran (C-601), volunteers',
        channel: 'WhatsApp, volunteers to desk',
        text: 'C-804: dobara gaye. Bell bajayi, darwaza khatkhataya, phone kiya. Koi jawab nahi. Padosi ne kal shaam se nahi dekha. Humne darwaza nahi khola.',
        translation: '“C-804: went again. Rang, knocked, phoned. No answer. The neighbour hasn’t seen her since yesterday evening. We didn’t open the door.”',
        flat: 'C-804',
        hint: 'Step 12. Record the no answer, then record your own call to the police.'
      })
    },
    {
      id: 'd502',
      label: 'D-501 resident: about D-502',
      step: 13,
      delay: 0,
      expect: 'Arrives at 10:00.',
      cond: (s) => s.clock >= START + 60 && !!s.flats['D-502'] && s.flats['D-502'].status === 'confirmed',
      build: () => ({
        from: 'Resident of D-501, society WhatsApp group',
        channel: 'WhatsApp group',
        text: 'D-502 wali aunty ki BP ki dawai khatam ho gayi hai. Market ka chemist kal se nahi khula. Kal se dawai nahi li.',
        translation: '“The lady in D-502 has run out of her blood-pressure medicine. The market chemist hasn’t opened since yesterday. She hasn’t taken it since yesterday.”',
        flat: 'D-502',
        hint: 'Step 13. A new concern at a household that was already confirmed at 09:00.'
      })
    },
    {
      id: 'nishaYes',
      label: 'Nisha: reply',
      step: 13,
      delay: 0,
      expect: 'Arrives as soon as you assign the D-502 visit.',
      cond: (s) => pendingOn(s, 'D-502', /^nisha \(d-503\)$/i),
      build: () => ({
        from: 'Nisha (D-503), volunteer',
        channel: 'Phone call to the desk',
        text: 'Haan. Sector 14 wala chemist shayad khula hai, main dekh kar aati hoon.',
        translation: '“Yes. The chemist in Sector 14 may be open; I’ll go and see.”',
        flat: 'D-502',
        hint: 'Step 13. Record her YES (Phone call).'
      })
    },
    {
      id: 'guardfix',
      label: 'Ramesh: B-203 correction',
      step: 16,
      delay: 0,
      expect: 'Arrives at 10:00.',
      cond: (s) => s.clock >= START + 60 && !!s.flats['B-203'] && hasEventIn(s, 'B-203', 'status', /guard/i),
      build: () => ({
        from: 'Ramesh, guard room',
        channel: 'Intercom, guard to desk',
        text: 'Sorry sir, list mein galti se B-203 likh diya tha, woh B-302 tha. B-203 se baat nahi hui.',
        translation: '“Sorry, I wrote B-203 on the list by mistake: it was B-302. I didn’t speak to B-203.”',
        flat: 'B-203',
        hint: 'Step 16. Correct B-203 (the history keeps both entries), then confirm B-302.'
      })
    },
    {
      id: 'meenaLate',
      label: 'Meena: running late',
      step: 14,
      delay: 0,
      expect: 'Arrives once Meena’s deadline has passed (10:15 in the walkthrough).',
      cond: (s) => tasksOf(s, /^meena/i).some((t) => t.accept === 'accepted' && s.clock > t.due),
      build: (s) => {
        const ts = tasksOf(s, /^meena/i).filter((t) => t.type === 'check').sort((a, b) => cmpUnitIn(s, a.flatId, b.flatId));
        const done = ts.slice(0, Math.max(0, ts.length - 6));
        const left = ts.length - done.length;
        const lines = done.map((t) => (t.flatId === 'D-901' ? `${t.flatId},OK,PHONE` : `${t.flatId},OK,VISIT`));
        return Object.assign({
          from: 'Meena (D-204), floor warden',
          channel: 'WhatsApp, warden to desk',
          text: `Thodi der ho gayi. ${done.length} flats ho gaye (neeche), ${left} baaki hain. Lift ruk ruk ke chal rahi hai. 15 minute aur do.`,
          translation: `“Sorry, running late. ${done.length} flats done (below), ${left} left. The lift keeps stopping. Give me 15 more minutes.”`,
          reporter: 'Meena (D-204)',
          hint: 'Step 14. Apply her lines, then extend her remaining tasks with her reason.'
        }, lines.length ? { lines: lines.join('\n'), lineCount: lines.length } : {});
      }
    },
    {
      id: 'auntArrives',
      label: 'Dr. Kavita: the aunt has arrived',
      step: 15,
      delay: 30,
      expect: 'Arrives 30 demo-minutes after Kavita’s interim update (10:15 in the walkthrough).',
      cond: (s) => {
        const c = caseIn(s, s.flats['C-702']);
        return !!(c && c.updates.length > 0);
      },
      build: () => ({
        from: 'Dr. Kavita (A-201), volunteer',
        channel: 'Phone call to the desk',
        text: 'Bua aa gayi hain aur yahin rahengi. Bachchi unke saath hai, dono theek hain. Maine dono ko saath dekha hai. Ab main ghar ja rahi hoon.',
        translation: '“The aunt has arrived and will stay here. The girl is with her; both are fine. I’ve seen them together. I’m heading home now.”',
        flat: 'C-702',
        hint: 'Step 15. An adult is now responsible in the flat, and a volunteer saw it.'
      })
    },
    {
      id: 'son804',
      label: 'Son of the C-804 resident: phone call',
      step: 15,
      delay: 30,
      expect: 'Arrives 30 demo-minutes after you record the police call (10:15 in the walkthrough).',
      cond: (s) => {
        const c = caseIn(s, s.flats['C-804']);
        return !!(c && c.contacts.length);
      },
      build: () => ({
        from: 'Caller on the desk phone',
        channel: 'Desk phone',
        text: 'Main C-804 wali aunty ka beta bol raha hoon. Mummy kal dopahar se mere paas Faridabad mein hain, unka phone ghar par reh gaya. Abhi unse baat karke phone kar raha hoon. Didi ko pata nahi tha.',
        translation: '“I’m the son of the lady in C-804. Mum has been with me in Faridabad since yesterday afternoon; her phone was left at home. I’m calling right after speaking to her. My sister didn’t know.”',
        flat: 'C-804',
        hint: 'Step 15. New information that replaces the earlier worry. Record the outcome and the household separately.'
      })
    },
    {
      id: 'arjunMore',
      label: 'Arjun: reply',
      step: 17,
      delay: 0,
      expect: 'Arrives as soon as you assign Arjun the remaining flats.',
      cond: (s) => s.clock >= START + 60 && pendingOf(s, /^arjun/i).length > 0,
      build: (s) => {
        const n = pendingOf(s, /^arjun/i).length;
        return {
          from: 'Arjun (C-304), floor warden',
          channel: 'WhatsApp, warden to desk',
          text: `YES, ye ${n} bhi dekh leta hoon. Pehle B-704 jaunga.`,
          translation: `“YES, I’ll take these ${n} as well. I’ll go to B-704 first.”`,
          hint: 'Step 17. Record his YES.'
        };
      }
    }
  ];
  const specOf = (id) => MSG_SPECS.find((sp) => sp.id === id);

  // ── State ──────────────────────────────────────────────────────────────────
  function defaultSettings() {
    return {
      society: SAMPLE_SOCIETY,
      coordinator: 'Priya M. (RWA secretary)',
      desk: '+91 00000 00000 (demo number)',
      guard: 'the guard room on Intercom 9',
      workloadWarn: 20,
      contacts: [
        { label: 'Police', number: '100' },
        { label: 'Ambulance', number: '108' },
        { label: 'Childline', number: '1098' }
      ]
    };
  }
  function freshMessages() {
    const m = {};
    MSG_SPECS.forEach((sp) => { m[sp.id] = { status: 'pending', condAt: null, arrivedAt: null, seq: 0, handled: false, data: null }; });
    return m;
  }
  function freshState(settings) {
    return {
      v: 2,
      scenario: null,
      clock: START,
      startedAt: null,
      coverAt: null,
      seq: 1,
      flats: {},
      order: [],
      tasks: {},
      cases: {},
      events: [],
      msgs: freshMessages(),
      flags: {},
      settings: settings || defaultSettings()
    };
  }

  let storageOk = true;
  function load() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || s.v !== 2 || !s.flats || !Array.isArray(s.order)) return null;
      s.msgs = Object.assign(freshMessages(), s.msgs || {});
      s.flags = s.flags || {};
      s.settings = Object.assign(defaultSettings(), s.settings || {});
      return s;
    } catch (e) {
      storageOk = false;
      return null;
    }
  }
  function save() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      if (storageOk) toast('This browser blocked local storage. The demo still works, but changes won’t survive a reload.', 'warn');
      storageOk = false;
    }
  }

  let state = load() || freshState();
  const ui = {
    tab: 'queue',
    q: '',
    fHousehold: 'all',
    fCase: 'all',
    fNext: 'all',
    fBuilding: 'all',
    view: 'grid',
    selecting: false,
    sel: new Set(),
    hideWelfare: true,
    histQ: '',
    histKind: 'all',
    drawer: null,
    drawerNotice: null,
    revealCase: false,
    collapsed: { 6: true },
    guideOpen: true,
    stepsOpen: false,
    inboxOpen: typeof window !== 'undefined' ? window.innerWidth > 900 : true,
    msgOpen: new Set(),
    lastFocus: null,
    lastFocusModal: null
  };

  // ── Derived data ───────────────────────────────────────────────────────────
  function openTaskIn(s, f) {
    const t = f && f.taskId ? s.tasks[f.taskId] : null;
    return t && t.status === 'open' ? t : null;
  }
  function caseIn(s, f) {
    const c = f && f.caseId ? s.cases[f.caseId] : null;
    return c && c.status === 'open' ? c : null;
  }
  function tasksOf(s, re) {
    return Object.values(s.tasks).filter((t) => t.status === 'open' && re.test(t.owner));
  }
  const pendingOf = (s, re) => tasksOf(s, re).filter((t) => t.accept === 'pending');
  function hasEventIn(s, flat, kind, re) {
    return s.events.some((e) => e.flatId === flat && e.kind === kind && (!re || re.test(e.text)));
  }
  const tasksAll = (s, flat) => Object.values(s.tasks).filter((t) => t.flatId === flat);
  const acceptedOn = (s, flat, re) => tasksAll(s, flat).some((t) => t.accept === 'accepted' && (!re || re.test(t.owner)));
  const pendingOn = (s, flat, re) => tasksAll(s, flat).some((t) => t.status === 'open' && t.accept === 'pending' && (!re || re.test(t.owner)));
  const caseAny = (s, flat) => Object.values(s.cases).filter((c) => c.flatId === flat).pop() || null;
  const openTask = (f) => openTaskIn(state, f);
  const caseOf = (f) => caseIn(state, f);
  // A deadline "by 09:45" includes 09:45: upcoming before it, "due now" at it, overdue after it.
  const dueState = (t) => (!t ? null : state.clock < t.due ? 'upcoming' : state.clock === t.due ? 'due' : 'overdue');
  const isOverdue = (t) => !!t && state.clock > t.due;
  const unresolved = (f) => f.status === 'unconfirmed' || !!caseOf(f);
  // resolved | none (needs an owner) | pending (awaiting acceptance) | overdue | covered
  function coverage(f) {
    if (!unresolved(f)) return 'resolved';
    const t = openTask(f);
    if (!t) return 'none';
    if (isOverdue(t)) return 'overdue';
    if (t.accept !== 'accepted') return 'pending';
    return 'covered';
  }
  function stats() {
    const s = { total: 0, confirmed: 0, unconfirmed: 0, cases: 0, unresolved: 0, none: 0, pending: 0, overdue: 0, covered: 0, dueNow: 0, coveredUnconfirmed: 0 };
    state.order.forEach((id) => {
      const f = state.flats[id];
      s.total++;
      s[f.status]++;
      if (caseOf(f)) s.cases++;
      const c = coverage(f);
      if (c !== 'resolved') { s.unresolved++; s[c]++; }
      if (c === 'covered' && f.status === 'unconfirmed') s.coveredUnconfirmed++;
      const t = openTask(f);
      if (t && dueState(t) === 'due') s.dueNow++;
    });
    s.gaps = s.none + s.pending + s.overdue;
    return s;
  }
  function basisText(b) {
    if (!b) return '';
    if (b.kind === 'adult') return `adult reached via ${CHANNEL[b.channel] || b.channel}${b.fromBatch ? ' (batch setting)' : ''}, reported by ${b.by}`;
    if (b.kind === 'away') return `away / vacant (source: ${b.source}), recorded by ${b.by}`;
    return '';
  }
  const dueLabel = (t) => {
    const ds = dueState(t);
    return ds === 'due' ? `due now (${hhmm(t.due)})` : ds === 'overdue' ? `overdue since ${hhmm(t.due)}` : `due ${hhmm(t.due)}`;
  };
  function dueHtml(t) {
    const ds = dueState(t);
    if (ds === 'due') return `<span class="badge due">Due now</span> ${hhmm(t.due)}`;
    if (ds === 'overdue') return `<span class="badge danger">Overdue since ${hhmm(t.due)}</span>`;
    return `due ${hhmm(t.due)}`;
  }
  function ownerLoad(name) {
    const k = normKey(name);
    return Object.values(state.tasks).filter((t) => t.status === 'open' && normKey(t.owner) === k).length;
  }
  const layoutReady = () => state.order.length > 0 && state.order.every((id) => state.flats[id].building && state.flats[id].floor);
  function shortLabel(f) {
    if (!f.building) return f.id;
    const tok = f.building.trim().split(/\s+/).pop();
    const sep = f.id.charAt(tok.length);
    if (f.id.length > tok.length + 1 && f.id.slice(0, tok.length).toUpperCase() === tok.toUpperCase() && /[-/ ]/.test(sep)) return f.id.slice(tok.length + 1);
    return f.id;
  }
  function findUnit(text) {
    const k = normKey(text);
    if (!k) return null;
    return state.order.find((id) => normKey(id) === k) || null;
  }
  const societyShort = () => String(state.settings.society || '').split(',')[0].trim() || 'our society';

  // ── Mutations (every change is logged) ────────────────────────────────────
  function log(flatId, kind, text, reason, sensitive) {
    state.events.push({ id: state.seq++, t: state.clock, flatId: flatId || null, kind, text, reason: reason || '', sensitive: sensitive || '' });
  }
  function createTask(id, type, owner, due, contact, batch) {
    const tid = `T${state.seq++}`;
    const auto = normKey(owner) === normKey(DESK_OWNER);
    state.tasks[tid] = {
      id: tid, flatId: id, type, owner, contact: contact || '', due, createdAt: state.clock, batch: batch || tid,
      accept: auto ? 'accepted' : 'pending', acceptedAt: auto ? state.clock : null, acceptedVia: auto ? 'Coordinator’s own task' : null,
      status: 'open', outcome: null, closedAt: null, extensions: []
    };
    state.flats[id].taskId = tid;
    return state.tasks[tid];
  }
  function closeTask(t, outcome) {
    t.status = 'closed';
    t.outcome = outcome;
    t.closedAt = state.clock;
    const f = state.flats[t.flatId];
    if (f && f.taskId === t.id) f.taskId = null;
  }

  function importRegister(rows, society) {
    const settings = Object.assign({}, state.settings, society ? { society } : {});
    const clock = state.clock;
    state = freshState(settings);
    state.clock = clock;
    rows.forEach((r) => {
      state.flats[r.key] = { id: r.key, rawId: r.id, building: r.building || '', floor: r.floor || '', note: r.note || '', status: 'unconfirmed', basis: null, taskId: null, caseId: null, lastCaseId: null, attempts: 0 };
      state.order.push(r.key);
    });
    state.order.sort(cmpUnit);
    const ids = neelgiriIds();
    state.scenario = state.order.length === ids.length && ids.every((id) => state.flats[id] && state.flats[id].building === `Tower ${id[0]}`) ? 'neelgiri' : null;
    state.startedAt = state.clock;
    log(null, 'register', `Register imported: ${plural(rows.length, 'unit')}${state.scenario ? ' (Neelgiri demo register)' : ''}. Roll-call started at ${hhmm(state.clock)}. Every household starts as Unconfirmed.`);
  }

  function actConfirm(id, basis) {
    const f = state.flats[id];
    if (!f) return { error: `${id} isn’t in the register.` };
    if (f.status === 'confirmed') return { error: `${id}’s household is already confirmed.` };
    const t = openTask(f);
    let closed = null;
    if (t && t.type === 'check') { closeTask(t, 'Household confirmed'); closed = t; }
    f.status = 'confirmed';
    f.basis = Object.assign({ at: state.clock }, basis);
    const c = caseOf(f);
    log(id, 'status', `Household Unconfirmed → Confirmed (${basisText(f.basis)}).${closed ? ` ${closed.owner}’s household check closed.` : ''}${c ? ' The open welfare case stays open: confirming the household doesn’t close it.' : ''}`);
    return { ok: true, caseOpen: !!c };
  }

  function actOpenCase(id, { concern, priority, source, note }) {
    const f = state.flats[id];
    if (caseOf(f)) return { error: `${id} already has an open welfare case. Add an update to it instead.` };
    const t = openTask(f);
    if (t) closeTask(t, 'Welfare concern reported: needs a helper');
    const cid = `W${state.seq++}`;
    const pr = priority || 'unknown';
    state.cases[cid] = { id: cid, flatId: id, concern, priority: pr, source, note: note || '', openedAt: state.clock, status: 'open', stage: 'open', updates: [], contacts: [], outcome: null, closedAt: null, reopened: [] };
    f.caseId = cid;
    log(id, 'welfare', `Welfare case opened. Household stays ${HOUSEHOLD[f.status].en}. Source: ${source}. Priority: ${PRIORITY[pr]}.${t ? ` ${t.owner}’s ${TASK_TYPE[t.type].toLowerCase()} closed.` : ''} Needs a helper.`, '', `Concern: ${CONCERN[concern]}${note ? ` (${note})` : ''}`);
    return { ok: true };
  }

  function actSetPriority(id, priority, reason) {
    const f = state.flats[id];
    const c = caseOf(f);
    if (!c) return { error: 'No open welfare case.' };
    if (c.priority === priority) return { error: 'That is already the priority.' };
    const was = c.priority;
    c.priority = priority;
    log(id, 'case', `Priority: ${PRIORITY[was]} → ${PRIORITY[priority]} (coordinator’s judgement, not a clinical assessment).`, reason);
    return { ok: true };
  }

  function actAssign(ids, owner, due, contact) {
    const batch = `B${state.seq++}`;
    const created = [];
    const skipped = [];
    ids.forEach((id) => {
      const f = state.flats[id];
      if (!f || !unresolved(f)) { skipped.push(id); return; }
      const old = openTask(f);
      const c = caseOf(f);
      let type = c ? 'welfare' : 'check';
      if (old) {
        if (old.type === 'followup' && c) type = 'followup';
        const st = dueState(old);
        if (st === 'overdue') state.flags.overdueHandled = true;
        closeTask(old, `Reassigned to ${owner}${st === 'overdue' ? ' (was overdue)' : st === 'due' ? ' (was due now)' : ''}${old.accept === 'pending' ? ' (never accepted)' : ''}`);
      }
      const t = createTask(id, type, owner, due, contact, batch);
      created.push(t);
      log(id, 'task', `${old ? `Reassigned from ${old.owner}` : 'Assigned'}: ${TASK_TYPE[type].toLowerCase()} → ${owner}, deadline ${hhmm(due)}. ${t.accept === 'accepted' ? 'Coordinator’s own task (accepted).' : 'Awaiting acceptance: not counted as covered yet.'}`);
    });
    return { created, skipped };
  }

  function actRespond(taskIds, { response, via, reason }) {
    let n = 0;
    taskIds.forEach((tid) => {
      const t = state.tasks[tid];
      if (!t || t.status !== 'open' || t.accept !== 'pending') return;
      if (response === 'accepted') {
        t.accept = 'accepted';
        t.acceptedAt = state.clock;
        t.acceptedVia = ACCEPT_VIA[via];
        log(t.flatId, 'task', `${t.owner} accepted the ${TASK_TYPE[t.type].toLowerCase()} (${ACCEPT_VIA[via]}). Deadline ${hhmm(t.due)}.`);
      } else {
        closeTask(t, `Declined by ${t.owner}`);
        log(t.flatId, 'task', `${t.owner} declined the ${TASK_TYPE[t.type].toLowerCase()} (${ACCEPT_VIA[via]}). Back to the coordinator: needs an owner.`, reason);
      }
      n++;
    });
    if (n) state.flags[response === 'accepted' ? 'acceptRecorded' : 'declineRecorded'] = true;
    return { n };
  }

  function actExtend(taskIds, due, reason) {
    let n = 0;
    taskIds.forEach((tid) => {
      const t = state.tasks[tid];
      if (!t || t.status !== 'open') return;
      const st = dueState(t);
      if (st === 'overdue') state.flags.overdueHandled = true;
      const was = t.due;
      t.due = due;
      t.extensions.push({ at: state.clock, from: was, to: due, reason });
      log(t.flatId, 'task', `Deadline extended for ${t.owner}: ${hhmm(was)} → ${hhmm(due)}${st === 'overdue' ? ' (was overdue)' : st === 'due' ? ' (was due now)' : ''}.${t.accept === 'pending' ? ' Still awaiting acceptance.' : ''}`, reason);
      n++;
    });
    return { n };
  }

  function actCheckin(taskIds, note) {
    taskIds.forEach((tid) => {
      const t = state.tasks[tid];
      if (!t || t.status !== 'open') return;
      log(t.flatId, 'task', `Check-in with ${t.owner} recorded: “${note}”. Task unchanged (${dueLabel(t)}).`);
    });
    return { ok: true };
  }

  function actNoAnswer(id, note) {
    const f = state.flats[id];
    const t = openTask(f);
    if (!t) return { error: 'There is no open task. “No answer” records an attempt on an assigned task, so assign someone first.' };
    closeTask(t, 'No answer');
    f.attempts = (f.attempts || 0) + 1;
    log(id, 'outcome', `${TASK_TYPE[t.type]} by ${t.owner}: no answer (attempt ${f.attempts}). Not evidence that anyone has vanished or needs help. Needs a new owner.${caseOf(f) ? ' The welfare case stays open.' : ''}`, '', note || '');
    return { ok: true };
  }

  function actInterim(id, { type, note, due }) {
    const f = state.flats[id];
    const c = caseOf(f);
    const t = openTask(f);
    if (!c) return { error: 'No open welfare case.' };
    if (!t) return { error: 'Assign an owner first: an interim update needs someone responsible for the next step.' };
    const was = t.due;
    t.due = due;
    c.updates.push({ at: state.clock, type, note: note || '', by: t.owner });
    log(id, 'case', `Interim update from ${t.owner}: ${type}. Case stays open. Next report due ${hhmm(due)}${was !== due ? ` (was ${hhmm(was)})` : ''}.`, '', note || '');
    return { ok: true };
  }

  function actContact(id, { who, result, recipient, reference, followOwner, followDue }) {
    const f = state.flats[id];
    const c = caseOf(f);
    if (!c) return { error: 'No open welfare case.' };
    c.contacts.push({ at: state.clock, who, result, recipient: recipient || '', reference: reference || '' });
    if (result === 'ACK') c.stage = 'acknowledged';
    else if (c.stage === 'open') c.stage = 'contacted';
    let t = openTask(f);
    let next;
    if (followOwner) {
      if (t) closeTask(t, `Replaced by a follow-up for ${followOwner}`);
      t = createTask(id, 'followup', followOwner, followDue);
      next = ` Follow-up → ${followOwner}, deadline ${hhmm(followDue)}${t.accept === 'accepted' ? ' (accepted)' : ' (awaiting acceptance)'}.`;
    } else next = t ? ` Next step stays with ${t.owner} (${dueLabel(t)}).` : '';
    log(id, 'case', `Contact recorded with ${who}: ${CONTACT_RESULT[result]}${recipient ? ` (${recipient})` : ''}${reference ? `, ref ${reference}` : ''}. Khairiyat placed no call. Case stays open: ${STAGE[c.stage]}.${next}`);
    return { ok: true };
  }

  function actCloseCase(id, { outcome, detail, evidence, by }) {
    const f = state.flats[id];
    const c = caseOf(f);
    if (!c) return { error: 'No open welfare case.' };
    const need = OUTCOME[outcome].needs;
    if (need && !need.includes(evidence)) {
      return { error: `“${OUTCOME[outcome].label}” needs evidence that the service has actually taken over: “The service confirmed it has taken over” or “Seen in person”. A call or a promise isn’t enough. Keep the case open with a follow-up.` };
    }
    const t = openTask(f);
    if (t) closeTask(t, `Case closed: ${OUTCOME[outcome].label}`);
    c.status = 'closed';
    c.outcome = { type: outcome, detail, evidence, by, at: state.clock };
    c.closedAt = state.clock;
    f.caseId = null;
    f.lastCaseId = c.id;
    log(id, 'case', `Welfare case closed: ${OUTCOME[outcome].label}. Evidence: ${EVIDENCE[evidence]}. Recorded by ${by}. Household status unchanged: ${HOUSEHOLD[f.status].en}.${f.status === 'unconfirmed' ? ' The household still needs to be accounted for separately.' : ''}`, '', detail);
    return { ok: true, unconfirmed: f.status === 'unconfirmed' };
  }

  function actWithdrawCase(id, reason) {
    const f = state.flats[id];
    const c = caseOf(f);
    if (!c) return { error: 'No open welfare case.' };
    const t = openTask(f);
    if (t) closeTask(t, 'Case withdrawn (entered in error)');
    c.status = 'closed';
    c.outcome = { type: 'WITHDRAWN', detail: reason, evidence: 'OTHER', by: state.settings.coordinator, at: state.clock };
    c.closedAt = state.clock;
    f.caseId = null;
    f.lastCaseId = c.id;
    log(id, 'correction', `Correction: welfare case withdrawn as entered in error. Household status unchanged (${HOUSEHOLD[f.status].en}). The original entries stay in the history.`, reason);
    return { ok: true };
  }

  function actReopenCase(id, reason) {
    const f = state.flats[id];
    if (caseOf(f)) return { error: 'There is already an open case.' };
    const c = f.lastCaseId && state.cases[f.lastCaseId];
    if (!c) return { error: 'No earlier case to reopen.' };
    c.reopened.push({ at: state.clock, reason, previous: c.outcome });
    const prev = c.outcome ? OUTCOME[c.outcome.type].label : 'none';
    c.status = 'open';
    c.outcome = null;
    c.closedAt = null;
    f.caseId = c.id;
    log(id, 'correction', `Correction: welfare case reopened (previous outcome “${prev}” kept in the history). Needs an owner.`, reason);
    return { ok: true };
  }

  function actCorrectHousehold(id, reason) {
    const f = state.flats[id];
    if (f.status !== 'confirmed') return { error: 'Only a confirmed household can be corrected back to Unconfirmed.' };
    const was = basisText(f.basis);
    f.status = 'unconfirmed';
    f.basis = null;
    log(id, 'correction', `Correction: household Confirmed → Unconfirmed. Previous entry kept: “${was}”.${caseOf(f) ? ' The open welfare case is unaffected.' : ''}`, reason);
    return { ok: true };
  }

  function actEditUnit(id, { building, floor, note }, reason) {
    const f = state.flats[id];
    const changes = [];
    [['building', building], ['floor', floor], ['note', note]].forEach(([k, v]) => {
      if ((f[k] || '') !== v) { changes.push(`${k} “${f[k] || 'empty'}” → “${v || 'empty'}”`); f[k] = v; }
    });
    if (!changes.length) return { error: 'Nothing changed.' };
    state.order.sort(cmpUnit);
    log(id, 'edit', `Unit details edited: ${changes.join('; ')}. The unit identifier is unchanged.`, reason);
    return { ok: true };
  }

  function openTaskStates() {
    const m = new Map();
    Object.values(state.tasks).forEach((t) => { if (t.status === 'open') m.set(t.id, dueState(t)); });
    return m;
  }
  function advanceClock() {
    const before = openTaskStates();
    state.clock += STEP;
    const nowDue = [];
    const nowOver = [];
    openTaskStates().forEach((st, id) => {
      if (st === before.get(id)) return;
      if (st === 'due') nowDue.push(state.tasks[id]);
      if (st === 'overdue') nowOver.push(state.tasks[id]);
    });
    nowOver.forEach((t) => log(t.flatId, 'task', `Deadline passed: ${TASK_TYPE[t.type].toLowerCase()} by ${t.owner} was due ${hhmm(t.due)}${t.accept === 'pending' ? ' and was never accepted' : ''}. Still ${t.owner}’s task: check in, extend with a reason, or reassign.`));
    commit();
    const msg = [`Demo clock: ${hhmm(state.clock)}.`];
    if (nowDue.length) msg.push(`${plural(nowDue.length, 'task')} due now.`);
    if (nowOver.length) msg.push(`${plural(nowOver.length, 'task')} just went overdue (${uniq(nowOver.map((t) => t.owner)).join(', ')}).`);
    toast(msg.join(' '), nowOver.length || nowDue.length ? 'warn' : '');
  }

  // ── Bulk update: strict UNIT,CODE[,DETAIL] lines ──────────────────────────
  const CODES = ['OK', 'AWAY', 'NOANS', 'HELP'];
  function parseBulk(text, by, batchChannel) {
    const rows = [];
    const seen = {};
    (text || '').split(/\r?\n/).forEach((raw, i) => {
      const line = raw.trim();
      if (!line) return;
      const row = { n: i + 1, raw: line, level: 'err', msg: '' };
      rows.push(row);
      const parts = line.split(',').map((x) => x.trim());
      const unitTxt = parts[0] || '';
      const code = (parts[1] || '').toUpperCase();
      const detail = parts[2] || '';
      const key = findUnit(unitTxt);
      if (parts.length < 2 || (!key && !CODES.includes(code))) {
        row.msg = 'Not a UNIT,CODE[,DETAIL] line. Khairiyat doesn’t interpret free text: record it by hand if it matters.';
        return;
      }
      if (parts.length > 3) { row.msg = 'Too many commas. Keep DETAIL short and without commas.'; return; }
      if (!key) {
        const qualified = state.order.filter((id) => id.includes('/') && normKey(id.split('/').pop()) === normKey(unitTxt));
        const alt = findUnit(unitTxt.replace(/[oO]/g, '0'));
        row.msg = qualified.length
          ? `“${unitTxt}” is ambiguous in this register: use ${qualified.join(' or ')}.`
          : `Unknown unit “${unitTxt}”: not in the register.${alt ? ` Did you mean ${alt}? (A letter O typed instead of a zero.) It was not changed automatically.` : ''}`;
        return;
      }
      row.flat = key;
      row.code = code;
      row.detail = detail;
      if (seen[key]) {
        row.msg = `Same unit as line ${seen[key].n}. Keep one line per unit.`;
        seen[key].level = 'err';
        seen[key].msg = `Same unit as line ${row.n}. Keep one line per unit.`;
        return;
      }
      seen[key] = row;
      const f = state.flats[key];
      const t = openTask(f);
      const c = caseOf(f);
      if (code === 'OK') {
        let ch = detail.toUpperCase();
        let fromBatch = false;
        if (!ch) {
          if (batchChannel && batchChannel !== 'REQUIRE') { ch = batchChannel; fromBatch = true; } else {
            row.msg = 'OK needs a channel: INTERCOM, PHONE, VISIT, MESSAGE or UNKNOWN. Or choose a batch channel above, if the reporter told you how every contact was made.';
            return;
          }
        }
        if (!CHANNEL[ch]) { row.msg = `Unknown channel “${detail}”. Use INTERCOM, PHONE, VISIT, MESSAGE or UNKNOWN.`; return; }
        if (f.status === 'confirmed') { row.level = 'warn'; row.msg = 'Household already confirmed: no change.'; return; }
        row.level = c ? 'okwarn' : 'ok';
        row.channel = ch;
        row.fromBatch = fromBatch;
        row.msg = `Household → Confirmed · adult reached via ${CHANNEL[ch]}${fromBatch ? ' (channel from batch setting)' : ''} · reported by ${by || 'not stated'}${c ? ' · the open welfare case stays open' : ''}`;
      } else if (code === 'AWAY') {
        if (!detail) { row.msg = 'AWAY needs a source, e.g. “C-803,AWAY,family phoned warden”.'; return; }
        if (detail.length > 40) { row.msg = 'Source is longer than 40 characters.'; return; }
        if (/^(no ?answer|noans|silent|nobody answered|koi jawab nahi)/i.test(detail)) { row.msg = '“No answer” isn’t a source for AWAY. Use NOANS instead.'; return; }
        if (f.status === 'confirmed') { row.level = 'warn'; row.msg = 'Household already confirmed: no change.'; return; }
        row.level = c ? 'okwarn' : 'ok';
        row.msg = `Household → Confirmed · away / vacant (source: ${detail})${c ? ' · the open welfare case stays open' : ''}`;
      } else if (code === 'NOANS') {
        if (detail) { row.msg = 'NOANS takes no detail.'; return; }
        if (!t) { row.msg = 'No open task for this unit. NOANS records an attempt on an assigned task.'; return; }
        row.level = 'ok';
        row.msg = `Attempt recorded on ${t.owner}’s ${TASK_TYPE[t.type].toLowerCase()} · unit then needs a new owner (not evidence of anything)`;
      } else if (code === 'HELP') {
        const cat = detail.toUpperCase();
        if (!detail) { row.msg = 'HELP needs a concern category: CHILD, ADULT, MEDICAL or ESSENTIALS.'; return; }
        if (!CONCERN[cat]) { row.msg = `Unknown category “${detail}”. Use CHILD, ADULT, MEDICAL or ESSENTIALS.`; return; }
        if (c) { row.msg = 'A welfare case is already open for this unit: add an update to it instead.'; return; }
        row.level = 'ok';
        row.category = cat;
        row.msg = `Welfare case opened (${CONCERN[cat]}) · priority not yet assessed · household stays ${HOUSEHOLD[f.status].en}`;
      } else {
        row.msg = `Unknown code “${parts[1]}”. Use OK, NOANS, AWAY or HELP.`;
      }
    });
    return rows;
  }

  function applyBulk(text, by, batchChannel) {
    const rows = parseBulk(text, by, batchChannel);
    let applied = 0;
    rows.forEach((r) => {
      if (r.level !== 'ok' && r.level !== 'okwarn') return;
      if (r.code === 'OK') actConfirm(r.flat, { kind: 'adult', channel: r.channel, by, fromBatch: r.fromBatch });
      else if (r.code === 'AWAY') actConfirm(r.flat, { kind: 'away', source: r.detail, by });
      else if (r.code === 'NOANS') actNoAnswer(r.flat, `Reported by ${by}`);
      else if (r.code === 'HELP') actOpenCase(r.flat, { concern: r.category, priority: 'unknown', source: `Report from ${by}` });
      applied++;
    });
    const bad = rows.filter((r) => r.level === 'err');
    const noop = rows.filter((r) => r.level === 'warn');
    if (applied) {
      const bc = batchChannel && batchChannel !== 'REQUIRE' ? ` Batch channel for OK lines without one: ${CHANNEL[batchChannel]}.` : '';
      log(null, 'bulk', `Bulk update from ${by}: ${plural(applied, 'line')} applied, ${plural(noop.length, 'line')} with no change, ${plural(bad.length, 'line')} not applied (errors).${bc}`);
      if (/guard/i.test(by)) {
        state.flags.guardApplied = true;
        if (rows.some((r) => r.fromBatch && (r.level === 'ok' || r.level === 'okwarn'))) state.flags.guardBatch = batchChannel;
      }
    }
    return { applied, bad, noop };
  }

  // ── Register import: identifiers are strings; layout fields are optional ──
  function parseCsvRows(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let inQ = false;
    let line = 1;
    let rowLine = 1;
    const s = text || '';
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (inQ) {
        if (ch === '"') {
          if (s[i + 1] === '"') { cell += '"'; i++; } else inQ = false;
        } else {
          if (ch === '\n') line++;
          cell += ch;
        }
      } else if (ch === '"' && cell.trim() === '') { cell = ''; inQ = true; } else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && s[i + 1] === '\n') i++;
        row.push(cell);
        rows.push({ n: rowLine, cells: row });
        row = [];
        cell = '';
        line++;
        rowLine = line;
      } else cell += ch;
    }
    if (cell !== '' || row.length || inQ) { row.push(cell); rows.push({ n: rowLine, cells: row, unclosed: inQ }); }
    return rows.filter((r) => r.cells.some((c) => c.trim() !== ''));
  }
  const HEADERS = {
    unit: /^(unit|unit[ _-]?id|unit[ _-]?no|flat|flat[ _-]?(no|number|id)|house|house[ _-]?no|home|villa|plot|id)$/i,
    building: /^(building|tower|block|wing|bldg|phase)$/i,
    floor: /^(floor|level|storey)$/i,
    note: /^(note|notes|register[ _-]?note|remarks?)$/i
  };
  function validateRegister(text) {
    const raw = parseCsvRows(text);
    const res = { rows: [], valid: [], errors: [], warnings: [], cols: null, ignored: [] };
    if (!raw.length) return res;
    const head = raw[0].cells.map((c) => c.trim());
    const mapped = head.map((h) => Object.keys(HEADERS).find((k) => HEADERS[k].test(h)) || null);
    let start = 0;
    if (mapped.includes('unit')) {
      res.cols = mapped;
      res.ignored = head.filter((h, i) => !mapped[i] && h);
      start = 1;
    } else res.cols = ['unit', 'building', 'floor', 'note'];
    const cols = res.cols;
    for (let i = start; i < raw.length; i++) {
      const r = raw[i];
      const get = (k) => { const idx = cols.indexOf(k); return idx >= 0 && r.cells[idx] != null ? r.cells[idx].trim() : ''; };
      const row = { n: r.n, raw: r.cells.join(','), id: get('unit'), building: get('building'), floor: get('floor'), note: get('note'), error: null, warn: null, key: null };
      if (r.unclosed) row.error = 'Unclosed quotation mark.';
      else if (r.cells.length > cols.length) row.error = `Too many columns (${r.cells.length}; this register has ${cols.length}).`;
      else if (!row.id) row.error = 'Missing unit identifier.';
      else if (row.id.includes(',')) row.error = 'Unit identifiers can’t contain commas (bulk updates use commas to separate fields).';
      else if (row.id.length > 40) row.error = 'Unit identifier is longer than 40 characters.';
      else if (row.note.length > 60) row.error = 'Note is longer than 60 characters.';
      res.rows.push(row);
    }
    // Identity: identical identifiers are only accepted when explicit buildings tell them apart.
    const groups = new Map();
    res.rows.filter((r) => !r.error).forEach((r) => {
      const k = normKey(r.id);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    });
    groups.forEach((list) => {
      if (list.length === 1) { list[0].key = list[0].id; return; }
      const sameText = list.every((r) => r.id === list[0].id);
      const blds = list.map((r) => normKey(r.building));
      if (sameText && blds.every((b) => b) && new Set(blds).size === list.length) {
        list.forEach((r) => { r.key = `${r.building}/${r.id}`; r.warn = `“${r.id}” appears in ${list.length} buildings; shown as “${r.key}”.`; });
        return;
      }
      const identical = list.every((r) => r.id === list[0].id && normKey(r.building) === blds[0]);
      if (identical) {
        list[0].key = list[0].id;
        list.slice(1).forEach((r) => { r.error = `Duplicate of line ${list[0].n}: same unit${list[0].building ? ` in ${list[0].building}` : ''}.`; });
        return;
      }
      const lines = list.map((r) => r.n).join(', ');
      list.forEach((r) => { r.error = `Ambiguous: “${r.id}” can’t be told apart from the unit on line${list.length > 2 ? 's' : ''} ${lines.split(', ').filter((n) => Number(n) !== r.n).join(', ')} (differs only by letter case or spacing, or a building is missing). Fix the register; nothing is guessed.`; });
    });
    const seen = new Map();
    res.rows.filter((r) => !r.error).forEach((r) => {
      const k = normKey(r.key);
      if (seen.has(k)) r.error = `Identifier “${r.key}” clashes with line ${seen.get(k)}.`;
      else seen.set(k, r.n);
    });
    const strip = (s) => normKey(s).replace(/(^|[^0-9])0+(?=\d)/g, '$1');
    const sim = new Map();
    res.rows.filter((r) => !r.error).forEach((r) => {
      const k = strip(r.key);
      if (sim.has(k) && !r.warn) r.warn = `Looks like “${sim.get(k)}” apart from leading zeros. Check these are different units.`;
      else if (!sim.has(k)) sim.set(k, r.key);
    });
    res.valid = res.rows.filter((r) => !r.error);
    res.errors = res.rows.filter((r) => r.error);
    res.warnings = res.valid.filter((r) => r.warn);
    return res;
  }

  // ── Messages that leave the desk (copy only; Khairiyat sends nothing) ─────
  function taskMessage(tasks) {
    const owner = tasks[0].owner;
    const checks = tasks.filter((t) => t.type === 'check').sort((a, b) => cmpUnit(a.flatId, b.flatId));
    const visits = tasks.filter((t) => t.type === 'welfare').sort((a, b) => cmpUnit(a.flatId, b.flatId));
    const follows = tasks.filter((t) => t.type === 'followup').sort((a, b) => cmpUnit(a.flatId, b.flatId));
    const L = [`Khairiyat · ${societyShort()}`];
    if (checks.length) {
      const due = Math.min(...checks.map((t) => t.due));
      L.push(`Household check (हालचाल) for ${owner}: ${plural(checks.length, 'flat')}, please report by ${hhmm(due)}.`);
      for (let i = 0; i < checks.length; i += 8) L.push(checks.slice(i, i + 8).map((t) => t.flatId).join(', '));
      L.push('', 'When you check, reply with one line per flat:', 'FLAT,OK,VISIT if you spoke to an adult at the door', 'FLAT,OK,PHONE if you spoke to an adult by phone', 'FLAT,NOANS if nobody answered', 'FLAT,AWAY,who told you', 'FLAT,HELP,CHILD / ADULT / MEDICAL / ESSENTIALS');
    }
    visits.forEach((t) => {
      const c = caseOf(state.flats[t.flatId]);
      L.push('', `Welfare visit for ${owner}: ${t.flatId}, ${c ? CONCERN[c.concern].toLowerCase() : 'welfare concern'} (as reported). Please go by ${hhmm(t.due)} only if it is safe for you, and tell the desk what you find.`);
    });
    follows.forEach((t) => L.push('', `Follow-up for ${owner}: ${t.flatId}. Please follow up by ${hhmm(t.due)} and tell the desk what you find.`));
    if (tasks.some((t) => t.accept === 'pending')) L.push('', 'Please reply YES if you can take this on, or NO if you can’t.');
    L.push(
      '',
      'Safety: knock or call only. Don’t enter any home or force a door, and don’t stay anywhere you feel unsafe: leave and tell the desk. If anyone may be in immediate danger, call emergency services directly first; don’t wait for the desk.',
      '“No answer” isn’t proof of anything: just report it.',
      `Desk: ${state.settings.desk}. Please don’t forward this message.`
    );
    return L.join('\n');
  }

  function societyUpdateText() {
    const st = stats();
    const blds = uniq(state.order.map((id) => state.flats[id].building));
    const per = blds.length > 1 && blds.length <= 8 && blds.every((b) => b)
      ? blds.sort(natCmp).map((b) => {
        const ids = state.order.filter((id) => state.flats[id].building === b);
        return `${b}: ${ids.filter((id) => state.flats[id].status === 'confirmed').length}/${ids.length}`;
      }).join(' · ')
      : '';
    const w = st.cases === 0 ? 'none at the moment' : st.cases < 5 ? 'fewer than 5' : String(st.cases);
    return [
      `Khairiyat update · ${hhmm(state.clock)} · ${societyShort()}`,
      'ख़ैरियत · सोसाइटी अपडेट',
      '',
      `Households confirmed (पुष्टि हुई): ${st.confirmed} of ${st.total}`,
      per,
      `Households not yet confirmed (पुष्टि बाकी): ${st.unconfirmed}. A volunteer has accepted the next check for ${st.coveredUnconfirmed} of them.`,
      `Welfare follow-ups open: ${w}.`,
      '',
      `If nobody has reached your household yet, please call ${state.settings.guard} or the desk on ${state.settings.desk}, or tell your floor warden.`,
      '“Not yet confirmed” only means we haven’t reached your household yet. “Confirmed” means we reached someone in the household, not that every person is safe.',
      'If anyone may be in immediate danger, call emergency services directly first.',
      '',
      'Totals only: this update never includes flat numbers, names or details.'
    ].filter((x, i, arr) => !(x === '' && arr[i - 1] === '') && x !== null).filter((x, i) => !(i === 4 && x === '')).join('\n');
  }

  // ── Message arrivals and the next-step coverage milestone ──────────────────
  function processMessages() {
    const arrived = [];
    if (state.scenario !== 'neelgiri') return arrived;
    MSG_SPECS.forEach((sp) => {
      const m = state.msgs[sp.id];
      if (!m || m.status !== 'pending') return;
      let ok = false;
      try { ok = !!sp.cond(state); } catch (e) { ok = false; }
      if (!ok) { m.condAt = null; return; }
      if (m.condAt == null) m.condAt = state.clock;
      if (state.clock >= m.condAt + sp.delay) {
        try {
          m.data = sp.build(state);
          m.status = 'arrived';
          m.arrivedAt = state.clock;
          m.seq = state.seq++;
          arrived.push(m.data.from);
        } catch (e) { /* condition changed underneath us; try again later */ }
      }
    });
    return arrived;
  }
  function checkCoverage() {
    if (!state.order.length || state.coverAt != null) return false;
    const st = stats();
    if (st.gaps !== 0) return false;
    state.coverAt = state.clock;
    log(null, 'milestone', `Next-step coverage first reached at ${hhmm(state.clock)}, ${dur(state.clock - state.startedAt)} after the roll-call started: every unresolved flat had an accepted next step that wasn’t overdue. Not a safety measure: ${plural(st.unconfirmed, 'household')} unconfirmed and ${plural(st.cases, 'welfare case')} open at that moment. Coverage can fall again when deadlines pass.`);
    return true;
  }
  function commit() {
    const arrived = processMessages();
    const milestone = checkCoverage();
    save();
    renderAll();
    if (arrived.length) toast(`New at the desk inbox: ${arrived.join('; ')}`, 'info');
    if (milestone) toast('Next-step coverage reached. It is not a safety measure: unconfirmed households and open cases are still listed.', 'info');
  }

  // ── Rendering: header, KPIs ────────────────────────────────────────────────
  function renderAll() {
    renderPeople();
    renderHeader();
    renderKpis();
    renderMain();
    renderAside();
    renderDrawer();
  }

  function renderPeople() {
    let dl = $('#people-list');
    if (!dl) { dl = document.createElement('datalist'); dl.id = 'people-list'; document.body.appendChild(dl); }
    const names = uniq(PEOPLE.map((p) => p[0]).concat(Object.values(state.tasks).map((t) => t.owner)));
    dl.innerHTML = names.map((n) => {
      const role = (PEOPLE.find((p) => p[0] === n) || [, 'Owner'])[1];
      const load = ownerLoad(n);
      return `<option value="${esc(n)}">${esc(role)}${load ? ` · ${load} open` : ''}</option>`;
    }).join('');
  }

  function renderHeader() {
    const has = state.order.length > 0;
    $('#app-header').innerHTML = `
      <div class="brand">
        <div class="brand-name">Khairiyat <span lang="hi" class="hi">ख़ैरियत</span></div>
        <div class="brand-sub">Roll-call desk · ${esc(state.settings.society)}</div>
      </div>
      <div class="clock" role="group" aria-label="Demo clock">
        <span class="clock-label">Demo clock</span>
        <span class="clock-time">${hhmm(state.clock)}</span>
        ${has ? `<span class="clock-sub">since ${hhmm(state.startedAt)}</span>` : ''}
        <button class="btn btn-sm" data-action="advance" title="Move the demo clock forward 15 minutes">+15 min</button>
      </div>
      <div class="header-actions">
        <button class="btn btn-sm" data-action="open-bulk" ${has ? '' : 'disabled'}>Bulk update</button>
        <details class="menu">
          <summary class="btn btn-sm">More</summary>
          <div class="menu-pop">
            <button data-action="open-import">Import register</button>
            <button data-action="open-export" ${has ? '' : 'disabled'}>Export CSV</button>
            <button data-action="open-handover" ${has ? '' : 'disabled'}>Handover summary</button>
            <button data-action="open-scenario">About this scenario</button>
            <button data-action="open-settings">Settings</button>
            <hr>
            <button data-action="ask-reset">Reset demo (empty register)</button>
            <button data-action="ask-reset-sample">Reset demo, Neelgiri register loaded</button>
            <button data-action="ask-delete" class="danger">Delete all data…</button>
          </div>
        </details>
      </div>`;
  }

  // One grouped summary instead of six equal cards: what needs attention is the last group.
  function renderKpis() {
    if (!state.order.length) {
      $('#kpis').innerHTML = '<p class="sum-empty">No register loaded yet. Import the society’s register to start the roll-call.</p>';
      return;
    }
    const st = stats();
    const n = (v, tone) => `<b class="num${v && tone ? ` ${tone}` : ''}">${v}</b>`;
    const cover = st.unresolved ? `${st.covered} of ${st.unresolved} unresolved flats have an accepted next step that isn’t overdue` : 'No unresolved flats';
    $('#kpis').innerHTML = `
      <div class="sum-group"><h2 class="sum-h">Households <span lang="hi">घर</span></h2>
        <p><span data-kpi="confirmed">${n(st.confirmed)} confirmed</span><span class="sep" aria-hidden="true">·</span><span data-kpi="unconfirmed">${n(st.unconfirmed)} unconfirmed</span> <span class="muted">of ${st.total}</span></p></div>
      <div class="sum-group"><h2 class="sum-h">Welfare cases <span lang="hi">हालचाल</span></h2>
        <p><span data-kpi="cases">${n(st.cases, 'wel')} open</span></p></div>
      <div class="sum-group attention"><h2 class="sum-h">Next steps needing attention</h2>
        <p><span data-kpi="none">${n(st.none, 'danger')} need an owner</span><span class="sep" aria-hidden="true">·</span><span data-kpi="pending">${n(st.pending, 'warn')} awaiting acceptance</span><span class="sep" aria-hidden="true">·</span><span data-kpi="overdue">${n(st.overdue, 'danger')} overdue</span><span class="sep" aria-hidden="true">·</span><span data-kpi="due">${n(st.dueNow, 'warn')} due now</span></p></div>
      <p class="coverage-line" role="status"><span><b>Next-step coverage:</b> ${cover}.</span> <span>${state.coverAt != null ? `Full coverage first reached at ${hhmm(state.coverAt)}.` : 'Full coverage not reached yet.'}</span> <span class="muted">A coordination measure, not a safety measure.</span></p>`;
  }

  // ── Rendering: main tabs ───────────────────────────────────────────────────
  const TABS = [
    ['queue', 'Unresolved work', 'बाकी काम'],
    ['register', 'Unit register', 'फ़्लैट सूची'],
    ['tasks', 'Tasks by owner', 'ज़िम्मेदारियाँ'],
    ['update', 'Society update', 'सोसाइटी अपडेट'],
    ['history', 'History', 'इतिहास']
  ];
  function renderMain() {
    const st = stats();
    const counts = { queue: st.gaps, tasks: Object.values(state.tasks).filter((t) => t.status === 'open').length, history: state.events.length };
    const tabs = TABS.map(([id, en, hi]) => `
      <button role="tab" id="tab-${id}" aria-controls="panel" aria-selected="${ui.tab === id}" class="tab${ui.tab === id ? ' active' : ''}" data-action="tab" data-tab="${id}">
        ${en} <span lang="hi" class="hi">${hi}</span>${counts[id] != null && state.order.length ? `<span class="tab-count">${counts[id]}</span>` : ''}
      </button>`).join('');
    let body = '';
    if (ui.tab === 'queue') body = renderQueue();
    else if (ui.tab === 'register') body = renderRegister();
    else if (ui.tab === 'tasks') body = renderTasks();
    else if (ui.tab === 'update') body = renderUpdate();
    else body = renderHistory();
    $('#main').innerHTML = `<div class="tabs" role="tablist" aria-label="Desk views">${tabs}</div><div id="panel" class="panel" role="tabpanel" aria-labelledby="tab-${ui.tab}">${body}</div>`;
  }

  function emptyNoRegister() {
    return `<div class="empty">
      <h2>No register yet</h2>
      <p>Khairiyat starts from the society’s own list of units: flats, villas, shops, anything with an identifier. Import it, and every household starts as <strong>Unconfirmed · पुष्टि बाकी</strong>, which only means nobody has reached it yet.</p>
      <div class="empty-actions"><button class="btn btn-primary" data-action="open-import">Import the register</button> <button class="btn" data-action="open-scenario">About this scenario</button></div>
      <p class="muted small">The walkthrough uses a fictional 160-flat register for Neelgiri Apartments. Two other fictional registers show irregular buildings and independent homes.</p>
    </div>`;
  }
  const emptyLine = (t) => `<p class="empty-line">${t}</p>`;
  const flatChip = (id, extra) => {
    const f = state.flats[id];
    const c = caseOf(f);
    return `<button class="chip st-${f.status}${c ? ' has-case' : ''}" data-action="open-flat" data-id="${esc(id)}" title="${esc(`${id}: household ${HOUSEHOLD[f.status].en.toLowerCase()}${c ? ', welfare case open' : ''}${extra ? `, ${extra}` : ''}`)}">${c ? '<span aria-hidden="true">◆</span>' : ''}${esc(id)}${extra ? `<small>${esc(extra)}</small>` : ''}</button>`;
  };
  const idsAttr = (items) => esc(items.map((x) => x.f.id).join('\n'));
  const taskIdsAttr = (items) => esc(items.map((x) => x.t.id).join(','));
  function clusters(items, keyFn) {
    const m = new Map();
    items.forEach((it) => {
      const k = keyFn(it);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(it);
    });
    return [...m.entries()];
  }

  // Queue: 1 welfare cases needing action · 2 overdue · 3 needs an owner · 4 awaiting acceptance ·
  //        5 welfare cases in progress · 6 being followed up.
  function buildQueue() {
    const q = { welfare: [], overdue: [], none: [], pending: [], welfareOk: [], covered: [] };
    state.order.forEach((id) => {
      const f = state.flats[id];
      if (!unresolved(f)) return;
      const t = openTask(f);
      const cov = coverage(f);
      const c = caseOf(f);
      if (c) { (cov === 'covered' ? q.welfareOk : q.welfare).push({ f, t, c, cov }); return; }
      if (cov === 'overdue') q.overdue.push({ f, t });
      else if (cov === 'none') q.none.push({ f });
      else if (cov === 'pending') q.pending.push({ f, t });
      else q.covered.push({ f, t });
    });
    const pr = (x) => PRIORITY_RANK[x.c.priority];
    const dueFirst = (x) => (dueState(x.t) === 'due' ? 0 : 1);
    q.welfare.sort((a, b) => pr(a) - pr(b) || a.c.openedAt - b.c.openedAt);
    q.welfareOk.sort((a, b) => dueFirst(a) - dueFirst(b) || pr(a) - pr(b) || a.t.due - b.t.due);
    q.overdue.sort((a, b) => a.t.due - b.t.due || cmpUnit(a.f.id, b.f.id));
    q.pending.sort((a, b) => a.t.createdAt - b.t.createdAt || cmpUnit(a.f.id, b.f.id));
    q.covered.sort((a, b) => dueFirst(a) - dueFirst(b) || a.t.due - b.t.due || cmpUnit(a.f.id, b.f.id));
    return q;
  }

  function qGroup(n, title, tone, count, body, help, extraHead) {
    const collapsed = !!ui.collapsed[n];
    return `<section class="qgroup tone-${tone}${count ? '' : ' is-empty'}" data-group="${n}">
      <h3 class="qh"><button class="qhead" data-action="toggle-group" data-group="${n}" aria-expanded="${!collapsed}">
        <span class="qcaret" aria-hidden="true">${collapsed ? '▸' : '▾'}</span><span class="qtitle">${title}${extraHead ? ` <span class="qextra">${extraHead}</span>` : ''}</span><span class="qcount">${count}</span>
      </button></h3>
      ${collapsed ? '' : `<div class="qbody">${help ? `<p class="qhelp">${help}</p>` : ''}${body}</div>`}
    </section>`;
  }
  const stageShort = { open: 'No handoff yet', contacted: 'Contact attempted', acknowledged: 'Handoff agreed, not confirmed' };

  // The coordinator's first question: what needs my attention next?
  function nextPriority(q) {
    if (q.welfare.length) {
      const x = q.welfare[0];
      const what = x.cov === 'none' ? 'it needs a helper' : x.cov === 'pending' ? `${x.t.owner} hasn’t accepted yet` : `${x.t.owner}’s deadline has passed`;
      return `Welfare case at <b>${esc(x.f.id)}</b> (${esc(PRIORITY[x.c.priority])}): ${esc(what)}. <button class="btn btn-sm btn-primary" data-action="open-flat" data-id="${esc(x.f.id)}">Open ${esc(x.f.id)}</button>`;
    }
    if (q.overdue.length) return `${plural(q.overdue.length, 'household check')} overdue (${esc(uniq(q.overdue.map((x) => x.t.owner)).join(', '))}): check in, extend with a reason, or reassign. See <b>Overdue</b> below.`;
    if (q.none.length) return `${plural(q.none.length, 'household')} with nobody asked to check them. See <b>Needs an owner</b> below.`;
    if (q.pending.length) return `${plural(q.pending.length, 'assignment')} waiting for a YES or NO. See <b>Awaiting acceptance</b> below.`;
    return '';
  }

  function welfareRow({ f, t, c, cov }) {
    const detail = ui.hideWelfare ? '<span class="masked">Concern hidden</span>' : esc(CONCERN[c.concern]);
    let owner;
    let actions;
    if (cov === 'none') {
      owner = '<span class="badge danger">No owner</span>';
      actions = `<button class="btn btn-sm btn-primary" data-action="assign-ids" data-ids="${esc(f.id)}">Assign helper</button>`;
    } else if (cov === 'pending') {
      owner = `<span class="badge warn">Awaiting acceptance</span> ${esc(t.owner)} · ${dueLabel(t)}`;
      actions = `<button class="btn btn-sm btn-primary" data-action="respond" data-tasks="${esc(t.id)}">Record response</button><button class="btn btn-sm" data-action="assign-ids" data-ids="${esc(f.id)}">Reassign</button>`;
    } else if (cov === 'overdue') {
      owner = `<span class="badge danger">Overdue since ${hhmm(t.due)}</span> ${esc(t.owner)}${t.accept === 'pending' ? ' (never accepted)' : ''}`;
      actions = `<button class="btn btn-sm btn-primary" data-action="extend" data-tasks="${esc(t.id)}">Extend…</button><button class="btn btn-sm" data-action="assign-ids" data-ids="${esc(f.id)}">Reassign</button>`;
    } else {
      owner = `${esc(t.owner)} · ${TASK_TYPE[t.type].toLowerCase()} · ${dueHtml(t)}`;
      actions = '';
    }
    return `<div class="qrow">
      <button class="flat-link" data-action="open-flat" data-id="${esc(f.id)}">${esc(f.id)}</button>
      ${priorityBadge(c.priority)}
      <span class="sensitive">${detail}</span>
      <span class="stage-tag stage-${c.stage}">${stageShort[c.stage]}</span>
      <span class="hh-tag">${HOUSEHOLD[f.status].icon} household ${HOUSEHOLD[f.status].en.toLowerCase()}</span>
      <span class="ownerline">${owner}</span>
      <span class="row-actions">${actions}<button class="btn btn-sm btn-ghost" data-action="open-flat" data-id="${esc(f.id)}">Open</button></span>
    </div>`;
  }

  function renderQueue() {
    if (!state.order.length) return emptyNoRegister();
    const q = buildQueue();
    const st = stats();
    const next = nextPriority(q);
    let h = `<div class="panel-intro">
      <p>Most urgent first, re-ordered after every change. <strong>Covered</strong> means someone accepted and the deadline hasn’t passed. “Unconfirmed” and “no answer” are not evidence that anyone has vanished.</p>
      <label class="toggle"><input type="checkbox" id="hide-welfare" ${ui.hideWelfare ? 'checked' : ''}> Hide welfare details on screen</label>
    </div>
    <p class="next-up${next ? '' : ' calm'}"><span class="next-label">Next priority</span> ${next || (st.unresolved ? 'Nothing needs action right now: every unresolved item has an accepted next step within its deadline.' : 'Nothing outstanding.')}</p>`;
    if (st.gaps === 0) h += coverageBanner(st);

    h += qGroup(1, 'Welfare cases needing action', 'danger', q.welfare.length,
      q.welfare.length ? q.welfare.map(welfareRow).join('') : emptyLine('None. Every open welfare case has an accepted owner whose deadline hasn’t passed.'),
      q.welfare.length ? 'Order: Urgent, then Not yet assessed, then Not urgent. Priority is the coordinator’s judgement, not medical triage. If anyone may be in immediate danger, call emergency services directly now.' : '');

    const g2 = clusters(q.overdue, (x) => x.t.owner).map(([owner, items]) => {
      const due = Math.min(...items.map((x) => x.t.due));
      const never = items.filter((x) => x.t.accept === 'pending').length;
      return `<div class="qcluster">
        <div class="qcluster-head"><div><strong>${esc(owner)}</strong> · ${plural(items.length, 'flat')} · due ${hhmm(due)} · <span class="text-danger">overdue by ${dur(state.clock - due)}</span>${never ? ` · <span class="text-warn">${never} never accepted</span>` : ' · still their task'}</div>
        <div class="btn-row"><button class="btn btn-sm btn-primary" data-action="extend" data-tasks="${taskIdsAttr(items)}">Extend deadline…</button><button class="btn btn-sm" data-action="checkin" data-tasks="${taskIdsAttr(items)}">Record check-in…</button><button class="btn btn-sm" data-action="assign-ids" data-ids="${idsAttr(items)}">Reassign…</button></div></div>
        <div class="chips">${items.map((x) => flatChip(x.f.id)).join('')}</div>
      </div>`;
    }).join('');
    h += qGroup(2, 'Overdue: check with the owner', 'danger', q.overdue.length, g2 || emptyLine('None. No household check has passed its deadline.'),
      q.overdue.length ? 'The deadline has passed but the owner hasn’t changed. Check in, extend with a reason, or reassign. The history keeps every step.' : '');

    const blds = clusters(q.none, (x) => x.f.building || 'No building');
    const g3 = blds.map(([b, items]) => `<div class="qcluster">
        <div class="qcluster-head"><div><strong>${esc(b)}</strong> · ${plural(items.length, 'flat')} with nobody asked</div>
        <button class="btn btn-sm btn-primary" data-action="assign-ids" data-ids="${idsAttr(items)}">Assign ${items.length}…</button></div>
        <div class="chips">${items.map((x) => flatChip(x.f.id, x.f.attempts ? `no answer ×${x.f.attempts}` : '')).join('')}</div>
      </div>`).join('');
    const all = q.none.length && blds.length > 1 ? `<div class="qcluster-all"><button class="btn btn-sm" data-action="assign-ids" data-ids="${idsAttr(q.none)}">Assign all ${q.none.length} flats needing an owner…</button></div>` : '';
    h += qGroup(3, 'Needs an owner', 'warn', q.none.length, (all + g3) || emptyLine('None. Every unconfirmed household has been assigned to someone.'),
      q.none.length ? 'Includes declined work and flats after a “no answer”. A no-answer attempt is not evidence of anything.' : '');

    const g4 = clusters(q.pending, (x) => `${x.t.owner}\u0000${x.t.batch}`).map(([k, items]) => {
      const owner = items[0].t.owner;
      const at = items[0].t.createdAt;
      return `<div class="qcluster">
        <div class="qcluster-head"><div><strong>${esc(owner)}</strong> · ${plural(items.length, 'flat')} · assigned ${hhmm(at)} (${dur(state.clock - at)} ago) · ${dueLabel(items[0].t)}</div>
        <div class="btn-row"><button class="btn btn-sm btn-primary" data-action="respond" data-tasks="${taskIdsAttr(items)}">Record response…</button><button class="btn btn-sm" data-action="owner-msg" data-tasks="${taskIdsAttr(items)}">Message again</button><button class="btn btn-sm" data-action="assign-ids" data-ids="${idsAttr(items)}">Reassign…</button></div></div>
        <div class="chips">${items.map((x) => flatChip(x.f.id)).join('')}</div>
      </div>`;
    }).join('');
    h += qGroup(4, 'Awaiting acceptance', 'pending', q.pending.length, g4 || emptyLine('None. Every assignment has been accepted or declined.'),
      q.pending.length ? 'Assigned, but the volunteer hasn’t said yes. These flats are not counted as covered. Record only what the person actually said.' : '');

    h += qGroup(5, 'Welfare cases in progress', 'wel', q.welfareOk.length, q.welfareOk.length ? q.welfareOk.map(welfareRow).join('') : emptyLine('None.'), '');

    const dueNowCount = q.covered.filter((x) => dueState(x.t) === 'due').length;
    const g6 = clusters(q.covered, (x) => x.t.owner).map(([owner, items]) => {
      const due = Math.min(...items.map((x) => x.t.due));
      const dn = items.filter((x) => dueState(x.t) === 'due').length;
      return `<div class="qcluster"><div class="qcluster-head"><div><strong>${esc(owner)}</strong> · ${plural(items.length, 'flat')} · accepted · ${dn ? `<span class="badge due">${dn} due now</span>` : `next deadline ${hhmm(due)}`}</div>
        ${dn ? `<div class="btn-row"><button class="btn btn-sm" data-action="checkin" data-tasks="${taskIdsAttr(items.filter((x) => dueState(x.t) === 'due'))}">Record check-in…</button><button class="btn btn-sm" data-action="extend" data-tasks="${taskIdsAttr(items.filter((x) => dueState(x.t) === 'due'))}">Extend…</button></div>` : ''}</div>
        <div class="chips">${items.map((x) => flatChip(x.f.id, dueState(x.t) === 'due' ? 'due now' : `due ${hhmm(x.t.due)}`)).join('')}</div></div>`;
    }).join('');
    h += qGroup(6, 'Being followed up', 'own', q.covered.length, g6 || emptyLine('None.'), '', dueNowCount ? `<span class="badge due">${dueNowCount} due now</span>` : '');
    return h;
  }

  function coverageBanner(st) {
    return `<div class="coverage-note" role="status">
      <strong>Next-step coverage:</strong> every unresolved flat has an accepted next step that isn’t overdue${state.coverAt != null ? ` (first reached at ${hhmm(state.coverAt)}, ${dur(state.coverAt - state.startedAt)} after the start)` : ''}.
      <strong>This is not a safety measure.</strong> Still outstanding: ${plural(st.unconfirmed, 'household')} unconfirmed · ${plural(st.cases, 'welfare case')} open${st.dueNow ? ` · ${st.dueNow} due now` : ''}. Coverage drops again if a deadline passes.
    </div>`;
  }

  // Unit register
  function matches(f) {
    if (ui.fBuilding !== 'all' && (f.building || '__none') !== ui.fBuilding) return false;
    if (ui.fHousehold !== 'all' && f.status !== ui.fHousehold) return false;
    const c = caseOf(f);
    if (ui.fCase === 'open' && !c) return false;
    if (ui.fCase === 'none' && c) return false;
    if (ui.fNext !== 'all') {
      const cov = coverage(f);
      const t = openTask(f);
      if (ui.fNext === 'due') { if (!(t && dueState(t) === 'due')) return false; } else if (cov !== ui.fNext) return false;
    }
    const q = ui.q.trim().toUpperCase();
    if (q) {
      const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const nq = norm(q);
      const t = openTask(f);
      const hit = [f.id, f.building, f.note].some((v) => nq && norm(v).includes(nq)) || (t && t.owner.toUpperCase().includes(q));
      if (!hit) return false;
    }
    return true;
  }
  const opt = (v, label, cur) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(label)}</option>`;

  function renderRegister() {
    if (!state.order.length) return emptyNoRegister();
    const blds = uniq(state.order.map((id) => state.flats[id].building || '__none')).sort((a, b) => (a === '__none') - (b === '__none') || natCmp(a, b));
    const grid = layoutReady();
    return `<div class="filters" role="search" aria-label="Filter units">
        <label class="f-search"><span class="sr-only">Search units, buildings, owners or notes</span>
          <input type="search" id="reg-q" placeholder="Search unit (e.g. C-702, Villa 17), owner or note" value="${esc(ui.q)}" autocomplete="off"></label>
        <label>Household <select id="reg-household">${opt('all', 'Any', ui.fHousehold)}${opt('unconfirmed', 'Unconfirmed · पुष्टि बाकी', ui.fHousehold)}${opt('confirmed', 'Confirmed · पुष्टि हुई', ui.fHousehold)}</select></label>
        <label>Welfare <select id="reg-case">${opt('all', 'Any', ui.fCase)}${opt('open', 'Case open', ui.fCase)}${opt('none', 'No open case', ui.fCase)}</select></label>
        <label>Next step <select id="reg-next">${opt('all', 'Any', ui.fNext)}${opt('none', 'Needs an owner', ui.fNext)}${opt('pending', 'Awaiting acceptance', ui.fNext)}${opt('overdue', 'Overdue', ui.fNext)}${opt('due', 'Due now', ui.fNext)}${opt('covered', 'Covered', ui.fNext)}${opt('resolved', 'Nothing outstanding', ui.fNext)}</select></label>
        ${blds.length > 1 || blds[0] !== '__none' ? `<label>Building <select id="reg-building">${opt('all', 'All', ui.fBuilding)}${blds.map((b) => opt(b, b === '__none' ? '(no building)' : b, ui.fBuilding)).join('')}</select></label>` : ''}
        <div class="seg" role="group" aria-label="View">
          <button class="${ui.view === 'grid' && grid ? 'on' : ''}" aria-pressed="${ui.view === 'grid' && grid}" data-action="view" data-view="grid" ${grid ? '' : 'disabled title="The grid needs a building and a floor for every unit"'}>Grid</button>
          <button class="${ui.view === 'list' || !grid ? 'on' : ''}" aria-pressed="${ui.view === 'list' || !grid}" data-action="view" data-view="list">List</button>
        </div>
        <button class="btn ${ui.selecting ? 'btn-primary' : ''}" data-action="toggle-select" aria-pressed="${ui.selecting}">${ui.selecting ? 'Done selecting' : 'Select units'}</button>
      </div>
      ${grid ? '' : '<p class="hint">This register doesn’t have a building and a floor for every unit, so it is shown as a list. Nothing is inferred from the identifiers.</p>'}
      <div id="reg-selbar">${selBar()}</div>
      <div id="reg-results">${registerResults()}</div>`;
  }

  function selBar() {
    if (!ui.selecting) return '<p class="hint">Click a unit to open it. Use <strong>Select units</strong> to assign or confirm several at once.</p>';
    const n = ui.sel.size;
    const shown = state.order.filter((id) => matches(state.flats[id])).length;
    return `<div class="selbar" role="region" aria-label="Selection">
      <strong>${plural(n, 'unit')} selected</strong>
      <button class="btn btn-sm" data-action="sel-shown">Select all shown (${shown})</button>
      <button class="btn btn-sm btn-ghost" data-action="sel-clear" ${n ? '' : 'disabled'}>Clear</button>
      <span class="sp"></span>
      <button class="btn btn-sm btn-primary" data-action="sel-assign" ${n ? '' : 'disabled'}>Assign follow-up…</button>
      <button class="btn btn-sm" data-action="sel-away" ${n ? '' : 'disabled'}>Confirm household: away / vacant…</button>
    </div>`;
  }

  function registerResults() {
    const ids = state.order.filter((id) => matches(state.flats[id]));
    const head = `<p class="results-count" aria-live="polite">Showing ${ids.length} of ${state.order.length} units</p>`;
    if (!ids.length) return `${head}<div class="empty small-empty"><p>No units match these filters.</p><button class="btn btn-sm" data-action="clear-filters">Clear filters</button></div>`;
    return head + (ui.view === 'grid' && layoutReady() ? gridHtml() : listHtml(ids));
  }

  function floorOrder(a, b) {
    const fa = floorNum(a);
    const fb = floorNum(b);
    if (fa != null && fb != null) return fb - fa;
    if (fa != null) return -1;
    if (fb != null) return 1;
    return natCmp(b, a);
  }
  function gridHtml() {
    const blds = uniq(state.order.map((id) => state.flats[id].building)).sort(natCmp);
    const cards = blds.map((b) => {
      const ids = state.order.filter((id) => state.flats[id].building === b);
      const conf = ids.filter((id) => state.flats[id].status === 'confirmed').length;
      const floors = uniq(ids.map((id) => state.flats[id].floor)).sort(floorOrder);
      const cols = Math.max(...floors.map((fl) => ids.filter((id) => state.flats[id].floor === fl).length));
      const rows = floors.map((fl) => {
        const onFloor = ids.filter((id) => state.flats[id].floor === fl).sort((x, y) => natCmp(state.flats[x].id, state.flats[y].id));
        return `<div class="floor-label" aria-hidden="true">${esc(fl)}</div><div class="floor-cells">${onFloor.map((id) => cellHtml(state.flats[id])).join('')}</div>`;
      }).join('');
      return `<section class="tower" aria-label="${esc(b)}" style="--cols:${cols}">
        <header class="tower-head"><h3>${esc(b)}</h3><span>${conf}/${ids.length} confirmed</span></header>
        <div class="tower-grid">${rows}</div></section>`;
    }).join('');
    return `<div class="towers">${cards}</div>${legend()}`;
  }
  function cellHtml(f) {
    const cov = coverage(f);
    const t = openTask(f);
    const c = caseOf(f);
    const sel = ui.sel.has(f.id);
    const due = t && dueState(t) === 'due';
    const nextTxt = { resolved: 'nothing outstanding', none: 'needs an owner', pending: `awaiting acceptance (${t && t.owner})`, overdue: `overdue (${t && t.owner})`, covered: `${t && t.owner}, ${t && dueLabel(t)}` }[cov];
    const desc = `${f.id}: household ${HOUSEHOLD[f.status].en.toLowerCase()}${c ? ', welfare case open' : ''}; ${nextTxt}${sel ? '; selected' : ''}`;
    return `<button class="cell st-${f.status}${c ? ' has-case' : ''} cov-${cov}${due ? ' due-now' : ''}${matches(f) ? '' : ' dim'}${sel ? ' sel' : ''}" data-action="cell" data-id="${esc(f.id)}" aria-label="${esc(desc)}" title="${esc(desc)}"${ui.selecting ? ` aria-pressed="${sel}"` : ''}>
      <span class="cell-ic" aria-hidden="true">${c ? '◆' : HOUSEHOLD[f.status].icon}</span><span class="cell-no">${esc(shortLabel(f))}</span></button>`;
  }
  function legend() {
    return `<div class="legend" aria-label="Legend">
      <span><i class="lg st-confirmed">✓</i> Household confirmed</span>
      <span><i class="lg st-unconfirmed">○</i> Household unconfirmed</span>
      <span><i class="lg has-case">◆</i> Welfare case open (border colour still shows the household)</span>
      <span><i class="lg dot-covered"></i> Accepted owner, in time</span>
      <span><i class="lg dot-pending"></i> Awaiting acceptance</span>
      <span><i class="lg dot-due"></i> Due now</span>
      <span><i class="lg box-none"></i> Needs an owner</span>
      <span><i class="lg dot-overdue">!</i> Overdue</span>
    </div>`;
  }
  function listHtml(ids) {
    const rows = ids.map((id) => {
      const f = state.flats[id];
      const t = openTask(f);
      const cov = coverage(f);
      const c = caseOf(f);
      const hh = f.status === 'confirmed' ? esc(basisText(f.basis)) : f.attempts ? `No answer ×${f.attempts} (not evidence of anything)` : '';
      const wf = c ? `${priorityBadge(c.priority)} ${ui.hideWelfare ? '<span class="masked">Concern hidden</span>' : esc(CONCERN[c.concern])}` : '<span class="muted">No open case</span>';
      const next = cov === 'resolved' ? '<span class="muted">Nothing outstanding</span>'
        : cov === 'none' ? '<span class="text-danger">Needs an owner</span>'
          : `${esc(t.owner)} · ${t.accept === 'accepted' ? 'accepted' : '<span class="text-warn">awaiting acceptance</span>'}`;
      return `<tr class="${cov === 'none' || cov === 'overdue' ? 'row-unowned' : ''}">
        <td class="c-unit">${ui.selecting ? `<input type="checkbox" data-action="row-sel" data-id="${esc(id)}" aria-label="Select ${esc(id)}" ${ui.sel.has(id) ? 'checked' : ''}> ` : ''}<button class="flat-link" data-action="open-flat" data-id="${esc(id)}">${esc(id)}</button></td>
        <td data-label="Building">${esc(f.building) || '<span class="muted">Not set</span>'}</td>
        <td data-label="Floor">${esc(f.floor) || '<span class="muted">Not set</span>'}</td>
        <td data-label="Household" class="c-wide">${householdChip(f.status, true)}<div class="small muted">${hh}</div></td>
        <td data-label="Welfare">${wf}</td>
        <td data-label="Next step">${next}</td>
        <td data-label="Deadline">${t ? dueHtml(t) : '<span class="muted">No task</span>'}</td>
        <td data-label="Note" class="muted">${esc(f.note)}</td></tr>`;
    }).join('');
    return `<div class="table-wrap"><table class="tbl reg-list"><thead><tr><th>Unit</th><th>Building</th><th>Floor</th><th>Household</th><th>Welfare</th><th>Next step · ज़िम्मेदार</th><th>Deadline · समय सीमा</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  // Tasks by owner
  function renderTasks() {
    if (!state.order.length) return emptyNoRegister();
    const open = Object.values(state.tasks).filter((t) => t.status === 'open');
    if (!open.length) return `<div class="empty"><div class="empty-icon" aria-hidden="true">☐</div><h2>No open tasks</h2><p>Assign follow-ups from <strong>Unresolved work</strong> or the <strong>Unit register</strong>. Every task has one named owner, a deadline and an acceptance status.</p><button class="btn btn-primary" data-action="tab" data-tab="queue">Go to Unresolved work</button></div>`;
    const limit = Number(state.settings.workloadWarn) || 20;
    const cards = clusters(open, (t) => t.owner)
      .sort((a, b) => Math.min(...a[1].map((t) => t.due)) - Math.min(...b[1].map((t) => t.due)))
      .map(([owner, ts]) => {
        const over = ts.filter((t) => isOverdue(t));
        const pend = ts.filter((t) => t.accept === 'pending' && !isOverdue(t));
        const acc = ts.filter((t) => t.accept === 'accepted' && !isOverdue(t));
        const dn = ts.filter((t) => dueState(t) === 'due');
        const chips = ts.slice().sort((a, b) => cmpUnit(a.flatId, b.flatId)).map((t) => flatChip(t.flatId, isOverdue(t) ? 'overdue' : t.accept === 'pending' ? 'not accepted' : dueState(t) === 'due' ? 'due now' : `due ${hhmm(t.due)}`)).join('');
        const ids = (list) => esc(list.map((t) => t.id).join(','));
        const flats = (list) => esc(list.map((t) => t.flatId).join('\n'));
        return `<article class="owner-card${over.length ? ' has-overdue' : pend.length ? ' has-pending' : ''}">
          <header><h3>${esc(owner)}</h3><span class="muted">${plural(ts.length, 'open task')}</span>
            ${acc.length ? `<span class="badge ok">${acc.length} accepted</span>` : ''}${pend.length ? `<span class="badge warn">${pend.length} awaiting acceptance</span>` : ''}${over.length ? `<span class="badge danger">${over.length} overdue</span>` : ''}${dn.length ? `<span class="badge due">${dn.length} due now</span>` : ''}
            ${ts.length > limit ? `<span class="badge danger-soft">Above the desk’s limit of ${limit}</span>` : ''}</header>
          <div class="chips">${chips}</div>
          <div class="owner-actions">
            ${ts.some((t) => t.type !== 'followup' || t.accept === 'pending') ? `<button class="btn btn-sm" data-action="owner-msg" data-tasks="${ids(ts)}">Copy message</button>` : ''}
            ${pend.length ? `<button class="btn btn-sm btn-primary" data-action="respond" data-tasks="${ids(ts.filter((t) => t.accept === 'pending'))}">Record response…</button>` : ''}
            <button class="btn btn-sm" data-action="extend" data-tasks="${ids(ts)}">Extend deadline…</button>
            <button class="btn btn-sm" data-action="checkin" data-tasks="${ids(ts)}">Record check-in…</button>
            <button class="btn btn-sm" data-action="assign-ids" data-ids="${flats(ts)}">Reassign all (${ts.length})</button>
            ${over.length ? `<button class="btn btn-sm btn-primary" data-action="assign-ids" data-ids="${flats(over)}">Reassign overdue (${over.length})</button>` : ''}
          </div>
        </article>`;
      }).join('');
    return `<div class="panel-intro"><p>Each card is a person’s current load. Assignments are commitments: record whether the person accepted, and watch for loads above the desk’s limit (${limit} open tasks, set in Settings; an adjustable assumption, not a standard). Messages are generated for copying; Khairiyat doesn’t send anything.</p></div><div class="owner-grid">${cards}</div>`;
  }

  // Society update
  function renderUpdate() {
    if (!state.order.length) return emptyNoRegister();
    return `<div class="update-wrap">
      <div class="update-preview">
        <h2>Preview · सोसाइटी अपडेट</h2>
        <pre class="msg-pre" id="update-text">${esc(societyUpdateText())}</pre>
        <div class="row"><button class="btn btn-primary" data-action="copy-update">Copy update</button><span class="hint">Khairiyat doesn’t post anything. Paste it into the society WhatsApp group yourself.</span></div>
      </div>
      <div class="update-rules">
        <h3>Included</h3>
        <ul class="checks">
          <li>Households confirmed, in total and per building (when every unit has one)</li>
          <li>Households not yet confirmed, and how many have an accepted next check</li>
          <li>Welfare follow-ups open as one society-wide figure. Counts of 1–4 are shown as “fewer than 5”.</li>
          <li>How residents can reach the desk, and to call emergency services directly in an emergency</li>
        </ul>
        <h3>Never included</h3>
        <ul class="crosses">
          <li>Unit numbers or names</li>
          <li>Welfare concerns, priorities or any case details</li>
          <li>Any claim that everyone is safe: “confirmed” means a household was reached</li>
          <li>Anything about who may have vanished</li>
        </ul>
      </div>
    </div>`;
  }

  // History
  const KIND_LABEL = { register: 'Register', status: 'Household', welfare: 'Welfare', case: 'Case', task: 'Task', outcome: 'Outcome', correction: 'Correction', bulk: 'Bulk update', update: 'Society update', milestone: 'Milestone', system: 'System', edit: 'Unit details' };
  const KIND_GROUPS = {
    all: () => true,
    status: (k) => k === 'status',
    welfare: (k) => k === 'welfare' || k === 'case',
    tasks: (k) => k === 'task' || k === 'outcome',
    correction: (k) => k === 'correction' || k === 'edit',
    bulk: (k) => k === 'bulk' || k === 'register',
    system: (k) => k === 'update' || k === 'milestone' || k === 'system'
  };
  function eventText(e) {
    return `${esc(e.text)}${e.sensitive ? (ui.hideWelfare ? ' <span class="masked">Details hidden</span>' : ` <span class="sens">${esc(e.sensitive)}</span>`) : ''}${e.reason ? `<div class="reason">Reason: ${esc(e.reason)}</div>` : ''}`;
  }
  function renderHistory() {
    if (!state.events.length) return `<div class="empty"><div class="empty-icon" aria-hidden="true">⏱</div><h2>No history yet</h2><p>Every change will be recorded here with its time, source and reason. Corrections are added as new entries. Nothing is overwritten.</p></div>`;
    return `<div class="filters" role="search" aria-label="Filter history">
        <label class="f-search"><span class="sr-only">Filter by unit</span><input type="search" id="hist-q" placeholder="Filter by unit, e.g. B-203" value="${esc(ui.histQ)}" autocomplete="off"></label>
        <label>Type <select id="hist-kind">${opt('all', 'All entries', ui.histKind)}${opt('status', 'Household status', ui.histKind)}${opt('welfare', 'Welfare cases', ui.histKind)}${opt('tasks', 'Tasks and outcomes', ui.histKind)}${opt('correction', 'Corrections and edits', ui.histKind)}${opt('bulk', 'Import and bulk', ui.histKind)}${opt('system', 'Updates and milestones', ui.histKind)}</select></label>
        <label class="toggle"><input type="checkbox" id="hide-welfare" ${ui.hideWelfare ? 'checked' : ''}> Hide welfare details</label>
      </div>
      <div id="hist-results">${historyRows()}</div>`;
  }
  function historyRows() {
    const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const q = norm(ui.histQ);
    const evs = state.events.filter((e) => KIND_GROUPS[ui.histKind](e.kind) && (!q || (e.flatId && norm(e.flatId).includes(q)))).slice().reverse();
    if (!evs.length) return '<p class="empty-line">No entries match.</p>';
    const shown = evs.slice(0, 400);
    return `<p class="results-count">${evs.length} ${evs.length === 1 ? 'entry' : 'entries'}${evs.length > shown.length ? `, newest ${shown.length} shown` : ''} · append-only: corrections are new entries</p>
      <div class="table-wrap"><table class="tbl hist"><thead><tr><th>Time</th><th>Unit</th><th>Type</th><th>Entry</th></tr></thead><tbody>
      ${shown.map((e) => `<tr class="k-${e.kind}"><td class="nowrap">${hhmm(e.t)}</td><td>${e.flatId && state.flats[e.flatId] ? `<button class="flat-link" data-action="open-flat" data-id="${esc(e.flatId)}">${esc(e.flatId)}</button>` : '<span class="muted">Society</span>'}</td><td><span class="kind kind-${e.kind}">${KIND_LABEL[e.kind] || e.kind}</span></td><td>${eventText(e)}</td></tr>`).join('')}
      </tbody></table></div>`;
  }

  // ── Walkthrough (guided sequence) and desk inbox ──────────────────────────
  function selectFor(filters, pred, message) {
    Object.assign(ui, { q: '', fHousehold: 'all', fCase: 'all', fNext: 'all', fBuilding: 'all', view: 'grid' }, filters);
    ui.tab = 'register';
    ui.selecting = true;
    ui.sel = new Set(state.order.filter((id) => pred(id)));
    if (ui.drawer) ui.drawer = null;
    renderAll();
    toast(`${plural(ui.sel.size, 'unit')} selected. ${message}`);
  }
  const towerFloors = (tower, lo, hi) => (id) => {
    const f = state.flats[id];
    const fl = Number(f.floor);
    return f.building === tower && f.status === 'unconfirmed' && !openTask(f) && fl >= lo && fl <= hi;
  };
  const isConfirmed = (s, id) => !!s.flats[id] && s.flats[id].status === 'confirmed';
  const farhanFlats = (s) => uniq(Object.values(s.tasks).filter((t) => /^farhan/i.test(t.owner)).map((t) => t.flatId));
  const showTab = (t) => { ui.tab = t; ui.drawer = null; renderAll(); };

  // Each step: what happened, exact actions, what to expect, why it matters, and the conditions
  // (read from the data, never from button clicks) that mark it complete.
  const GUIDE = [
    {
      time: '09:00',
      title: 'Read the situation, then import the register',
      situation: `It is 9:00 on the morning after the Snap. You are Priya, the RWA secretary, at the clubhouse desk of Neelgiri Apartments (fictional). Nobody yet knows which of the 160 flats have been reached. You start from the society’s own flat register.`,
      actions: [
        `Click <b>Import the register</b> in the middle of the screen (or <b>More → Import register</b>).`,
        `Click the sample button <b>Neelgiri Apartments (regular towers, scripted demo)</b>, then <b>Validate</b>.`,
        `Read the two flagged rows, then click <b>Import 160 units (skip 2)</b>.`
      ],
      expected: `The preview shows 160 valid rows and 2 errors: a duplicate C-1004 row and a row with no unit. After the import, all 160 households show <b>Unconfirmed</b>, and three messages arrive in the <b>Desk inbox</b>.`,
      why: `Khairiyat starts from the society’s own list and flags problems instead of guessing. “Unconfirmed” only means nobody has reached the household yet.`,
      checks: [['The Neelgiri register is imported (160 units)', (s) => s.scenario === 'neelgiri']],
      go: () => openModal('import', {})
    },
    {
      time: '09:00',
      title: 'Confirm the six vacant flats, with a source',
      situation: `The register notes six flats with no residents on record. Nobody needs to knock on those doors.`,
      actions: [
        `Click <b>Show me</b> below. It opens the <b>Unit register</b> and selects the six flats noted “no residents on record”.`,
        `In the blue selection bar, click <b>Confirm household: away / vacant…</b>`,
        `Keep the source <code>Register note: no residents on record</code> and click <b>Confirm away / vacant</b>.`
      ],
      expected: `<b>Households confirmed</b> rises to 6. Each of the six flats records the register note as its source.`,
      why: `Every confirmation records where the information came from. The register note is the only source here, so that is all Khairiyat records.`,
      checks: [['All six flats noted “no residents on record” are confirmed away / vacant, with a source', (s) => {
        const noted = s.order.filter((id) => s.flats[id].note);
        return noted.length === 6 && noted.every((id) => s.flats[id].status === 'confirmed' && s.flats[id].basis && s.flats[id].basis.kind === 'away');
      }]],
      go: () => selectFor({}, (id) => state.flats[id].note && state.flats[id].status === 'unconfirmed', 'Click “Confirm household: away / vacant…”.')
    },
    {
      time: '09:00',
      title: 'Apply the guard’s intercom round without inventing a channel',
      situation: `Ramesh in the guard room rang flats through the night. He says every call was on the intercom, but his list doesn’t say so line by line. Two of the society’s five guards have vanished, and Tower C’s intercom panel is down.`,
      actions: [
        `In the <b>Desk inbox</b>, on Ramesh’s message, click <b>Copy to bulk update</b>, then <b>Validate</b>. Every OK line is rejected: none names a channel.`,
        `Set <b>Channel for OK lines that don’t name one</b> to <b>Intercom</b> (Ramesh told you this), then <b>Validate</b> again: 93 lines are valid and 2 are not.`,
        `Click <b>Apply 93 valid lines</b>. The two wrong lines stay in the box.`,
        `In the box, change <code>A-1O3</code> to <code>A-103</code> (a zero, not the letter O) and delete the line <code>B-902,HELP</code> (it has no category; Ramesh calls back about it in step 5). Click <b>Validate</b>, <b>Apply 1 valid line</b>, then close the dialog.`
      ],
      expected: `100 households confirmed (6 + 93 + A-103). Each of these entries says “Intercom (batch setting)” and “reported by Guard room”.`,
      why: `Version 1 recorded an OK line without a channel as a door visit. Khairiyat now records only what the reporter said, and flags typos instead of silently correcting them.`,
      checks: [
        ['Guard’s lines applied with Intercom chosen as the batch channel', (s) => s.flags.guardBatch === 'INTERCOM'],
        ['A-103 confirmed after fixing the A-1O3 typo', (s) => isConfirmed(s, 'A-103')]
      ],
      go: () => {
        if (!state.flags.guardApplied) { openBulkFromMsg('guard'); return; }
        openModal('bulk', { by: 'Guard room (intercom round)', batch: 'INTERCOM', text: 'A-1O3,OK\nB-902,HELP' });
      }
    },
    {
      time: '09:00',
      title: 'Residents report for themselves, and a rumour',
      situation: `Two WhatsApp messages. The resident of A-402 says she and her children are fine, but her husband has been gone since yesterday evening. A resident of B-801 guesses that the B-704 family “probably vanished”.`,
      actions: [
        `In the inbox, on the A-402 message, click <b>Open A-402</b>, then <b>Confirm: adult reached…</b>`,
        `Choose <b>Message from the household</b>, type <code>Resident of A-402</code> in <b>Reported by</b>, tick <b>An adult (18+) in this household was reached</b>, and click <b>Confirm household</b>.`,
        `Record nothing for B-704. On the B-704 message, click <b>Mark handled</b>.`
      ],
      expected: `A-402 shows <b>Household confirmed</b>. Nothing about her husband is recorded anywhere. B-704 stays <b>Unconfirmed</b>.`,
      why: `“Confirmed” is household-level: it never means everyone linked to the flat is safe, and Khairiyat is not a register of missing people. A neighbour’s guess is not a source, so B-704 keeps waiting for a real check (step 17).`,
      checks: [
        ['A-402 confirmed: adult reached, message from the household', (s) => isConfirmed(s, 'A-402') && s.flats['A-402'].basis.channel === 'MESSAGE'],
        ['B-704 is still Unconfirmed (a rumour is not a source)', (s) => !!s.flats['B-704'] && s.flats['B-704'].status === 'unconfirmed'],
        ['The B-704 rumour is marked handled in the Desk inbox', (s) => !!(s.msgs.rumour704 && s.msgs.rumour704.handled)]
      ],
      go: () => openDrawer('A-402')
    },
    {
      time: '09:00',
      title: 'An older resident who has lost her carer',
      situation: `Ramesh calls back about the B-902 line. Mrs Bhalla answered the intercom herself. Her live-in attendant vanished yesterday, she uses a wheelchair, the Tower B lift has stopped because its operator is gone, and she has not eaten since last night.`,
      actions: [
        `Click <b>Show me</b> (opens B-902), then <b>Confirm: adult reached…</b> Choose <b>Intercom</b>, type <code>Guard room</code> in <b>Reported by</b>, tick the adult box <i>and</i> <b>They reported someone who may need help</b>. Click <b>Confirm household</b>.`,
        `The welfare form opens. Choose <b>Adult who can’t manage alone</b>, priority <b>Urgent</b> (your judgement: she is alone and hasn’t eaten), source <code>Guard’s intercom call</code>, then <b>Open welfare case</b>.`,
        `Click <b>Assign helper…</b>, type <code>Sunita (A-603)</code>, choose <b>+60 min</b>, click <b>Assign 1 unit</b>, then close the message dialog (Khairiyat never sends it).`,
        `Sunita’s reply arrives at once. Click <b>Record response…</b>, choose <b>YES</b> and <b>Phone call</b>, then <b>Record response</b>.`
      ],
      expected: `B-902 shows two separate records: <b>Household confirmed</b> and <b>Welfare case open</b>, with Sunita’s visit accepted and due at 10:00.`,
      why: `Reaching a household and resolving a welfare concern are different things. Confirming B-902 does not close her case.`,
      checks: [
        ['B-902 household confirmed: adult reached via Intercom', (s) => isConfirmed(s, 'B-902') && s.flats['B-902'].basis.channel === 'INTERCOM'],
        ['A welfare case was opened for B-902', (s) => !!caseAny(s, 'B-902')],
        ['A helper accepted the B-902 visit', (s) => tasksAll(s, 'B-902').some((t) => t.type !== 'check' && t.accept === 'accepted')]
      ],
      go: () => openDrawer('B-902')
    },
    {
      time: '09:00',
      title: 'Hand out the flats nobody has reached',
      situation: `Tower C’s intercom is down, so its 38 unconfirmed flats need door-to-door checks. Tower D’s upper floors weren’t reached either. One warden for all of Tower C would be too much.`,
      actions: [
        `Click <b>Show me</b>: it selects Tower C floors 6 to 10 (19 flats). Click <b>Assign follow-up…</b>, type <code>Arjun (C-304)</code>, choose <b>+45 min</b>, click <b>Assign 19 units</b>, and close the message.`,
        `Click <b>Show me</b> again: floors 1 to 5 (19 flats). Assign them to <code>Farhan (B-703)</code> with <b>+45 min</b>.`,
        `Click <b>Show me</b> a third time: Tower D floors 7 to 10 (15 flats). Assign them to <code>Meena (D-204)</code> with <b>+60 min</b>.`,
        `Optional: select all 38 Tower C flats for one person to see the workload warning, then cancel.`
      ],
      expected: `All three batches appear under <b>Unresolved work → Awaiting acceptance</b>. Next-step coverage does not rise: nobody has said yes yet.`,
      why: `An assignment is a request, not a commitment. Large lists for one person are flagged before they are sent.`,
      checks: [
        ['Arjun assigned in Tower C', (s) => Object.values(s.tasks).some((t) => /^arjun/i.test(t.owner) && s.flats[t.flatId].building === 'Tower C')],
        ['Farhan assigned in Tower C', (s) => Object.values(s.tasks).some((t) => /^farhan/i.test(t.owner) && s.flats[t.flatId].building === 'Tower C')],
        ['Meena assigned in Tower D', (s) => Object.values(s.tasks).some((t) => /^meena/i.test(t.owner) && s.flats[t.flatId].building === 'Tower D')]
      ],
      go: () => {
        const has = (re) => Object.values(state.tasks).some((t) => re.test(t.owner));
        if (!has(/^arjun/i)) selectFor({ fBuilding: 'Tower C' }, towerFloors('Tower C', 6, 10), 'Tower C floors 6 to 10. Click “Assign follow-up…” and type Arjun (C-304).');
        else if (!has(/^farhan/i)) selectFor({ fBuilding: 'Tower C' }, towerFloors('Tower C', 1, 5), 'Tower C floors 1 to 5. Click “Assign follow-up…” and type Farhan (B-703).');
        else selectFor({ fBuilding: 'Tower D' }, towerFloors('Tower D', 7, 10), 'Tower D floors 7 to 10. Click “Assign follow-up…” and type Meena (D-204).');
      }
    },
    {
      time: '09:15',
      title: 'Record who said yes, who said no, and reassign',
      situation: `Fifteen minutes later, Arjun and Meena reply YES. Farhan replies NO: his wife has been gone since yesterday and his children are alone at home. Rohit (B-501) is at the desk and offers to help.`,
      actions: [
        `Click <b>+15 min</b> in the header (the clock shows 09:15).`,
        `Open <b>Unresolved work</b>. Under <b>Awaiting acceptance</b>, next to Arjun, click <b>Record response…</b>, choose <b>YES</b> and <b>Reply by WhatsApp or SMS</b>, then <b>Record response</b>. Do the same for Meena.`,
        `Next to Farhan, click <b>Record response…</b>, choose <b>NO</b>, <b>Reply by WhatsApp or SMS</b>, and type the reason <code>Children alone at home</code>.`,
        `His 19 flats move to <b>Needs an owner</b>. Next to Tower C, click <b>Assign 19…</b>, type <code>Rohit (B-501)</code>, choose <b>+90 min</b> and assign. Then record Rohit’s YES (<b>In person at the desk</b>).`
      ],
      expected: `<b>Awaiting acceptance</b> returns to 0. Arjun’s, Meena’s and Rohit’s flats are now covered.`,
      why: `A decline goes straight back to the queue, instead of silently staying with someone who can’t do it.`,
      checks: [
        ['Clock at 09:15 or later (press +15 min)', (s) => s.clock >= START + 15],
        ['Arjun’s YES recorded', (s) => Object.values(s.tasks).some((t) => /^arjun/i.test(t.owner) && t.accept === 'accepted')],
        ['Meena’s YES recorded', (s) => Object.values(s.tasks).some((t) => /^meena/i.test(t.owner) && t.accept === 'accepted')],
        ['Farhan’s NO recorded, with his reason', (s) => Object.values(s.tasks).some((t) => /^farhan/i.test(t.owner) && /^Declined|^Reassigned/.test(t.outcome || ''))],
        ['Farhan’s flats reassigned, and the new owner’s YES recorded', (s) => {
          const fl = farhanFlats(s);
          return fl.length > 0 && fl.every((id) => s.flats[id].status === 'confirmed' || tasksAll(s, id).some((t) => !/^farhan/i.test(t.owner) && t.accept === 'accepted'));
        }]
      ],
      go: () => showTab('queue')
    },
    {
      time: '09:30',
      title: 'Apply Arjun’s door-to-door report',
      situation: `By 9:30 Arjun has knocked on his 19 flats. Most adults answered; many told him someone at home is gone, which he did not write down. At C-702 a child answered alone. C-804 and C-1004 didn’t answer. C-803’s family phoned him to say they are away.`,
      actions: [
        `Click <b>+15 min</b> (09:30).`,
        `On Arjun’s report in the inbox, click <b>Copy to bulk update</b>, then <b>Validate</b>. The first line is free text in Hinglish and is flagged.`,
        `Click <b>Apply 19 valid lines</b>, then close the dialog.`
      ],
      expected: `C-702 opens a welfare case with priority “Not yet assessed”. C-804 and C-1004 show “no answer” and need an owner. C-803 is confirmed away with its source. A relative’s call about C-804 arrives.`,
      why: `Khairiyat never interprets free text. Each of Arjun’s lines names its own channel (VISIT), so no batch channel is needed.`,
      checks: [
        ['Clock at 09:30 or later', (s) => s.clock >= START + 30],
        ['Arjun’s report applied: C-702 has a welfare case and C-803 is confirmed away', (s) => !!caseAny(s, 'C-702') && isConfirmed(s, 'C-803')],
        ['C-804 and C-1004 recorded as “no answer”', (s) => (s.flats['C-804'].attempts || 0) >= 1 && (s.flats['C-1004'].attempts || 0) >= 1]
      ],
      go: () => openBulkFromMsg('arjunReport', 'Arjun’s report arrives 15 demo-minutes after you record his YES. Press +15 min.')
    },
    {
      time: '09:30',
      title: 'A child without a capable caregiver',
      situation: `At C-702, a girl of about eight answered the door alone. She says her parents didn’t come home last night. Nobody knows why yet, and Khairiyat will not guess.`,
      actions: [
        `Click <b>Show me</b> (opens C-702). Click <b>Set priority…</b>, choose <b>Urgent</b>, type the reason <code>Young child alone</code>, then <b>Save priority</b>.`,
        `Click <b>Assign helper…</b>, type <code>Dr. Kavita (A-201)</code>, keep <b>+30 min</b>, assign, and close the message.`,
        `Kavita phones back: click <b>Record response…</b>, choose <b>YES</b> and <b>Phone call</b>.`
      ],
      expected: `C-702’s case shows <b>Urgent</b>, with Kavita’s visit accepted. The household stays <b>Unconfirmed</b>: only a child has been reached.`,
      why: `Priority is the coordinator’s judgement, not medical triage. A child answering the door does not confirm the household.`,
      checks: [
        ['C-702’s priority set by you (not “Not yet assessed”)', (s) => { const c = caseAny(s, 'C-702'); return !!c && c.priority !== 'unknown'; }],
        ['A helper accepted the C-702 visit', (s) => tasksAll(s, 'C-702').some((t) => t.type !== 'check' && t.accept === 'accepted')]
      ],
      go: () => openDrawer('C-702')
    },
    {
      time: '09:30',
      title: 'A relative’s worry about a silent flat',
      situation: `A caller says her mother, 78, lives alone in C-804 and hasn’t answered her phone since morning. Arjun got no answer there either. Neither fact proves anything has happened to her.`,
      actions: [
        `Click <b>Show me</b> (opens C-804), then <b>Report a welfare concern…</b> Choose <b>Adult who can’t manage alone</b>, leave the priority at <b>Not yet assessed</b>, type the source <code>Daughter’s phone call</code>, then <b>Open welfare case</b>.`,
        `Click <b>Assign helper…</b>, type <code>Nisha (D-503) + Imran (C-601)</code>, keep <b>+30 min</b>, assign, and close the message.`,
        `Record their YES (<b>Reply by WhatsApp or SMS</b>).`
      ],
      expected: `C-804 has an open case with two volunteers accepted. Its household stays <b>Unconfirmed</b>.`,
      why: `A worry is a reason to check, not evidence that she is missing. Two volunteers go together, and their message tells them never to force entry.`,
      checks: [
        ['A welfare case was opened for C-804', (s) => !!caseAny(s, 'C-804')],
        ['Two volunteers accepted the C-804 visit', (s) => tasksAll(s, 'C-804').some((t) => t.type === 'welfare' && t.accept === 'accepted')]
      ],
      go: () => openDrawer('C-804')
    },
    {
      time: '09:45',
      title: 'Helpers report back, and the cases stay open',
      situation: `At 9:45 Kavita is with the girl at C-702. Her aunt lives in D-603 in this society and is on her way. Sunita has been to B-902: Mrs Bhalla has eaten, the B-901 family will bring meals, and her daughter in Pune is trying to travel tomorrow. Longer-term care isn’t arranged.`,
      actions: [
        `Click <b>+15 min</b> (09:45).`,
        `Open C-702, click <b>Record interim update…</b>, choose <b>Helper is with the resident</b>, note <code>Aunt from D-603 on her way</code>, choose <b>+60 min</b>, then <b>Record update</b>.`,
        `Open B-902, click <b>Record interim update…</b>, choose <b>Visit made: more help needed</b>, note <code>Neighbours bringing meals; daughter travelling</code>, choose <b>+120 min</b>, then <b>Record update</b>.`
      ],
      expected: `Both cases stay open with new report deadlines (10:45 and 11:45). Neither household changes.`,
      why: `An update is progress, not an outcome. A case stays open until someone records what actually happened, with evidence.`,
      checks: [
        ['Clock at 09:45 or later', (s) => s.clock >= START + 45],
        ['Interim update recorded for C-702', (s) => { const c = caseAny(s, 'C-702'); return !!c && c.updates.length > 0; }],
        ['Interim update recorded for B-902', (s) => { const c = caseAny(s, 'B-902'); return !!c && c.updates.length > 0; }]
      ],
      go: () => { const c = caseAny(state, 'C-702'); openDrawer(c && c.updates.length ? 'B-902' : 'C-702'); }
    },
    {
      time: '09:45',
      title: 'No answer, and a service that hasn’t committed',
      situation: `Nisha and Imran went back to C-804: they rang, knocked and phoned. No answer. A neighbour hasn’t seen her since yesterday evening. They did not force the door. You phone the police control room yourself: every van is out, and they say they will call back.`,
      actions: [
        `Click <b>Show me</b> (opens C-804), click <b>Record “no answer”</b>, then <b>Record no answer</b>.`,
        `Click <b>Record contact with a service or person…</b> Choose <b>Police (100)</b> and <b>Reached them, but no commitment yet</b>. Keep the follow-up owner <code>Desk (coordinator)</code> and <b>+60 min</b>. Click <b>Record contact</b>.`
      ],
      expected: `The case shows <b>Contact attempted: no commitment yet</b>, with a follow-up owned (and accepted) by the desk, due 10:45.`,
      why: `A call to a service is not a handoff, and not an outcome. Khairiyat placed no call; it records what you did.`,
      checks: [
        ['C-804’s second “no answer” recorded', (s) => (s.flats['C-804'].attempts || 0) >= 2],
        ['Police call recorded without a commitment', (s) => { const c = caseAny(s, 'C-804'); return !!c && c.contacts.some((x) => /police/i.test(x.who) && x.result !== 'ACK'); }],
        ['Someone owns the follow-up', (s) => tasksAll(s, 'C-804').some((t) => t.type === 'followup')]
      ],
      go: () => openDrawer('C-804')
    },
    {
      time: '10:00',
      title: 'A new concern at a household that was already confirmed',
      situation: `At 10:00 a D-501 resident writes that the lady in D-502 has run out of her blood-pressure medicine; the chemist in the society market hasn’t opened since yesterday. D-502’s household was confirmed by the guard at 9:00. Meena’s Tower D tasks are now due.`,
      actions: [
        `Click <b>+15 min</b> (10:00). In the summary, Meena’s 15 flats count as <b>due now</b>: still hers, still covered.`,
        `Click <b>Show me</b> (opens D-502), then <b>Report a welfare concern…</b> Choose <b>Essentials (food, water, medicines)</b>, leave the priority at <b>Not yet assessed</b>, type the source <code>Neighbour’s WhatsApp message</code>, then <b>Open welfare case</b>.`,
        `Click <b>Assign helper…</b>, type <code>Nisha (D-503)</code>, choose <b>+60 min</b>, assign, close the message, and record her YES (<b>Phone call</b>).`
      ],
      expected: `D-502 keeps <b>Household confirmed</b> and gains an open case, with Nisha accepted and due at 11:00.`,
      why: `A confirmed household can still need help later. Khairiyat stores the category of concern, not the diagnosis.`,
      checks: [
        ['Clock at 10:00 or later', (s) => s.clock >= START + 60],
        ['A new case opened for D-502 while its household stays Confirmed', (s) => !!caseAny(s, 'D-502') && isConfirmed(s, 'D-502')],
        ['A helper accepted the D-502 visit', (s) => tasksAll(s, 'D-502').some((t) => t.type !== 'check' && t.accept === 'accepted')]
      ],
      go: () => openDrawer('D-502')
    },
    {
      time: '10:15',
      title: 'An overdue list: partial report and a justified extension',
      situation: `At 10:15 Meena’s deadline has passed. She writes that 9 flats are done (her lines are in the message), 6 are left, and the lift keeps stopping. She asks for 15 more minutes.`,
      actions: [
        `Click <b>+15 min</b> (10:15). <b>Overdue</b> shows 15: the tasks are still Meena’s.`,
        `On Meena’s message, click <b>Copy to bulk update</b>, <b>Validate</b>, then <b>Apply 9 valid lines</b> and close.`,
        `In <b>Unresolved work → Overdue</b>, next to Meena (6 flats), click <b>Extend deadline…</b>, choose <b>+15 min</b>, type the reason <code>Lift stopping; 6 flats left</code>, then <b>Extend deadline</b>.`
      ],
      expected: `9 more households are confirmed. Meena’s other 6 tasks stay hers, due 10:30, and <b>Overdue</b> returns to 0.`,
      why: `Overdue work doesn’t vanish or silently change hands. It stays flagged until you check in, extend it with a reason, or reassign it.`,
      checks: [
        ['Clock at 10:15 or later', (s) => s.clock >= START + 75],
        ['Meena’s completed flats applied from her message', (s) => isConfirmed(s, 'D-701') && /meena/i.test(s.flats['D-701'].basis.by || '')],
        ['Her overdue tasks extended with a reason (or reassigned)', (s) => !!s.flags.overdueHandled && !Object.values(s.tasks).some((t) => t.status === 'open' && /^meena/i.test(t.owner) && s.clock > t.due)]
      ],
      go: () => {
        if (!isConfirmed(state, 'D-701')) openBulkFromMsg('meenaLate', 'Meena’s message arrives once her deadline has passed. Press +15 min until the clock shows 10:15.');
        else showTab('queue');
      }
    },
    {
      time: '10:15',
      title: 'Outcomes, recorded with evidence',
      situation: `Kavita reports that the aunt from D-603 has arrived and will stay with the girl at C-702; Kavita saw them together. Then C-804’s son phones: his mother has been with him in Faridabad since yesterday afternoon, and her phone was left at home. He spoke to her a moment ago.`,
      actions: [
        `Open C-702, click <b>Confirm: adult reached…</b>, choose <b>Door visit</b>, reported by <code>Dr. Kavita (A-201)</code>, tick the adult box, then <b>Confirm household</b>. The case stays open.`,
        `Click <b>Close case with outcome…</b>, choose <b>Care in place</b>, details <code>Aunt from D-603 staying with the child</code>, evidence <b>Seen in person by a volunteer or helper</b>, then <b>Close case</b>.`,
        `Open C-804, click <b>Close case with outcome…</b>, choose <b>Resident located elsewhere and safe</b>, details <code>With her son in Faridabad</code>, evidence <b>Spoke to family or the carer</b>, then <b>Close case</b>.`,
        `C-804’s household is still Unconfirmed. Click <b>Confirm: away / vacant…</b>, source <code>Son phoned the desk</code>, then <b>Confirm away / vacant</b>. (Phone the police yourself to tell them.)`
      ],
      expected: `Both cases close with their evidence. C-804’s household is recorded separately, with the son as its source.`,
      why: `Closing a case needs an outcome and evidence, and never confirms a household by itself (or the other way round). The son’s call replaces the daughter’s earlier worry, and both stay in the history.`,
      checks: [
        ['C-702 household confirmed', (s) => isConfirmed(s, 'C-702')],
        ['C-702 case closed: Care in place, seen in person', (s) => { const c = caseAny(s, 'C-702'); return !!c && c.status === 'closed' && c.outcome.type === 'CARE' && c.outcome.evidence === 'SEEN'; }],
        ['C-804 case closed with family or resident evidence', (s) => { const c = caseAny(s, 'C-804'); return !!c && c.status === 'closed' && ['FAMILY', 'RESIDENT'].includes(c.outcome.evidence); }],
        ['C-804 household recorded separately', (s) => isConfirmed(s, 'C-804')]
      ],
      go: () => { const c = caseAny(state, 'C-702'); openDrawer(c && c.status === 'closed' ? 'C-804' : 'C-702'); }
    },
    {
      time: '10:15',
      title: 'A unit entered under the wrong number',
      situation: `Ramesh realises he wrote B-203 on his list by mistake: he actually spoke to B-302. Nobody has reached B-203.`,
      actions: [
        `Click <b>Show me</b> (opens B-203), click <b>Correct household status…</b>, type the reason <code>Guard entered B-203 by mistake; it was B-302</code>, then <b>Save correction</b>.`,
        `Open B-302, click <b>Confirm: adult reached…</b>, choose <b>Intercom</b>, reported by <code>Guard room</code>, tick the adult box, then <b>Confirm household</b>.`
      ],
      expected: `B-203 is <b>Unconfirmed</b> again. Its history still shows the original entry and the correction, with the reason.`,
      why: `Nothing is overwritten or deleted. A correction is a new entry with a reason.`,
      checks: [
        ['B-203 corrected back to Unconfirmed, with a reason', (s) => hasEventIn(s, 'B-203', 'correction')],
        ['B-302 confirmed', (s) => isConfirmed(s, 'B-302')]
      ],
      go: () => openDrawer(hasEventIn(state, 'B-203', 'correction') ? 'B-302' : 'B-203')
    },
    {
      time: '10:15',
      title: 'Give every remaining flat an accepted next step',
      situation: `Six flats have nobody assigned: A-302, A-604 and A-1003 (no answer on the intercom), B-704 (the rumour), B-203 (after the correction) and C-1004 (no answer). Arjun has finished his list and offers to take them.`,
      actions: [
        `In <b>Unresolved work → Needs an owner</b>, click <b>Assign all 6 flats needing an owner…</b>, type <code>Arjun (C-304)</code>, choose <b>+60 min</b>, assign, and close the message.`,
        `Record Arjun’s YES (<b>Reply by WhatsApp or SMS</b>) under <b>Awaiting acceptance</b>.`
      ],
      expected: `<b>Need an owner</b>, <b>Awaiting acceptance</b>, <b>Overdue</b> and <b>Due now</b> are all 0. Khairiyat records when next-step coverage was first reached, and still lists every unconfirmed household and open case.`,
      why: `Coverage means every unresolved item has someone who said yes and a deadline that hasn’t passed. It is a coordination measure, not a safety measure.`,
      checks: [
        ['No unit needs an owner', () => stats().none === 0],
        ['No assignment is awaiting acceptance', () => stats().pending === 0],
        ['Nothing is due now or overdue', () => { const st = stats(); return st.overdue === 0 && st.dueNow === 0; }]
      ],
      go: () => showTab('queue')
    },
    {
      time: '10:15',
      title: 'Final review: hand over honestly',
      situation: `It is 10:15. The emergency is not over, and it won’t be by lunchtime. What the desk can do is leave nothing unowned, unaccepted, overdue or unexplained, so another coordinator could take over now.`,
      actions: [
        `Open the <b>Society update</b> tab and click <b>Copy update</b>. It contains totals only.`,
        `Click <b>Open handover summary</b> below (or <b>More → Handover summary</b>) and read what is still open, and why.`
      ],
      expected: `The summary below lists the households still unconfirmed, each with an accepted owner and deadline, and two welfare cases (B-902 and D-502) that remain open on purpose, with their reasons.`,
      why: `A clean screen would be dishonest: Mrs Bhalla’s care and D-502’s medicine are not settled. Complete here means every item is visible, owned, accepted and in time.`,
      checks: [
        ['Steps 1 to 17 are complete', () => GUIDE.slice(0, -1).every((g, i) => stepDone(i))],
        ['Every scripted message has arrived and been handled', () => !openMsgs().length && !waitingMsgs().length],
        ['Nothing needs an owner, awaits acceptance, or is due or overdue', () => { const st = stats(); return st.gaps === 0 && st.dueNow === 0; }],
        ['Society update generated after coverage was reached', (s) => s.flags.updateCopiedAt != null && s.coverAt != null && s.flags.updateCopiedAt >= s.coverAt]
      ],
      go: () => openModal('handover')
    }
  ];

  function stepDone(i) {
    try { return GUIDE[i].checks.every((c) => !!c[1](state)); } catch (e) { return false; }
  }
  function guideIndex() {
    const n = state.flags.guideStep;
    return Number.isInteger(n) && n >= 0 && n < GUIDE.length ? n : 0;
  }
  // waiting: not arrived · open: needs action · actioned: its step is complete · marked: marked handled by hand
  function msgStatus(id) {
    const m = state.msgs[id];
    if (!m || m.status !== 'arrived') return 'waiting';
    if (m.handled) return 'marked';
    return stepDone(specOf(id).step - 1) ? 'actioned' : 'open';
  }
  const openMsgs = () => MSG_SPECS.filter((sp) => msgStatus(sp.id) === 'open');
  const waitingMsgs = () => MSG_SPECS.filter((sp) => msgStatus(sp.id) === 'waiting');

  function renderAside() {
    const isDemo = state.scenario === 'neelgiri';
    const guide = state.order.length && !isDemo
      ? `<section class="side guide" aria-labelledby="guide-h"><header class="side-head"><h2 id="guide-h">Walkthrough</h2></header>
          <p class="side-note">The walkthrough and its scripted messages follow the fictional Neelgiri register. This register works with every feature, but no scripted messages will arrive. To return to the walkthrough, use <b>More → Reset demo, Neelgiri register loaded</b>.</p></section>`
      : guideHtml();
    $('#aside').innerHTML = guide + inboxHtml();
  }

  function guideHtml() {
    const i = guideIndex();
    const g = GUIDE[i];
    const last = GUIDE.length - 1;
    const doneList = GUIDE.map((_, k) => stepDone(k));
    const nDone = doneList.filter(Boolean).length;
    const head = `<header class="side-head"><h2 id="guide-h">Walkthrough</h2><span class="side-count">Step ${i + 1} of ${GUIDE.length}</span>
      <button class="btn btn-sm btn-ghost" data-action="toggle-guide" aria-expanded="${ui.guideOpen}">${ui.guideOpen ? 'Hide' : 'Show'}</button></header>
      <div class="progress" role="progressbar" aria-label="Walkthrough progress" aria-valuemin="0" aria-valuemax="${GUIDE.length}" aria-valuenow="${nDone}"><span style="width:${Math.round((nDone / GUIDE.length) * 100)}%"></span></div>
      <p class="progress-text">${nDone} of ${GUIDE.length} steps complete</p>`;
    if (!ui.guideOpen) return `<section class="side guide" aria-labelledby="guide-h">${head}<p class="side-note">Current step: <b>${esc(g.title)}</b></p></section>`;
    const results = g.checks.map(([label, fn]) => { let ok = false; try { ok = !!fn(state); } catch (e) { ok = false; } return { label, ok }; });
    const done = results.every((r) => r.ok);
    const missing = results.filter((r) => !r.ok).length;
    const msgs = MSG_SPECS.filter((sp) => sp.step === i + 1);
    const msgText = (sp) => {
      const st = msgStatus(sp.id);
      const m = state.msgs[sp.id];
      if (st === 'waiting') return `<li class="m-waiting"><span class="ck" aria-hidden="true">○</span> <b>${esc(sp.label)}</b>: not arrived yet. ${esc(sp.expect)}</li>`;
      if (st === 'open') return `<li class="m-open"><span class="ck" aria-hidden="true">●</span> <b>${esc(sp.label)}</b>: arrived ${hhmm(m.arrivedAt)}, waiting in the Desk inbox.</li>`;
      return `<li class="m-done"><span class="ck" aria-hidden="true">✓</span> <b>${esc(sp.label)}</b>: arrived ${hhmm(m.arrivedAt)}, ${st === 'marked' ? 'marked handled' : 'actioned'}.</li>`;
    };
    const steps = ui.stepsOpen ? `<ol class="all-steps">${GUIDE.map((s, k) => `<li class="${doneList[k] ? 'done' : ''}${k === i ? ' current' : ''}"><button class="step-link" data-action="guide-jump" data-step="${k}"${k === i ? ' aria-current="step"' : ''}><span class="ck" aria-hidden="true">${doneList[k] ? '✓' : k + 1}</span><span>${esc(s.title)}</span><span class="muted">${s.time}</span><span class="sr-only">${doneList[k] ? ' (complete)' : ''}</span></button></li>`).join('')}</ol>` : '';
    return `<section class="side guide" aria-labelledby="guide-h">${head}
      <article class="step">
        <p class="step-kicker">Step ${i + 1} · demo time ${g.time}</p>
        <h3 class="step-title">${esc(g.title)}</h3>
        <h4>What has happened</h4><p>${g.situation}</p>
        ${i === 0 ? '<p><button class="btn-link" data-action="open-scenario">Read the full scenario</button></p>' : ''}
        <h4>Do this</h4><ol class="step-actions">${g.actions.map((a) => `<li>${a}</li>`).join('')}</ol>
        <h4>You should see</h4><p>${g.expected}</p>
        <h4>Why it matters</h4><p>${g.why}</p>
        ${msgs.length ? `<h4>Messages for this step</h4><ul class="step-msgs">${msgs.map(msgText).join('')}</ul>` : ''}
        ${i === last ? endStateHtml(true) : ''}
        <h4>Done when</h4>
        <ul class="checklist">${results.map((r) => `<li class="${r.ok ? 'ok' : 'todo'}"><span class="ck" aria-hidden="true">${r.ok ? '✓' : '○'}</span> ${esc(r.label)}<span class="sr-only">${r.ok ? ' (done)' : ' (not yet)'}</span></li>`).join('')}</ul>
        <p class="step-status${done ? ' ok' : ''}" role="status">${done ? (i === last ? 'Walkthrough complete. The desk is in a state another coordinator could take over.' : 'Step complete. Read “You should see”, then go to the next step.') : `Still missing: ${missing} of ${results.length} (marked ○ above).`}</p>
        <div class="step-nav">
          <button class="btn btn-sm" data-action="guide-prev" ${i === 0 ? 'disabled' : ''}>Back</button>
          ${g.go ? `<button class="btn btn-sm" data-action="guide-go">${i === last ? 'Open handover summary' : 'Show me'}</button>` : ''}
          ${i < last ? `<button class="btn btn-sm btn-primary" data-action="guide-next" ${done ? '' : 'disabled'}>Next step</button>` : ''}
        </div>
      </article>
      <button class="btn-link steps-toggle" data-action="toggle-steps" aria-expanded="${!!ui.stepsOpen}">${ui.stepsOpen ? 'Hide the list of steps' : `All ${GUIDE.length} steps (go back or jump ahead)`}</button>
      ${steps}
    </section>`;
  }

  // Live end-of-walkthrough summary; also the core of the handover summary.
  function endState() {
    const st = stats();
    const isDemo = state.scenario === 'neelgiri';
    return {
      st,
      openCases: state.order.map((id) => state.flats[id]).filter((f) => caseOf(f)),
      msgsOpen: isDemo ? openMsgs() : [],
      msgsWaiting: isDemo ? waitingMsgs() : [],
      stepsLeft: isDemo ? GUIDE.slice(0, -1).map((g, k) => k).filter((k) => !stepDone(k)) : []
    };
  }
  function endStateHtml(compact) {
    const e = endState();
    const st = e.st;
    const row = (label, n, bad, note) => `<li class="${bad && n ? 'bad' : ''}"><span>${label}</span><b>${n}</b>${note ? `<span class="muted">${note}</span>` : ''}</li>`;
    return `<div class="endstate">
      <h4>${compact ? 'Where things stand now' : 'At a glance'}</h4>
      <ul class="endlist">
        ${row('Households still unconfirmed', st.unconfirmed, false, st.unconfirmed ? `${st.coveredUnconfirmed} with an accepted next check` : '')}
        ${row('Welfare cases still open', st.cases, false, st.cases ? (compact ? 'each listed in the handover summary, with its reason' : 'each listed below, with its reason') : '')}
        ${row('Next steps needing an owner', st.none, true)}
        ${row('Assignments awaiting acceptance', st.pending, true)}
        ${row('Tasks due now', st.dueNow, true)}
        ${row('Tasks overdue', st.overdue, true)}
        ${state.scenario === 'neelgiri' ? row('Scripted messages not handled', e.msgsOpen.length + e.msgsWaiting.length, true, e.msgsWaiting.length ? `${e.msgsWaiting.length} not arrived yet` : '') : ''}
        ${state.scenario === 'neelgiri' ? row('Earlier walkthrough steps incomplete', e.stepsLeft.length, true, e.stepsLeft.length ? `step${e.stepsLeft.length > 1 ? 's' : ''} ${e.stepsLeft.map((k) => k + 1).join(', ')}` : '') : ''}
      </ul>
    </div>`;
  }

  function inboxHtml() {
    const isDemo = state.scenario === 'neelgiri';
    const cur = guideIndex() + 1;
    const arrived = MSG_SPECS.filter((sp) => state.msgs[sp.id].status === 'arrived');
    const rank = (sp) => { const st = msgStatus(sp.id); return st === 'open' ? (sp.step === cur ? 0 : 1) : 2; };
    const ordered = arrived.slice().sort((a, b) => rank(a) - rank(b) || (rank(a) < 2 ? a.step - b.step : 0) || state.msgs[b.id].seq - state.msgs[a.id].seq);
    const open = arrived.filter((sp) => msgStatus(sp.id) === 'open').length;
    const waiting = isDemo ? MSG_SPECS.length - arrived.length : 0;
    const body = !ui.inboxOpen ? '' : `<p class="side-note">Scripted demo messages, as they might arrive by WhatsApp, phone or intercom. <b>Khairiyat doesn’t read them</b>: you decide what to record. Each is labelled with its walkthrough step.</p>
      ${arrived.length ? ordered.map((sp) => msgCard(sp, state.msgs[sp.id], cur)).join('') : `<p class="empty-mini">No messages yet. ${!state.order.length ? 'They start when the Neelgiri register is imported.' : isDemo ? 'More arrive as the demo clock moves and as you act.' : 'Scripted messages only run with the Neelgiri register.'}</p>`}
      ${isDemo && waiting ? `<p class="side-note">${plural(waiting, 'more scripted message')} will arrive later in the walkthrough.</p>` : ''}`;
    return `<section class="side inbox" aria-labelledby="inbox-h">
      <header class="side-head"><h2 id="inbox-h">Desk inbox <span lang="hi" class="hi">डेस्क पर संदेश</span></h2><span class="side-count${open ? ' attn' : ''}">${open ? `${open} need action` : 'Nothing waiting'}</span>
        <button class="btn btn-sm btn-ghost" data-action="toggle-inbox" aria-expanded="${ui.inboxOpen}">${ui.inboxOpen ? 'Hide' : 'Show'}</button></header>
      ${body}
    </section>`;
  }

  function msgCard(sp, m, cur) {
    const d = m.data;
    const id = sp.id;
    const st = msgStatus(id);
    const tag = st === 'open' && sp.step === cur ? '<span class="msg-step now">For this step</span>' : `<span class="msg-step">Step ${sp.step}</span>`;
    if (st !== 'open' && !ui.msgOpen.has(id)) {
      return `<article class="msg done"><div class="msg-line"><span class="msg-from"><span aria-hidden="true">✓</span> ${esc(d.from)}</span><span class="msg-meta">${hhmm(m.arrivedAt)} · Step ${sp.step} · ${st === 'marked' ? 'marked handled' : 'actioned'}</span><button class="btn btn-xs btn-ghost" data-action="msg-expand" data-msg="${id}">Show</button></div></article>`;
    }
    return `<article class="msg${st === 'open' && sp.step === cur ? ' current' : ''}${st !== 'open' ? ' done' : ''}" data-msg="${id}">
      <header><span class="msg-from">${esc(d.from)}</span>${tag}</header>
      <p class="msg-meta">${esc(d.channel)} · ${hhmm(m.arrivedAt)}${st === 'actioned' ? ' · actioned' : st === 'marked' ? ' · marked handled' : ''}</p>
      <p class="msg-text" lang="hi-Latn">${esc(d.text)}</p>
      ${d.translation ? `<p class="msg-tr">${esc(d.translation)}</p>` : ''}
      ${d.lines ? `<details class="msg-lines"><summary>${d.lineCount} lines</summary><pre>${esc(d.lines)}</pre></details>` : ''}
      <p class="msg-hint">${esc(d.hint)}</p>
      <div class="msg-actions">
        ${d.lines && st === 'open' ? `<button class="btn btn-sm btn-primary" data-action="msg-bulk" data-msg="${id}">Copy to bulk update</button>` : ''}
        ${d.flat ? `<button class="btn btn-sm" data-action="open-flat" data-id="${esc(d.flat)}">Open ${esc(d.flat)}</button>` : ''}
        ${st === 'open' ? `<button class="btn btn-sm btn-ghost" data-action="msg-handled" data-msg="${id}">Mark handled</button>` : ''}
        ${st === 'marked' ? `<button class="btn btn-sm btn-ghost" data-action="msg-handled" data-msg="${id}">Mark as not handled</button>` : ''}
        ${st !== 'open' ? `<button class="btn btn-sm btn-ghost" data-action="msg-expand" data-msg="${id}">Hide</button>` : ''}
      </div>
    </article>`;
  }

  // ── Unit drawer ────────────────────────────────────────────────────────────
  function openDrawer(id) {
    if (!state.flats[id]) { toast(state.order.length ? `${id} isn’t in the register.` : 'Import the register first (step 1).', 'warn'); return; }
    ui.lastFocus = document.activeElement;
    ui.drawer = id;
    ui.drawerNotice = null;
    ui.revealCase = false;
    renderDrawer();
    const h = $('#drawer-title');
    if (h) h.focus();
  }
  function closeDrawer() {
    ui.drawer = null;
    renderDrawer();
    if (ui.lastFocus && document.body.contains(ui.lastFocus)) ui.lastFocus.focus();
  }

  function renderDrawer() {
    const root = $('#drawer-root');
    const f = ui.drawer && state.flats[ui.drawer];
    if (!f) { root.innerHTML = ''; return; }
    const id = esc(f.id);
    const t = openTask(f);
    const cov = coverage(f);
    const c = caseOf(f);
    const last = !c && f.lastCaseId ? state.cases[f.lastCaseId] : null;

    let next;
    if (cov === 'resolved') next = '<div class="own-box ok">Nothing outstanding: household confirmed and no open welfare case.</div>';
    else if (!t) next = `<div class="own-box danger"><strong>Needs an owner.</strong> Nobody has been asked to take the next step.${f.attempts ? ` Attempts so far: no answer ×${f.attempts} (not evidence of anything).` : ''}</div>`;
    else {
      const ds = dueState(t);
      const tone = ds === 'overdue' ? 'danger' : t.accept === 'pending' || ds === 'due' ? 'warn' : '';
      next = `<div class="own-box ${tone}">
        <div><span class="lbl">Owner · ज़िम्मेदार</span> <strong>${esc(t.owner)}</strong> · ${TASK_TYPE[t.type]}${t.contact ? ` <span class="muted">(${esc(t.contact)})</span>` : ''}</div>
        <div><span class="lbl">Acceptance</span> ${t.accept === 'accepted' ? `Accepted at ${hhmm(t.acceptedAt)} (${esc(t.acceptedVia)})` : '<strong>Awaiting acceptance</strong>: not counted as covered'}</div>
        <div><span class="lbl">Deadline · समय सीमा</span> ${dueHtml(t)}${t.extensions.length ? ` <span class="muted">(extended ${t.extensions.length}×)</span>` : ''}</div>
        ${ds === 'overdue' ? `<div>The deadline has passed. It is still ${esc(t.owner)}’s task: check in, extend with a reason, or reassign.</div>` : ''}
      </div>`;
    }
    const nextActions = cov === 'resolved' ? '' : `<div class="act-row">
        <button class="btn${!t ? ' btn-primary' : ''}" data-action="assign-ids" data-ids="${id}">${t ? 'Reassign…' : c ? 'Assign helper…' : 'Assign follow-up…'}</button>
        ${t && t.accept === 'pending' ? `<button class="btn btn-primary" data-action="respond" data-tasks="${esc(t.id)}">Record response…</button>` : ''}
        ${t ? `<button class="btn" data-action="extend" data-tasks="${esc(t.id)}">Extend deadline…</button><button class="btn" data-action="checkin" data-tasks="${esc(t.id)}">Record check-in…</button>` : ''}
        <button class="btn" data-action="act-noanswer" data-id="${id}" ${t ? '' : 'disabled'}>Record “no answer”</button>
      </div>${t ? '' : '<p class="micro">“No answer” records an attempt on an assigned task, so assign someone first.</p>'}`;

    const household = `<section class="d-sec"><h3>Household · घर</h3>
      ${householdChip(f.status)}
      <p class="d-desc">${f.status === 'confirmed' ? `Confirmed: ${esc(basisText(f.basis))} · ${hhmm(f.basis.at)}` : 'Not reached yet. This is <strong>not</strong> evidence that anyone has vanished or needs help.'}</p>
      <p class="micro">Household-level only: this isn’t a check on every person linked to the unit.${c ? ' Confirming or correcting the household never changes the welfare case.' : ''}</p>
      <div class="act-row">${f.status === 'unconfirmed'
        ? `<button class="btn act-ok" data-action="act-confirm-adult" data-id="${id}"><span aria-hidden="true">✓</span> Confirm: adult reached…</button><button class="btn act-ok" data-action="act-confirm-away" data-id="${id}"><span aria-hidden="true">✓</span> Confirm: away / vacant…</button>`
        : `<button class="btn" data-action="act-correct" data-id="${id}">Correct household status…</button>`}</div>
    </section>`;

    let welfare;
    if (c) {
      const body = ui.revealCase
        ? `<dl class="kv">
            <dt>Reported concern</dt><dd>${esc(CONCERN[c.concern])}${c.note ? ` (${esc(c.note)})` : ''}</dd>
            <dt>Source</dt><dd>${esc(c.source)}</dd>
            <dt>Opened</dt><dd>${hhmm(c.openedAt)}</dd>
            <dt>Updates</dt><dd>${c.updates.length ? c.updates.map((u) => `${hhmm(u.at)} · ${esc(u.type)} (${esc(u.by)})${u.note ? `: ${esc(u.note)}` : ''}`).join('<br>') : 'None yet'}</dd>
            <dt>Contacts</dt><dd>${c.contacts.length ? c.contacts.map((x) => `${hhmm(x.at)} · ${esc(x.who)}: ${esc(CONTACT_RESULT[x.result])}${x.recipient ? ` (${esc(x.recipient)})` : ''}${x.reference ? `, ref ${esc(x.reference)}` : ''}`).join('<br>') : 'None'}</dd>
          </dl><button class="btn btn-sm btn-ghost" data-action="reveal-case">Hide case details</button>`
        : '<p class="masked-block">Case details are hidden on screen. <button class="btn btn-sm" data-action="reveal-case">Show case details</button></p>';
      welfare = `<section class="d-sec case-sec"><h3>Welfare case · हालचाल जाँच ${priorityBadge(c.priority)}</h3>
        <p class="d-desc"><span class="stage-tag stage-${c.stage}">${STAGE[c.stage]}</span></p>
        ${body}
        <div class="act-row">
          <button class="btn" data-action="act-priority" data-id="${id}">Set priority…</button>
          <button class="btn" data-action="act-interim" data-id="${id}" ${t ? '' : 'disabled'}>Record interim update…</button>
          <button class="btn" data-action="act-contact" data-id="${id}">Record contact with a service or person…</button>
        </div>
        <div class="act-row">
          <button class="btn btn-primary" data-action="act-close-case" data-id="${id}">Close case with outcome…</button>
          <button class="btn btn-ghost" data-action="act-withdraw" data-id="${id}">Correct: opened in error…</button>
        </div>
        <p class="micro danger-note">Not medical triage. If anyone may be in immediate danger, call emergency services directly now; don’t wait for this desk. Hiding details is a display setting, not access control.</p>
      </section>`;
    } else {
      welfare = `<section class="d-sec"><h3>Welfare · हालचाल</h3>
        <p class="d-desc">No open welfare case.${last ? ` Last case closed at ${hhmm(last.closedAt)}: <strong>${esc(OUTCOME[last.outcome.type].label)}</strong>${last.outcome.evidence && last.outcome.type !== 'WITHDRAWN' ? ` (${esc(EVIDENCE[last.outcome.evidence])})` : ''}.` : ''}</p>
        <div class="act-row"><button class="btn act-wel" data-action="act-welfare" data-id="${id}">◆ Report a welfare concern…</button>${last ? `<button class="btn btn-ghost" data-action="act-reopen" data-id="${id}">Reopen last case…</button>` : ''}</div>
      </section>`;
    }

    const evs = state.events.filter((e) => e.flatId === f.id).slice().reverse();
    root.innerHTML = `<div class="drawer-backdrop" data-action="close-drawer"></div>
      <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <header class="drawer-head">
          <div><h2 id="drawer-title" tabindex="-1">${id}</h2><div class="muted small">${[f.building, f.floor ? `Floor ${f.floor}` : '', f.note ? `Register: ${f.note}` : ''].filter(Boolean).map(esc).join(' · ') || 'No building or floor recorded'} · <button class="btn-link small" data-action="act-edit" data-id="${id}">Edit details</button></div></div>
          <button class="icon-btn" data-action="close-drawer" aria-label="Close ${id}">×</button>
        </header>
        <div class="drawer-body">
          <section class="d-sec summary-chips">${householdChip(f.status)} ${c ? caseChip() : ''}</section>
          ${ui.drawerNotice ? `<div class="notice ${ui.drawerNotice.tone}" role="alert">${ui.drawerNotice.html}</div>` : ''}
          <section class="d-sec"><h3>Next step <span class="muted small">(only valid actions are offered)</span></h3>${next}${nextActions}</section>
          ${household}
          ${welfare}
          <section class="d-sec"><h3>History · इतिहास <span class="muted small">(${evs.length})</span></h3>
            ${evs.length ? `<ol class="timeline">${evs.map((e) => `<li class="k-${e.kind}"><span class="tl-time">${hhmm(e.t)}</span><span class="kind kind-${e.kind}">${KIND_LABEL[e.kind] || e.kind}</span><div>${eventText(e)}</div></li>`).join('')}</ol>` : '<p class="empty-line">No entries yet.</p>'}
          </section>
        </div>
      </aside>`;
  }

  // ── Modals ─────────────────────────────────────────────────────────────────
  let modal = null;
  function openModal(type, params) {
    if (!modal) ui.lastFocusModal = document.activeElement;
    modal = { type, p: params || {} };
    renderModal(true);
  }
  function closeModal() {
    modal = null;
    renderModal();
    if (ui.lastFocusModal && document.body.contains(ui.lastFocusModal)) ui.lastFocusModal.focus();
  }
  function renderModal(focus) {
    const root = $('#modal-root');
    if (!modal) { root.innerHTML = ''; document.body.classList.remove('modal-open'); return; }
    const def = MODALS[modal.type](modal.p);
    root.innerHTML = `<div class="modal-backdrop" data-action="modal-backdrop">
      <div class="modal${def.wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header class="modal-head"><h2 id="modal-title">${def.title}</h2><button class="icon-btn" data-action="close-modal" aria-label="Close dialog">×</button></header>
        <div class="modal-body">${def.body}</div>
      </div></div>`;
    document.body.classList.add('modal-open');
    if (focus) {
      const el = root.querySelector('[autofocus], textarea:not([readonly]), input:not([type=hidden]):not([type=radio]):not([type=checkbox]), select, button.btn-primary');
      if (el) el.focus();
    }
  }
  function setErrors(form, errs) {
    form.querySelectorAll('[data-err]').forEach((el) => { el.textContent = ''; });
    let first = null;
    Object.entries(errs).forEach(([k, v]) => {
      const el = form.querySelector(`[data-err="${k}"]`);
      if (el) el.textContent = v;
      const input = form.querySelector(`[name="${k}"]`);
      if (input && !first) first = input;
    });
    if (first) first.focus();
    return Object.keys(errs).length === 0;
  }
  const field = (name, label, input, extra) => `<div class="field"><label for="f-${name}">${label}</label>${input}${extra || ''}<div class="field-error" data-err="${name}" role="alert"></div></div>`;
  const peopleInput = (name, value, ph) => `<input id="f-${name}" name="${name}" list="people-list" value="${esc(value || '')}" placeholder="${esc(ph || '')}" maxlength="60" autocomplete="off">`;
  const radios = (name, map, checked) => `<div class="radio-list">${Object.entries(map).map(([k, v]) => `<label><input type="radio" name="${name}" value="${esc(k)}" ${k === checked ? 'checked' : ''}> ${v}</label>`).join('')}</div>`;
  function deadlineField(def, name = 'at', legend = 'Deadline · समय सीमा') {
    return `<fieldset class="field"><legend>${legend}</legend>
      <div class="radio-chips">${DEADLINES.map((m) => `<label><input type="radio" name="rel" value="${m}" ${m === def ? 'checked' : ''}><span>+${m} min<small>${hhmm(state.clock + m)}</small></span></label>`).join('')}</div>
      <div class="or-row"><label for="f-${name}">or a specific time</label> <input id="f-${name}" type="time" name="${name}" step="300"></div>
      <div class="field-error" data-err="${name}" role="alert"></div></fieldset>`;
  }
  function readDeadline(fd, errs, name = 'at') {
    const at = fd.get(name);
    if (at) {
      const m = /^(\d{2}):(\d{2})$/.exec(at);
      const min = m ? Number(m[1]) * 60 + Number(m[2]) + Math.floor(state.clock / 1440) * 1440 : NaN;
      if (!(min > state.clock)) { errs[name] = `Pick a time later than the demo clock (${hhmm(state.clock)}).`; return null; }
      return min;
    }
    const rel = Number(fd.get('rel'));
    if (!rel) { errs[name] = 'Choose a deadline.'; return null; }
    return state.clock + rel;
  }
  const chipsPreview = (ids, max = 30) => `<div class="chips small">${ids.slice(0, max).map((id) => `<span class="chip st-${state.flats[id] ? state.flats[id].status : 'unconfirmed'} static">${esc(id)}</span>`).join('')}${ids.length > max ? `<span class="muted">+${ids.length - max} more</span>` : ''}</div>`;
  const dangerNote = '<p class="notice danger small"><strong>Not medical triage.</strong> If anyone may be in immediate danger, call emergency services directly now. Don’t wait for this desk or this app.</p>';

  const MODALS = {
    import: (p) => {
      const has = state.order.length > 0;
      const v = p.preview;
      const colNames = { unit: 'UNIT', building: 'BUILDING', floor: 'FLOOR', note: 'NOTE' };
      return {
        title: 'Import the register · फ़्लैट सूची',
        wide: true,
        body: `<p class="lead">Paste the society’s register as CSV, one row per unit. A header row is recommended: <code>UNIT</code> (required), and optionally <code>BUILDING</code> or <code>TOWER</code>, <code>FLOOR</code> and <code>NOTE</code>. Without a header, columns are read in that order. Unit identifiers are kept exactly as written (leading zeros, slashes, spaces). Nothing is inferred from their format.</p>
          <form data-form="import-validate" novalidate>
            ${field('society', 'Society name (shown in messages and updates)', `<input id="f-society" name="society" maxlength="80" value="${esc(p.society || state.settings.society)}">`)}
            ${field('text', 'Register CSV', `<textarea id="f-text" name="text" rows="9" class="mono" spellcheck="false" placeholder="UNIT,BUILDING,FLOOR,NOTE&#10;A-1204,Tower A,12,&#10;Villa 17,,,">${esc(p.text || '')}</textarea>`)}
            <div class="insert-row"><span class="muted">Insert a fictional sample:</span>${Object.entries(SAMPLES).map(([k, s]) => `<button type="button" class="btn btn-sm" data-action="import-sample" data-sample="${k}">${esc(s.label)}</button>`).join('')}</div>
            <div class="form-actions"><button type="submit" class="btn btn-primary">Validate</button></div>
          </form>
          ${v ? `<div class="preview">
            <div class="preview-sum"><span class="badge ok">${v.valid.length} valid</span>${v.errors.length ? `<span class="badge danger">${plural(v.errors.length, 'error')}</span>` : ''}${v.warnings.length ? `<span class="badge warn">${plural(v.warnings.length, 'warning')}</span>` : ''}
              <span class="muted small">Columns read: ${v.cols.map((c) => (c ? colNames[c] : 'ignored')).join(', ')}${v.ignored.length ? ` (ignored: ${esc(v.ignored.join(', '))})` : ''}. Errors first.</span></div>
            ${v.errors.length || v.warnings.length ? `<div class="table-wrap short"><table class="tbl small"><thead><tr><th>Line</th><th>Row</th><th>Result</th></tr></thead><tbody>
              ${v.errors.map((r) => `<tr class="r-err"><td>${r.n}</td><td><code>${esc(r.raw)}</code></td><td>✗ ${esc(r.error)}</td></tr>`).join('')}
              ${v.warnings.map((r) => `<tr class="r-okwarn"><td>${r.n}</td><td><code>${esc(r.raw)}</code></td><td>! ${esc(r.warn)} (will be imported)</td></tr>`).join('')}
            </tbody></table></div>` : '<p class="notice ok">No errors or warnings.</p>'}
            ${v.valid.length ? `<form data-form="import-apply" novalidate>
              ${has ? '<label class="check warn-check"><input type="checkbox" name="replace"> Replace the current register. This clears every status, task, case and history entry.</label><div class="field-error" data-err="replace" role="alert"></div>' : ''}
              <div class="form-actions"><button type="submit" class="btn btn-primary">Import ${plural(v.valid.length, 'unit')}${v.errors.length ? ` (skip ${v.errors.length})` : ''}</button></div>
            </form>` : ''}
          </div>` : ''}`
      };
    },

    bulk: (p) => {
      const msgs = MSG_SPECS.filter((sp) => state.msgs[sp.id].status === 'arrived' && state.msgs[sp.id].data.lines);
      const bcOpts = Object.assign({ REQUIRE: 'Require a channel on each OK line (default)' }, CHANNEL);
      return {
        title: 'Bulk update (strict format)',
        wide: true,
        body: `<p class="lead">Paste replies in the fixed format, one line per unit: <code>UNIT,CODE[,DETAIL]</code>. Khairiyat <strong>does not interpret free text</strong> in English or Hinglish, and <strong>never invents a channel or source</strong>. Anything unclear is flagged, and nothing changes until you apply.</p>
          <details class="format-ref"><summary>Format reference</summary>
            <table class="tbl small"><thead><tr><th>Line</th><th>Meaning</th></tr></thead><tbody>
              <tr><td><code>C-701,OK,VISIT</code></td><td>An adult in the household was reached, and no help was reported → household Confirmed. Channel required: INTERCOM, PHONE, VISIT, MESSAGE or UNKNOWN. Lines without one need an explicit batch channel below.</td></tr>
              <tr><td><code>C-803,AWAY,family phoned warden</code></td><td>Household away or unit vacant, with a source (max 40 characters, no commas) → household Confirmed.</td></tr>
              <tr><td><code>C-804,NOANS</code></td><td>No answer. Records an attempt on the unit’s open task; the unit then needs a new owner.</td></tr>
              <tr><td><code>C-702,HELP,CHILD</code></td><td>Someone may need help → a welfare case opens with priority “not yet assessed”. CHILD, ADULT, MEDICAL or ESSENTIALS.</td></tr>
            </tbody></table></details>
          <form data-form="bulk-validate" novalidate>
            ${field('by', 'Reported by', peopleInput('by', p.by, 'e.g. Guard room (intercom round)'))}
            <div class="field"><label for="f-batch">Channel for OK lines that don’t name one</label>
              <select id="f-batch" name="batch">${Object.entries(bcOpts).map(([k, v]) => opt(k, v, p.batch || 'REQUIRE')).join('')}</select>
              <p class="micro">Only choose a channel if the reporter told you how every contact in this batch was made. “Channel not stated” records exactly that.</p></div>
            ${field('text', 'Lines', `<textarea id="f-text" name="text" rows="9" class="mono" spellcheck="false" placeholder="C-701,OK,VISIT&#10;C-702,HELP,CHILD">${esc(p.text || '')}</textarea>`)}
            ${msgs.length ? `<div class="insert-row"><span class="muted">Insert from the desk inbox:</span> ${msgs.map((sp) => `<button type="button" class="btn btn-sm" data-action="bulk-insert" data-msg="${sp.id}">${esc(state.msgs[sp.id].data.from)}</button>`).join(' ')}</div>` : ''}
            <div class="form-actions"><button type="submit" class="btn btn-primary">Validate</button></div>
          </form>
          ${p.result ? `<div class="notice ok" role="status">${esc(p.result)}</div>` : ''}
          ${p.rows ? bulkPreview(p.rows) : ''}`
      };
    },

    assign: (p) => {
      const ids = p.ids.filter((id) => state.flats[id]);
      const todo = ids.filter((id) => unresolved(state.flats[id]));
      const skipped = ids.length - todo.length;
      const welfare = todo.filter((id) => caseOf(state.flats[id])).length;
      const reassign = todo.filter((id) => openTask(state.flats[id])).length;
      const over = todo.filter((id) => isOverdue(openTask(state.flats[id]))).length;
      const limit = Number(state.settings.workloadWarn) || 20;
      return {
        title: welfare && welfare === todo.length ? 'Assign a helper · ज़िम्मेदार' : 'Assign follow-up · ज़िम्मेदार',
        body: `<form data-form="assign" novalidate>
            <p><strong>${plural(todo.length, 'unit')}</strong>${welfare ? ` (${welfare} welfare visit${welfare > 1 ? 's' : ''})` : ''}${reassign ? ` · ${reassign} will be reassigned${over ? `, ${over} of them overdue` : ''}` : ''}</p>
            ${chipsPreview(todo)}
            ${skipped ? `<p class="notice warn">${plural(skipped, 'unit')} skipped: nothing outstanding there.</p>` : ''}
            ${field('owner', 'Owner (one named person or pair)', peopleInput('owner', p.owner, welfare ? 'e.g. Dr. Kavita (A-201)' : 'e.g. Arjun (C-304)'), `<div id="load-note" class="micro" data-n="${todo.length}" data-limit="${limit}">Workload appears here once you choose an owner.</div>`)}
            ${field('contact', 'Contact (optional)', '<input id="f-contact" name="contact" maxlength="40" placeholder="Phone or flat" autocomplete="off">')}
            ${deadlineField(welfare ? 30 : 45)}
            <p class="micro">The task starts as <strong>Awaiting acceptance</strong> and isn’t counted as covered until you record the person’s YES. (Tasks for “${DESK_OWNER}” are the coordinator’s own and are accepted at once.) Reassigning closes the previous task with a reason; it stays in the history. Khairiyat sends nothing itself.</p>
            <div class="form-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button><button type="submit" class="btn btn-primary" ${todo.length ? '' : 'disabled'}>Assign ${plural(todo.length, 'unit')}</button></div>
          </form>`
      };
    },

    message: (p) => ({
      title: esc(p.title),
      body: `<p class="lead">${p.lead || 'Khairiyat doesn’t send anything. Copy this message and send it yourself by WhatsApp or SMS.'}</p>
        <textarea id="msg-text" class="mono msg-area" rows="13" readonly>${esc(p.text)}</textarea>
        <ul class="checks small">
          <li>Unit numbers and the reply format only: never the reason a unit is on the list (welfare visits name only the reported concern)</li>
          <li>Asks for YES or NO, so you can record acceptance</li>
          <li>Safety: no entry, leave if unsafe, call emergency services directly in an emergency</li>
        </ul>
        <div class="form-actions"><button class="btn btn-ghost" data-action="close-modal">Close</button><button class="btn btn-primary" data-action="copy-msg">Copy message</button></div>`
    }),

    respond: (p) => {
      const ts = p.tasks.map((x) => state.tasks[x]).filter((t) => t && t.status === 'open' && t.accept === 'pending');
      const owner = ts[0] ? ts[0].owner : '';
      return {
        title: `Record ${esc(owner)}’s response`,
        body: ts.length ? `<form data-form="respond" novalidate>
            <p>${plural(ts.length, 'unit')}, assigned ${hhmm(ts[0].createdAt)}:</p>
            ${chipsPreview(ts.map((t) => t.flatId))}
            <fieldset class="field"><legend>What did they say?</legend>${radios('response', { accepted: '<strong>YES</strong>: accepted, will do it', declined: '<strong>NO</strong>: declined, or can’t do it' }, '')}<div class="field-error" data-err="response" role="alert"></div></fieldset>
            <fieldset class="field"><legend>How did they respond?</legend>${radios('via', ACCEPT_VIA, '')}<div class="field-error" data-err="via" role="alert"></div></fieldset>
            ${field('reason', 'Reason (required for a NO)', '<input id="f-reason" name="reason" maxlength="100" autocomplete="off" placeholder="e.g. Children alone at home">')}
            <p class="micro">Record only what the person actually said. A NO sends these units back to “Needs an owner”.</p>
            <div class="form-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button><button type="submit" class="btn btn-primary">Record response</button></div>
          </form>` : '<p>Nothing is awaiting acceptance here any more.</p>'
      };
    },

    extend: (p) => {
      const ts = p.tasks.map((x) => state.tasks[x]).filter((t) => t && t.status === 'open');
      const owner = ts[0] ? ts[0].owner : '';
      const over = ts.filter((t) => isOverdue(t)).length;
      return {
        title: `Extend the deadline for ${esc(owner)}`,
        body: `<form data-form="extend" novalidate>
            <p>${plural(ts.length, 'task')}${over ? `, ${over} overdue` : ''}. The owner stays the same.</p>
            ${chipsPreview(ts.map((t) => t.flatId))}
            ${deadlineField(15, 'at', 'New deadline')}
            ${field('reason', 'Reason (required)', '<input id="f-reason" name="reason" maxlength="100" autocomplete="off" placeholder="e.g. Asked for 15 more minutes; 4 flats left">')}
            <div class="form-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button><button type="submit" class="btn btn-primary">Extend deadline</button></div>
          </form>`
      };
    },

    checkin: (p) => {
      const ts = p.tasks.map((x) => state.tasks[x]).filter((t) => t && t.status === 'open');
      return {
        title: `Record a check-in with ${esc(ts[0] ? ts[0].owner : '')}`,
        body: `<form data-form="checkin" novalidate>
            <p>Records that you contacted the owner, and what they said. It doesn’t change the task or its deadline. Extend or reassign separately if needed.</p>
            ${field('note', 'What did they say? (required)', '<input id="f-note" name="note" maxlength="120" autocomplete="off" placeholder="e.g. Phoned Meena: 4 flats left">')}
            <div class="form-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button><button type="submit" class="btn btn-primary">Record check-in</button></div>
          </form>`
      };
    },

    'confirm-adult': (p) => ({
      title: `Confirm ${esc(p.id)}’s household: adult reached`,
      body: `<form data-form="confirm-adult" novalidate>
          <fieldset class="field"><legend>How was the adult reached?</legend>${radios('channel', CHANNEL, '')}<div class="field-error" data-err="channel" role="alert"></div></fieldset>
          ${field('by', 'Reported by (who gave you this information)', peopleInput('by', '', 'e.g. Resident of A-402, or Guard room'))}
          <label class="check"><input type="checkbox" name="adult"> An adult (18+) in this household was reached.</label>
          <div class="field-error" data-err="adult" role="alert"></div>
          <label class="check"><input type="checkbox" name="needs"> They reported someone who may need help (a welfare concern form opens next).</label>
          <p class="micro">If only a child answered, don’t confirm the household: report a welfare concern instead. Confirming is household-level only and never closes a welfare case.</p>
          <div class="form-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button><button type="submit" class="btn btn-primary">Confirm household</button></div>
        </form>`
    }),

    'confirm-away': (p) => ({
      title: p.ids.length === 1 ? `Confirm ${esc(p.ids[0])}’s household: away / vacant` : `Confirm ${p.ids.length} households: away / vacant`,
      body: `<form data-form="confirm-away" novalidate>
          ${p.ids.length > 1 ? chipsPreview(p.ids) : ''}
          ${field('source', 'Source of the information', `<input id="f-source" name="source" maxlength="60" placeholder="e.g. Register note, or Son phoned the desk" autocomplete="off" value="${esc(p.source || '')}">`)}
          ${field('by', 'Recorded by', peopleInput('by', state.settings.coordinator))}
          <p class="micro">Use this only when someone has told you the household is away or the unit is vacant. Silence or “no answer” is not a source.</p>
          <div class="form-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button><button type="submit" class="btn btn-primary">Confirm away / vacant</button></div>
        </form>`
    }),

    welfare: (p) => ({
      title: `Report a welfare concern for ${esc(p.id)} · हालचाल जाँच`,
      body: `<form data-form="welfare" novalidate>
          ${dangerNote}
          <fieldset class="field"><legend>Reported concern</legend>${radios('concern', CONCERN, '')}<div class="field-error" data-err="concern" role="alert"></div></fieldset>
          <fieldset class="field"><legend>Priority (the coordinator’s judgement)</legend>
            <div class="radio-list inline">${Object.entries(PRIORITY).map(([k, v]) => `<label><input type="radio" name="priority" value="${k}" ${k === 'unknown' ? 'checked' : ''}> ${v}</label>`).join('')}</div>
            <p class="micro">“Not yet assessed” is fine. The queue lists such cases above “Not urgent” ones.</p></fieldset>
          ${field('source', 'Source of the concern', '<input id="f-source" name="source" maxlength="60" placeholder="e.g. Warden report, relative’s phone call" autocomplete="off">')}
          ${field('note', 'Note (optional; no names, ages or diagnoses)', '<input id="f-note" name="note" maxlength="100" autocomplete="off">')}
          <p class="micro">The household status doesn’t change (currently ${HOUSEHOLD[state.flats[p.id].status].en.toLowerCase()}). The case stays open until an outcome is recorded with its evidence.</p>
          <div class="form-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button><button type="submit" class="btn btn-primary">Open welfare case</button></div>
        </form>`
    }),

    priority: (p) => {
      const c = caseOf(state.flats[p.id]);
      return {
        title: `Set priority for ${esc(p.id)}`,
        body: `<form data-form="priority" novalidate>
            ${dangerNote}
            <fieldset class="field"><legend>Priority</legend><div class="radio-list">${Object.entries(PRIORITY).map(([k, v]) => `<label><input type="radio" name="priority" value="${k}" ${c && k === c.priority ? 'checked' : ''}> ${v}</label>`).join('')}</div></fieldset>
            ${field('reason', 'Reason (optional)', '<input id="f-reason" name="reason" maxlength="100" autocomplete="off" placeholder="e.g. Young child alone">')}
            <div class="form-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button><button type="submit" class="btn btn-primary">Save priority</button></div>
          </form>`
      };
    },

    noanswer: (p) => {
      const t = openTask(state.flats[p.id]);
      return {
        title: `Record “no answer” for ${esc(p.id)}`,
        body: `<form data-form="noanswer" novalidate>
            <p>This records an unanswered attempt on <strong>${esc(t ? t.owner : '')}</strong>’s ${t ? TASK_TYPE[t.type].toLowerCase() : 'task'}.</p>
            <p class="notice info">No answer is <strong>not</strong> evidence that anyone has vanished or needs help. The task closes, and ${esc(p.id)} will need a new owner and deadline.</p>
            ${field('note', 'Note (optional)', '<input id="f-note" name="note" maxlength="80" placeholder="e.g. Rang twice, knocked" autocomplete="off">')}
            <div class="form-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button><button type="submit" class="btn btn-primary">Record no answer</button></div>
          </form>`
      };
    },

    interim: (p) => ({
      title: `Interim update for ${esc(p.id)}`,
      body: `<form data-form="interim" novalidate>
          <fieldset class="field"><legend>What has happened?</legend><div class="radio-list">${INTERIM.map((v) => `<label><input type="radio" name="type" value="${esc(v)}"> ${v}</label>`).join('')}</div><div class="field-error" data-err="type" role="alert"></div></fieldset>
          ${field('note', 'Note (optional; no names or diagnoses)', '<input id="f-note" name="note" maxlength="120" autocomplete="off" placeholder="e.g. Aunt from D-603 on her way">')}
          ${deadlineField(60, 'at', 'When should the owner report next?')}
          <p class="micro">An interim update never closes the case or confirms the household.</p>
          <div class="form-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button><button type="submit" class="btn btn-primary">Record update</button></div>
        </form>`
    }),

    contact: (p) => {
      const f = state.flats[p.id];
      const t = openTask(f);
      const whos = {};
      state.settings.contacts.forEach((c) => { whos[`${c.label} (${c.number})`] = `${esc(c.label)} (${esc(c.number)})`; });
      whos['Family member'] = 'Family member';
      whos['Other person or service'] = 'Other person or service';
      return {
        title: `Record contact for ${esc(p.id)}`,
        body: `<form data-form="contact" novalidate>
            <p class="notice info"><strong>Demo action.</strong> Khairiyat doesn’t call or message anyone. Make the call yourself, then record what actually happened. Numbers come from Settings and haven’t been verified for every location.</p>
            <fieldset class="field"><legend>Who did you contact?</legend>${radios('who', whos, '')}<div class="field-error" data-err="who" role="alert"></div></fieldset>
            <fieldset class="field"><legend>What happened?</legend>${radios('result', CONTACT_RESULT, '')}<div class="field-error" data-err="result" role="alert"></div></fieldset>
            ${field('recipient', 'Who agreed to act (name or role; required if they agreed)', '<input id="f-recipient" name="recipient" maxlength="60" autocomplete="off" placeholder="e.g. PCR control room, duty officer">')}
            ${field('reference', 'Reference (optional)', '<input id="f-reference" name="reference" maxlength="40" autocomplete="off" placeholder="e.g. 2231">')}
            <fieldset class="field"><legend>Next step (the case stays open either way)</legend>
              ${t ? `<p class="micro">Current next step: ${esc(t.owner)}, ${esc(dueLabel(t))}${t.accept === 'pending' ? ' (awaiting acceptance)' : ''}. It stays unless you replace it.</p><label class="check"><input type="checkbox" name="replace"> Replace it with a new follow-up</label>` : '<p class="micro"><strong>Required:</strong> nobody currently owns the next step.</p>'}
              ${field('followOwner', 'Follow-up owner', peopleInput('followOwner', t ? '' : DESK_OWNER))}
              ${deadlineField(60, 'followAt', 'Follow-up deadline')}
            </fieldset>
            <div class="form-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button><button type="submit" class="btn btn-primary">Record contact</button></div>
          </form>`
      };
    },

    'close-case': (p) => {
      const f = state.flats[p.id];
      const outs = {};
      Object.entries(OUTCOME).forEach(([k, v]) => { if (k !== 'WITHDRAWN') outs[k] = `<strong>${v.label}</strong> <span class="muted">(${v.ask})</span>`; });
      return {
        title: `Close the welfare case for ${esc(p.id)}`,
        body: `<form data-form="close-case" novalidate>
            <fieldset class="field"><legend>Outcome</legend>${radios('outcome', outs, '')}<div class="field-error" data-err="outcome" role="alert"></div></fieldset>
            ${field('detail', 'Details for the chosen outcome', '<input id="f-detail" name="detail" maxlength="80" placeholder="e.g. Grandmother is with the child" autocomplete="off">')}
            <fieldset class="field"><legend>How is this known?</legend>${radios('evidence', EVIDENCE, '')}<div class="field-error" data-err="evidence" role="alert"></div>
              <p class="micro">A call that wasn’t answered, or a promise to act, is not evidence of an outcome: use “Record contact” and keep the case open. “Taken over by a service” needs the service’s confirmation or someone seeing it happen.</p></fieldset>
            ${field('by', 'Recorded by', peopleInput('by', state.settings.coordinator))}
            <p class="micro">Closing doesn’t change the household status (currently <strong>${HOUSEHOLD[f.status].en.toLowerCase()}</strong>). If this outcome also accounts for the household, record that separately.</p>
            <div class="form-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button><button type="submit" class="btn btn-primary">Close case</button></div>
          </form>`
      };
    },

    withdraw: (p) => ({
      title: `Correct ${esc(p.id)}: welfare case opened in error`,
      body: `<form data-form="withdraw" novalidate>
          <p>Use this only if the case was recorded against the wrong unit or by mistake. The household status doesn’t change, and the original entries stay in the history.</p>
          ${field('reason', 'Reason (required)', '<input id="f-reason" name="reason" maxlength="100" autocomplete="off" placeholder="e.g. Entered against the wrong unit; it was C-703">')}
          <div class="form-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button><button type="submit" class="btn btn-primary">Withdraw case</button></div>
        </form>`
    }),

    reopen: (p) => ({
      title: `Reopen the last welfare case for ${esc(p.id)}`,
      body: `<form data-form="reopen" novalidate>
          <p>Use this if the case was closed on wrong or incomplete information. The previous outcome stays in the history, and the case will need an owner again.</p>
          ${field('reason', 'Reason (required)', '<input id="f-reason" name="reason" maxlength="100" autocomplete="off" placeholder="e.g. Carer left; the child is alone again">')}
          <div class="form-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button><button type="submit" class="btn btn-primary">Reopen case</button></div>
        </form>`
    }),

    correct: (p) => {
      const f = state.flats[p.id];
      return {
        title: `Correct ${esc(p.id)}’s household status`,
        body: `<form data-form="correct" novalidate>
            <p class="muted">Current entry: Confirmed, ${esc(basisText(f.basis))}</p>
            <p>This moves the household back to <strong>Unconfirmed</strong>. The original entry stays in the history.${caseOf(f) ? ' The open welfare case is not affected.' : ' To raise a concern instead, use “Report a welfare concern”: no correction is needed for that.'}</p>
            ${field('reason', 'Reason (required)', '<input id="f-reason" name="reason" maxlength="100" autocomplete="off" placeholder="e.g. Guard entered B-203 by mistake; it was B-302">')}
            <div class="form-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button><button type="submit" class="btn btn-primary">Save correction</button></div>
          </form>`
      };
    },

    edit: (p) => {
      const f = state.flats[p.id];
      return {
        title: `Edit unit details for ${esc(p.id)}`,
        body: `<form data-form="edit" novalidate>
            <p class="micro">The identifier itself can’t be edited here (re-import the register to change it). Building and floor are optional; the grid only appears when every unit has both.</p>
            ${field('building', 'Building or tower (optional)', `<input id="f-building" name="building" maxlength="40" value="${esc(f.building)}">`)}
            ${field('floor', 'Floor (optional)', `<input id="f-floor" name="floor" maxlength="10" value="${esc(f.floor)}">`)}
            ${field('note', 'Register note (optional)', `<input id="f-note" name="note" maxlength="60" value="${esc(f.note)}">`)}
            ${field('reason', 'Reason (optional)', '<input id="f-reason" name="reason" maxlength="100" autocomplete="off">')}
            <div class="form-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button><button type="submit" class="btn btn-primary">Save details</button></div>
          </form>`
      };
    },

    settings: () => {
      const s = state.settings;
      return {
        title: 'Settings · सेटिंग्स',
        body: `<form data-form="settings" novalidate>
            ${field('society', 'Society name', `<input id="f-society" name="society" maxlength="80" value="${esc(s.society)}">`)}
            ${field('coordinator', 'Coordinator name (default “recorded by”)', `<input id="f-coordinator" name="coordinator" maxlength="60" value="${esc(s.coordinator)}">`)}
            ${field('desk', 'Desk phone (shown in messages)', `<input id="f-desk" name="desk" maxlength="40" value="${esc(s.desk)}">`)}
            ${field('guard', 'How residents reach the guard room', `<input id="f-guard" name="guard" maxlength="60" value="${esc(s.guard)}">`)}
            ${field('workloadWarn', 'Workload warning above this many open tasks per person', `<input id="f-workloadWarn" name="workloadWarn" type="number" min="1" max="500" value="${esc(s.workloadWarn)}">`, '<p class="micro">An adjustable assumption for this desk, not a validated standard. It warns; it never blocks.</p>')}
            <fieldset class="field"><legend>Contacts for recording escalations</legend>
              ${s.contacts.map((c, i) => `<div class="contact-row"><input name="cl${i}" value="${esc(c.label)}" aria-label="Contact ${i + 1} name" maxlength="30"><input name="cn${i}" value="${esc(c.number)}" aria-label="Contact ${i + 1} number" maxlength="20"></div>`).join('')}
              <p class="micro">Check these locally. In 2018 police was 100 nationally; ambulance numbers differed by state. They are only used to label recorded contacts. Khairiyat never dials or messages anyone, and volunteer messages don’t include them.</p>
              <div class="field-error" data-err="contacts" role="alert"></div></fieldset>
            <div class="notice info small">Storage: this browser’s localStorage only. It is <strong>not encrypted</strong>, has no accounts or role-based access, and is erased if browser data is cleared.</div>
            <div class="form-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button><button type="submit" class="btn btn-primary">Save settings</button></div>
          </form>`
      };
    },

    handover: () => {
      const e = endState();
      const isDemo = state.scenario === 'neelgiri';
      const lastStep = GUIDE.length - 1;
      let status = '';
      if (isDemo) {
        if (stepDone(lastStep)) status = '<p class="notice ok"><b>Walkthrough complete.</b> Every item below is visible, owned, accepted and within its deadline. The emergency itself is not over.</p>';
        else {
          const why = [];
          if (e.stepsLeft.length) why.push(`step${e.stepsLeft.length > 1 ? 's' : ''} ${e.stepsLeft.map((k) => k + 1).join(', ')} not complete`);
          if (e.msgsOpen.length) why.push(`${plural(e.msgsOpen.length, 'scripted message')} not handled`);
          if (e.msgsWaiting.length) why.push(`${plural(e.msgsWaiting.length, 'scripted message')} not arrived yet`);
          if (e.st.gaps || e.st.dueNow) why.push(`${plural(e.st.gaps + e.st.dueNow, 'next step')} needing an owner, acceptance or attention to a deadline`);
          if (!(state.flags.updateCopiedAt != null && state.coverAt != null && state.flags.updateCopiedAt >= state.coverAt)) why.push('no society update generated since coverage was reached');
          status = `<p class="notice warn"><b>Walkthrough not complete yet:</b> ${esc(why.join('; '))}.</p>`;
        }
      }
      const cases = e.openCases.map((f) => {
        const c = caseOf(f);
        const t = openTask(f);
        const u = c.updates[c.updates.length - 1];
        const k = c.contacts[c.contacts.length - 1];
        const latest = [u && { at: u.at, text: `${u.by} reported “${u.type}”${u.note ? ` (${u.note})` : ''}` }, k && { at: k.at, text: `contact with ${k.who}: ${CONTACT_RESULT[k.result].toLowerCase()}` }].filter(Boolean).sort((a, b) => b.at - a.at)[0];
        const why = latest ? `at ${hhmm(latest.at)}, ${latest.text}. No outcome has been recorded with evidence.` : 'the helper has not reported yet, so there is no outcome to record.';
        const next = t ? `${esc(t.owner)}, ${t.accept === 'accepted' ? 'accepted' : '<b class="text-warn">awaiting acceptance</b>'}, ${esc(dueLabel(t))}` : '<b class="text-danger">nobody owns the next step</b>';
        return `<li><p><b class="mono">${esc(f.id)}</b> · ${esc(PRIORITY[c.priority])} · ${ui.hideWelfare ? '<span class="masked">concern hidden</span>' : esc(CONCERN[c.concern])} · household ${HOUSEHOLD[f.status].en.toLowerCase()}</p>
          <p>Why still open: ${esc(why)}</p><p>Stage: ${esc(STAGE[c.stage])}. Next: ${next}.</p></li>`;
      }).join('');
      const groups = new Map();
      state.order.forEach((id) => {
        const f = state.flats[id];
        if (f.status !== 'unconfirmed') return;
        const t = openTask(f);
        const cov = coverage(f);
        const key = t ? `${t.owner}\u0000${cov}\u0000${t.due}` : 'none';
        if (!groups.has(key)) groups.set(key, { t, cov, ids: [] });
        groups.get(key).ids.push(id);
      });
      const hh = [...groups.values()].sort((a, b) => (a.t ? a.t.due : -1) - (b.t ? b.t.due : -1)).map((g) => {
        const who = g.t ? `<b>${esc(g.t.owner)}</b>: ${g.cov === 'covered' ? 'accepted' : g.cov === 'pending' ? '<b class="text-warn">awaiting acceptance</b>' : '<b class="text-danger">overdue</b>'}, ${esc(dueLabel(g.t))}` : '<b class="text-danger">Needs an owner</b>';
        const list = g.ids.slice(0, 8).join(', ') + (g.ids.length > 8 ? `, and ${g.ids.length - 8} more` : '');
        return `<li>${who} · ${plural(g.ids.length, 'household')} <span class="muted">(${esc(list)})</span></li>`;
      }).join('');
      const msgs = e.msgsOpen.concat(e.msgsWaiting);
      return {
        title: 'Handover summary',
        wide: true,
        body: `<p class="lead">A live summary for the next coordinator, at ${hhmm(state.clock)}. It describes coordination, not safety.</p>
          ${status}
          ${endStateHtml(false)}
          <h3 class="sec-h">Welfare cases still open (${e.openCases.length})</h3>
          ${e.openCases.length ? `<ul class="handover-list">${cases}</ul>` : '<p class="muted">None.</p>'}
          <h3 class="sec-h">Households not yet confirmed (${e.st.unconfirmed})</h3>
          ${e.st.unconfirmed ? `<ul class="handover-list compact">${hh}</ul>` : '<p class="muted">None.</p>'}
          ${isDemo && msgs.length ? `<h3 class="sec-h">Scripted messages still to handle (${msgs.length})</h3><ul class="handover-list compact">${msgs.map((sp) => `<li>Step ${sp.step}: ${esc(sp.label)}. ${msgStatus(sp.id) === 'waiting' ? `Not arrived yet. ${esc(sp.expect)}` : 'Waiting in the Desk inbox.'}</li>`).join('')}</ul>` : ''}
          <p class="notice info small">“Confirmed” means an adult in the household was reached, or a named source said it is away or vacant. It does not mean everyone linked to the flat is safe. “Unconfirmed” means nobody has reached it yet. Khairiyat does not record who is missing.</p>
          <div class="form-actions"><button class="btn btn-primary" data-action="close-modal">Close</button></div>`
      };
    },

    scenario: () => ({
      title: 'About this scenario (fictional)',
      body: `<p class="lead">Everything here is invented for the demo: the society, its people and every message.</p>
        <p><b>Yesterday, at about 6:30 in the evening, half of all people everywhere vanished in an instant.</b> Phone networks were jammed through the night. This is the next morning.</p>
        <p><b>Neelgiri Apartments, Sector 00, Gurugram</b> has 4 towers and 160 flats. The RWA’s records suggest roughly 550 people lived here before yesterday. That number is a fictional estimate for context only: Khairiyat does not count people.</p>
        <p>The loss here is uneven, as it is everywhere. Some households lost no one. Some lost a parent, a partner, a carer or a child. Some flats have not answered at all, which by itself means nothing. Two of the society’s five guards are gone. Tower C’s intercom panel failed overnight. The Tower B lift has stopped because its operator is gone. The chemist in the society market hasn’t opened.</p>
        <p><b>You are Priya, the RWA secretary</b>, running the roll-call desk from the clubhouse from 9:00. Your job today is not to find out who vanished. It is to make sure every household is reached, every reported welfare concern has someone responsible for the next step, and nothing is quietly dropped.</p>
        <h3 class="sec-h">What Khairiyat records, and what it doesn’t</h3>
        <ul class="plain">
          <li>It records <b>units</b> (flats), not people.</li>
          <li><b>Confirmed</b> means an adult in the household was reached, or a named source said the flat is away or vacant. It never means everyone linked to the flat is safe.</li>
          <li><b>Unconfirmed</b> and <b>no answer</b> never mean that someone has vanished.</li>
          <li>It never calls, messages or posts anything. You copy messages and make calls yourself.</li>
        </ul>
        <p class="muted small">The demo clock moves only when you press +15 min, and compresses a morning into about 75 minutes. Real follow-ups would take longer.</p>
        <div class="form-actions"><button class="btn btn-primary" data-action="close-modal">Close</button></div>`
    }),

    export: () => ({
      title: 'Export CSV for handover',
      body: `<p class="notice warn"><strong>Handle exports as sensitive files.</strong> They include welfare concerns and are not encrypted. Delete them when the handover is done.</p>
        <div class="export-grid">
          <button class="btn" data-action="export-register">Download register status (CSV)</button>
          <button class="btn" data-action="export-history">Download full history (CSV)</button>
        </div>
        <div class="form-actions"><button class="btn btn-ghost" data-action="close-modal">Close</button></div>`
    }),

    destructive: (p) => {
      const cfg = {
        reset: { title: 'Reset the demo?', word: 'RESET', btn: 'Reset demo', text: 'This clears the register, statuses, tasks, cases, history and inbox, and sets the demo clock back to 09:00. Settings are kept.' },
        'reset-sample': { title: 'Reset with the Neelgiri register loaded?', word: 'RESET', btn: 'Reset and load sample', text: 'This clears everything (settings are kept), sets the clock back to 09:00 and imports the 160 fictional Neelgiri flats, skipping step 1.' },
        delete: { title: 'Delete all data from this browser?', word: 'DELETE', btn: 'Delete all data', text: 'This permanently removes the register, statuses, tasks, cases, history, inbox and settings from this browser’s storage. Files you exported and messages you copied elsewhere are not affected.' }
      }[p.kind];
      return {
        title: cfg.title,
        body: `<form data-form="destructive" novalidate>
            <p>${cfg.text}</p>
            ${field('word', `Type <strong>${cfg.word}</strong> to confirm`, '<input id="f-word" name="word" autocomplete="off" autocapitalize="characters">')}
            <div class="form-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button><button type="submit" class="btn btn-danger">${cfg.btn}</button></div>
          </form>`
      };
    }
  };

  function bulkPreview(rows) {
    if (!rows.length) return '<p class="notice warn">Nothing to validate: paste some lines first.</p>';
    const ok = rows.filter((r) => r.level === 'ok' || r.level === 'okwarn');
    const warn = rows.filter((r) => r.level === 'warn');
    const err = rows.filter((r) => r.level === 'err');
    const ordered = err.concat(rows.filter((r) => r.level === 'okwarn'), warn, rows.filter((r) => r.level === 'ok'));
    const icon = { ok: '✓', okwarn: '✓', warn: '–', err: '✗' };
    return `<div class="preview">
      <div class="preview-sum"><span class="badge ok">${ok.length} will change</span>${warn.length ? `<span class="badge muted">${warn.length} no change</span>` : ''}${err.length ? `<span class="badge danger">${plural(err.length, 'error')}: not applied</span>` : ''}<span class="muted small">Errors are listed first.</span></div>
      <div class="table-wrap short"><table class="tbl small"><thead><tr><th>Line</th><th>Entry</th><th>Result</th></tr></thead><tbody>
      ${ordered.map((r) => `<tr class="r-${r.level}"><td>${r.n}</td><td><code>${esc(r.raw)}</code></td><td><span aria-hidden="true">${icon[r.level]}</span> ${esc(r.msg)}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="form-actions"><span class="muted small">${err.length ? 'Lines with errors stay in the box for you to fix or delete.' : ''}</span><button class="btn btn-primary" data-action="bulk-apply" ${ok.length ? '' : 'disabled'}>Apply ${plural(ok.length, 'valid line')}</button></div>
    </div>`;
  }

  function updateLoadNote() {
    const note = $('#load-note');
    const input = $('#f-owner');
    if (!note || !input) return;
    const name = input.value.trim();
    if (!name) { note.textContent = 'Workload appears here once you choose an owner.'; note.className = 'micro'; return; }
    const n = Number(note.dataset.n);
    const limit = Number(note.dataset.limit);
    const cur = ownerLoad(name);
    const auto = normKey(name) === normKey(DESK_OWNER);
    const total = cur + n;
    if (total > limit) {
      note.className = 'notice warn small';
      note.textContent = `This gives ${name} ${total} open tasks (${cur} now + ${n}), above the desk’s limit of ${limit}. Consider splitting it between people: an assignment is a commitment, not just a name.${auto ? ' This includes the coordinator’s own tasks.' : ''}`;
    } else {
      note.className = 'micro';
      note.textContent = `${name} currently has ${plural(cur, 'open task')}; this makes ${total}.${auto ? ' Coordinator’s own tasks are accepted at once.' : ''}`;
    }
  }

  // ── Form handlers ──────────────────────────────────────────────────────────
  const val = (fd, k) => String(fd.get(k) || '').trim();
  const FORMS = {
    'import-validate': (form, fd) => {
      const text = String(fd.get('text') || '');
      if (!text.trim()) { setErrors(form, { text: 'Paste the register, or insert a sample.' }); return; }
      modal.p = { text, society: val(fd, 'society') || state.settings.society, preview: validateRegister(text) };
      renderModal();
    },
    'import-apply': (form, fd) => {
      const v = modal.p.preview;
      if (state.order.length && !fd.get('replace')) { setErrors(form, { replace: 'Tick the box to confirm you want to replace the current register.' }); return; }
      importRegister(v.valid, modal.p.society);
      closeModal();
      Object.assign(ui, { tab: 'queue', sel: new Set(), selecting: false, q: '', fHousehold: 'all', fCase: 'all', fNext: 'all', fBuilding: 'all', view: layoutReady() ? 'grid' : 'list' });
      commit();
      toast(`Imported ${plural(v.valid.length, 'unit')}${v.errors.length ? `; skipped ${plural(v.errors.length, 'invalid row')}` : ''}. The roll-call has started.`, 'ok');
    },
    'bulk-validate': (form, fd) => {
      const by = val(fd, 'by');
      const text = String(fd.get('text') || '');
      const batch = fd.get('batch') || 'REQUIRE';
      const errs = {};
      if (!by) errs.by = 'Say who reported these lines.';
      if (!text.trim()) errs.text = 'Paste some lines first.';
      if (!setErrors(form, errs)) return;
      modal.p = { by, text, batch, rows: parseBulk(text, by, batch) };
      renderModal();
    },
    'assign': (form, fd) => {
      const owner = val(fd, 'owner');
      const errs = {};
      if (owner.length < 2) errs.owner = 'Name one person (or pair) who is responsible.';
      const due = readDeadline(fd, errs);
      if (!setErrors(form, errs)) return;
      const { created } = actAssign(modal.p.ids, owner, due, val(fd, 'contact'));
      ui.sel = new Set();
      ui.selecting = false;
      commit();
      const needMsg = created.filter((t) => t.accept === 'pending' || t.type !== 'followup');
      if (needMsg.length && normKey(owner) !== normKey(DESK_OWNER)) openModal('message', { title: `Message for ${owner}`, text: taskMessage(needMsg) });
      else closeModal();
      toast(`${plural(created.length, 'unit')} assigned to ${owner}, deadline ${hhmm(due)}.${created.some((t) => t.accept === 'pending') ? ' Awaiting acceptance.' : ''}`, 'ok');
    },
    'respond': (form, fd) => {
      const errs = {};
      const response = fd.get('response');
      if (!response) errs.response = 'Record what they said: YES or NO.';
      if (!fd.get('via')) errs.via = 'How did they respond?';
      if (response === 'declined' && val(fd, 'reason').length < 3) errs.reason = 'Give their reason for the NO.';
      if (!setErrors(form, errs)) return;
      const r = actRespond(modal.p.tasks, { response, via: fd.get('via'), reason: val(fd, 'reason') });
      ui.drawerNotice = null;
      closeModal();
      commit();
      toast(response === 'accepted' ? `${plural(r.n, 'task')} accepted.` : `${plural(r.n, 'task')} declined: back to “Needs an owner”.`, response === 'accepted' ? 'ok' : 'warn');
    },
    'extend': (form, fd) => {
      const errs = {};
      const due = readDeadline(fd, errs);
      if (val(fd, 'reason').length < 3) errs.reason = 'Give a reason for the extension.';
      if (!setErrors(form, errs)) return;
      const r = actExtend(modal.p.tasks, due, val(fd, 'reason'));
      closeModal();
      commit();
      toast(`${plural(r.n, 'deadline')} extended to ${hhmm(due)}. Same owner.`, 'ok');
    },
    'checkin': (form, fd) => {
      if (!setErrors(form, val(fd, 'note').length < 3 ? { note: 'Record what they said.' } : {})) return;
      actCheckin(modal.p.tasks, val(fd, 'note'));
      closeModal();
      commit();
      toast('Check-in recorded. The task and deadline are unchanged.', 'ok');
    },
    'confirm-adult': (form, fd) => {
      const errs = {};
      if (!fd.get('channel')) errs.channel = 'Choose how the adult was reached (or “Channel not stated”).';
      if (!fd.get('adult')) errs.adult = 'Only confirm when an adult in the household was reached. If not, report a welfare concern instead.';
      if (val(fd, 'by').length < 2) errs.by = 'Who gave you this information?';
      if (!setErrors(form, errs)) return;
      const id = modal.p.id;
      const r = actConfirm(id, { kind: 'adult', channel: fd.get('channel'), by: val(fd, 'by') });
      if (r.ok && fd.get('needs') && !caseOf(state.flats[id])) {
        commit();
        openModal('welfare', { id });
        toast(`${id}: household confirmed. Now record the welfare concern.`, 'ok');
        return;
      }
      afterAct(r, `${id}: household confirmed.${r.caseOpen ? ' The welfare case stays open.' : ''}`);
    },
    'confirm-away': (form, fd) => {
      const source = val(fd, 'source');
      const errs = {};
      if (source.length < 3) errs.source = 'Give the source of the information.';
      else if (/^(no ?answer|noans|silent|nobody answered|no one answered|koi jawab nahi)/i.test(source)) errs.source = '“No answer” isn’t a source. Record it as an attempt instead.';
      if (!val(fd, 'by')) errs.by = 'Who is recording this?';
      if (!setErrors(form, errs)) return;
      let done = 0;
      modal.p.ids.forEach((id) => { if (actConfirm(id, { kind: 'away', source, by: val(fd, 'by') }).ok) done++; });
      ui.sel = new Set();
      ui.selecting = false;
      closeModal();
      commit();
      toast(`${plural(done, 'household')} confirmed as away / vacant.`, 'ok');
    },
    'welfare': (form, fd) => {
      const errs = {};
      if (!fd.get('concern')) errs.concern = 'Choose the reported concern.';
      if (val(fd, 'source').length < 3) errs.source = 'What raised the concern?';
      if (!setErrors(form, errs)) return;
      const r = actOpenCase(modal.p.id, { concern: fd.get('concern'), priority: fd.get('priority') || 'unknown', source: val(fd, 'source'), note: val(fd, 'note') });
      afterAct(r, `${modal.p.id}: welfare case opened. It needs a helper.`);
    },
    'priority': (form, fd) => {
      if (!fd.get('priority')) return;
      const r = actSetPriority(modal.p.id, fd.get('priority'), val(fd, 'reason'));
      afterAct(r, `${modal.p.id}: priority set to ${PRIORITY[fd.get('priority')]}.`);
    },
    'noanswer': (form, fd) => {
      const r = actNoAnswer(modal.p.id, val(fd, 'note'));
      afterAct(r, `${modal.p.id}: no answer recorded. It needs a new owner.`);
    },
    'interim': (form, fd) => {
      const errs = {};
      if (!fd.get('type')) errs.type = 'Choose what has happened.';
      const due = readDeadline(fd, errs);
      if (!setErrors(form, errs)) return;
      const r = actInterim(modal.p.id, { type: fd.get('type'), note: val(fd, 'note'), due });
      afterAct(r, `${modal.p.id}: interim update recorded. Case stays open; next report due ${hhmm(due)}.`);
    },
    'contact': (form, fd) => {
      const errs = {};
      const f = state.flats[modal.p.id];
      const t = openTask(f);
      const result = fd.get('result');
      if (!fd.get('who')) errs.who = 'Who did you contact?';
      if (!result) errs.result = 'What actually happened?';
      if (result === 'ACK' && val(fd, 'recipient').length < 2) errs.recipient = 'Name who agreed to act (a name or a role).';
      const needFollow = !t || fd.get('replace');
      let followDue = null;
      if (needFollow) {
        if (val(fd, 'followOwner').length < 2) errs.followOwner = 'Name who owns the follow-up.';
        followDue = readDeadline(fd, errs, 'followAt');
      }
      if (!setErrors(form, errs)) return;
      const r = actContact(modal.p.id, { who: fd.get('who'), result, recipient: val(fd, 'recipient'), reference: val(fd, 'reference'), followOwner: needFollow ? val(fd, 'followOwner') : '', followDue });
      afterAct(r, `${modal.p.id}: contact recorded. The case stays open.`);
    },
    'close-case': (form, fd) => {
      const errs = {};
      if (!fd.get('outcome')) errs.outcome = 'Choose an outcome.';
      if (val(fd, 'detail').length < 3) errs.detail = 'Add the details for this outcome.';
      if (!fd.get('evidence')) errs.evidence = 'How is this known?';
      if (!val(fd, 'by')) errs.by = 'Who is recording this?';
      if (!setErrors(form, errs)) return;
      const outcome = fd.get('outcome');
      const need = OUTCOME[outcome].needs;
      if (need && !need.includes(fd.get('evidence'))) {
        setErrors(form, { evidence: `“${OUTCOME[outcome].label}” needs “The service confirmed it has taken over” or “Seen in person”. Otherwise keep the case open and record the contact.` });
        return;
      }
      const r = actCloseCase(modal.p.id, { outcome, detail: val(fd, 'detail'), evidence: fd.get('evidence'), by: val(fd, 'by') });
      afterAct(r, `${modal.p.id}: case closed with an outcome.${r.unconfirmed ? ' The household is still Unconfirmed: record it separately if this outcome accounts for it.' : ''}`);
    },
    'withdraw': (form, fd) => {
      if (!setErrors(form, val(fd, 'reason').length < 5 ? { reason: 'Give a reason (at least 5 characters).' } : {})) return;
      afterAct(actWithdrawCase(modal.p.id, val(fd, 'reason')), `${modal.p.id}: case withdrawn.`);
    },
    'reopen': (form, fd) => {
      if (!setErrors(form, val(fd, 'reason').length < 5 ? { reason: 'Give a reason (at least 5 characters).' } : {})) return;
      afterAct(actReopenCase(modal.p.id, val(fd, 'reason')), `${modal.p.id}: case reopened. It needs an owner.`);
    },
    'correct': (form, fd) => {
      if (!setErrors(form, val(fd, 'reason').length < 5 ? { reason: 'Give a reason (at least 5 characters).' } : {})) return;
      afterAct(actCorrectHousehold(modal.p.id, val(fd, 'reason')), `${modal.p.id}: correction saved. The original entry is kept in the history.`);
    },
    'edit': (form, fd) => {
      afterAct(actEditUnit(modal.p.id, { building: val(fd, 'building'), floor: val(fd, 'floor'), note: val(fd, 'note') }, val(fd, 'reason')), `${modal.p.id}: details saved.`);
    },
    'settings': (form, fd) => {
      const errs = {};
      const contacts = [0, 1, 2].map((i) => ({ label: val(fd, `cl${i}`), number: val(fd, `cn${i}`) }));
      if (contacts.some((c) => !c.label || !c.number)) errs.contacts = 'Each contact needs a name and a number.';
      ['society', 'coordinator', 'desk', 'guard'].forEach((k) => { if (!val(fd, k)) errs[k] = 'Required.'; });
      const w = Number(fd.get('workloadWarn'));
      if (!(w >= 1)) errs.workloadWarn = 'Enter a number of 1 or more.';
      if (!setErrors(form, errs)) return;
      state.settings = { society: val(fd, 'society'), coordinator: val(fd, 'coordinator'), desk: val(fd, 'desk'), guard: val(fd, 'guard'), workloadWarn: w, contacts };
      closeModal();
      commit();
      toast('Settings saved.', 'ok');
    },
    'destructive': (form, fd) => {
      const kind = modal.p.kind;
      const word = kind === 'delete' ? 'DELETE' : 'RESET';
      if (!setErrors(form, val(fd, 'word').toUpperCase() !== word ? { word: `Type ${word} to confirm.` } : {})) return;
      closeModal();
      Object.assign(ui, { drawer: null, sel: new Set(), selecting: false, tab: 'queue', q: '', fHousehold: 'all', fCase: 'all', fNext: 'all', fBuilding: 'all', view: 'grid' });
      if (kind === 'delete') {
        try { [STORAGE_KEY].concat(OLD_KEYS).forEach((k) => window.localStorage.removeItem(k)); } catch (e) { /* storage unavailable */ }
        state = freshState();
        renderAll();
        toast('All Khairiyat data was deleted from this browser.', 'ok');
        return;
      }
      state = freshState(Object.assign({}, state.settings, { society: SAMPLE_SOCIETY }));
      if (kind === 'reset-sample') {
        importRegister(validateRegister(sampleNeelgiriCsv()).valid, SAMPLE_SOCIETY);
        state.flags.guideStep = 1;
      }
      commit();
      toast(kind === 'reset-sample' ? 'Demo reset with the Neelgiri register loaded (09:00).' : 'Demo reset. Start with step 1: import the register.', 'ok');
    }
  };
  function afterAct(r, okMsg) {
    if (r && r.error) {
      ui.drawerNotice = { tone: 'danger', html: esc(r.error) };
      closeModal();
      commit();
      toast(r.error, 'warn');
      return;
    }
    ui.drawerNotice = null;
    closeModal();
    commit();
    toast(okMsg, 'ok');
  }

  // ── Clipboard and downloads ────────────────────────────────────────────────
  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) { /* fall back below */ }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }
  const csvCell = (v) => {
    const s = String(v == null ? '' : v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  function download(name, rows) {
    const text = rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }
  function exportRegister() {
    const rows = [['Unit', 'Register identifier', 'Building', 'Floor', 'Household status', 'Household (Hindi)', 'Household basis', 'Welfare case', 'Case stage', 'Reported concern', 'Priority', 'Next-step owner', 'Task type', 'Acceptance', 'Deadline', 'Deadline state', 'Register note']];
    state.order.forEach((id) => {
      const f = state.flats[id];
      const t = openTask(f);
      const c = caseOf(f);
      rows.push([id, f.rawId || id, f.building, f.floor, HOUSEHOLD[f.status].en, HOUSEHOLD[f.status].hi, basisText(f.basis), c ? 'open' : '', c ? STAGE[c.stage] : '', c ? CONCERN[c.concern] : '', c ? PRIORITY[c.priority] : '', t ? t.owner : '', t ? TASK_TYPE[t.type] : '', t ? t.accept : '', t ? hhmm(t.due) : '', t ? dueState(t) : '', f.note]);
    });
    download(`khairiyat-register-${hhmm(state.clock).replace(':', '')}.csv`, rows);
    log(null, 'system', 'Register status exported to CSV (handle as a sensitive file).');
    commit();
  }
  function exportHistory() {
    const rows = [['Time', 'Unit', 'Type', 'Entry', 'Details', 'Reason']];
    state.events.forEach((e) => rows.push([hhmm(e.t), e.flatId || '', KIND_LABEL[e.kind] || e.kind, e.text, e.sensitive, e.reason]));
    download(`khairiyat-history-${hhmm(state.clock).replace(':', '')}.csv`, rows);
    log(null, 'system', 'Full history exported to CSV (handle as a sensitive file).');
    commit();
  }

  // ── Toasts ─────────────────────────────────────────────────────────────────
  function toast(msg, tone) {
    const root = $('#toasts');
    if (!root) return;
    const el = document.createElement('div');
    el.className = `toast${tone ? ` t-${tone}` : ''}`;
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, 4500);
    while (root.children.length > 3) root.firstChild.remove();
  }

  // ── Events ─────────────────────────────────────────────────────────────────
  function openBulkFromMsg(id, notArrived) {
    if (!state.order.length) { toast('Import the register first (step 1).', 'warn'); return; }
    const m = state.msgs[id];
    if (!m || m.status !== 'arrived') { toast(notArrived || 'That message hasn’t arrived yet.', 'warn'); return; }
    openModal('bulk', { by: m.data.reporter, text: m.data.lines });
  }
  function refreshRegister() {
    const r = $('#reg-results');
    const s = $('#reg-selbar');
    if (r) r.innerHTML = registerResults();
    if (s) s.innerHTML = selBar();
  }
  const splitIds = (s) => String(s || '').split('\n').filter(Boolean);
  const splitTasks = (s) => String(s || '').split(',').filter(Boolean);

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    if ((a === 'modal-backdrop' || a === 'close-drawer') && el.classList.contains(a === 'modal-backdrop' ? 'modal-backdrop' : 'drawer-backdrop') && e.target !== el) return;
    if (el.disabled) return;
    const menu = el.closest('details.menu');
    if (menu && el.tagName === 'BUTTON') menu.removeAttribute('open');
    const id = el.dataset.id;
    switch (a) {
      case 'advance': advanceClock(); break;
      case 'tab': ui.tab = el.dataset.tab; renderMain(); break;
      case 'open-import': openModal('import', {}); break;
      case 'import-sample': {
        const smp = SAMPLES[el.dataset.sample];
        const ta = $('#f-text');
        const soc = $('#f-society');
        if (smp && ta) { ta.value = smp.csv(); if (soc) soc.value = smp.society; ta.focus(); }
        break;
      }
      case 'open-bulk': openModal('bulk', {}); break;
      case 'bulk-insert': {
        const m = state.msgs[el.dataset.msg];
        const ta = $('#f-text');
        const by = $('#f-by');
        if (m && ta) { ta.value = m.data.lines; if (by) by.value = m.data.reporter; }
        break;
      }
      case 'bulk-apply': {
        const { by, text, batch } = modal.p;
        const res = applyBulk(text, by, batch);
        const remaining = res.bad.map((r) => r.raw).join('\n');
        modal.p = { by, batch, text: remaining, rows: null, result: `Applied ${plural(res.applied, 'line')}.${res.noop.length ? ` ${res.noop.length} had no change.` : ''}${res.bad.length ? ` ${plural(res.bad.length, 'line')} with errors left below for you to fix or delete.` : ''}` };
        commit();
        renderModal();
        toast(`Bulk update applied: ${plural(res.applied, 'line')}.`, 'ok');
        break;
      }
      case 'open-export': openModal('export'); break;
      case 'export-register': exportRegister(); toast('Register CSV downloaded. Handle it as a sensitive file.', 'warn'); break;
      case 'export-history': exportHistory(); toast('History CSV downloaded. Handle it as a sensitive file.', 'warn'); break;
      case 'open-settings': openModal('settings'); break;
      case 'ask-reset': openModal('destructive', { kind: 'reset' }); break;
      case 'ask-reset-sample': openModal('destructive', { kind: 'reset-sample' }); break;
      case 'ask-delete': openModal('destructive', { kind: 'delete' }); break;
      case 'close-modal': closeModal(); break;
      case 'modal-backdrop': closeModal(); break;
      case 'close-drawer': closeDrawer(); break;
      case 'open-flat': openDrawer(id); break;
      case 'cell':
        if (ui.selecting) {
          if (ui.sel.has(id)) ui.sel.delete(id); else ui.sel.add(id);
          refreshRegister();
          const again = document.querySelector(`.cell[data-id="${CSS.escape(id)}"]`);
          if (again) again.focus();
        } else openDrawer(id);
        break;
      case 'row-sel':
        if (ui.sel.has(id)) ui.sel.delete(id); else ui.sel.add(id);
        refreshRegister();
        break;
      case 'view': ui.view = el.dataset.view; renderMain(); break;
      case 'toggle-select': ui.selecting = !ui.selecting; if (!ui.selecting) ui.sel = new Set(); renderMain(); break;
      case 'sel-shown': state.order.filter((x) => matches(state.flats[x])).forEach((x) => ui.sel.add(x)); refreshRegister(); break;
      case 'sel-clear': ui.sel = new Set(); refreshRegister(); break;
      case 'sel-assign': openModal('assign', { ids: [...ui.sel].sort(cmpUnit) }); break;
      case 'sel-away': {
        const ids = [...ui.sel].sort(cmpUnit).filter((x) => state.flats[x].status === 'unconfirmed');
        if (!ids.length) { toast('Only unconfirmed households can be confirmed as away / vacant.', 'warn'); break; }
        const allNoted = ids.every((x) => state.flats[x].note);
        openModal('confirm-away', { ids, source: allNoted ? 'Register note: no residents on record' : '' });
        break;
      }
      case 'clear-filters': Object.assign(ui, { q: '', fHousehold: 'all', fCase: 'all', fNext: 'all', fBuilding: 'all' }); renderMain(); break;
      case 'assign-ids': openModal('assign', { ids: splitIds(el.dataset.ids) }); break;
      case 'respond': openModal('respond', { tasks: splitTasks(el.dataset.tasks) }); break;
      case 'extend': openModal('extend', { tasks: splitTasks(el.dataset.tasks) }); break;
      case 'checkin': openModal('checkin', { tasks: splitTasks(el.dataset.tasks) }); break;
      case 'act-confirm-adult': openModal('confirm-adult', { id }); break;
      case 'act-confirm-away': openModal('confirm-away', { ids: [id] }); break;
      case 'act-welfare': openModal('welfare', { id }); break;
      case 'act-priority': openModal('priority', { id }); break;
      case 'act-noanswer': openModal('noanswer', { id }); break;
      case 'act-interim': openModal('interim', { id }); break;
      case 'act-contact': openModal('contact', { id }); break;
      case 'act-close-case': openModal('close-case', { id }); break;
      case 'act-withdraw': openModal('withdraw', { id }); break;
      case 'act-reopen': openModal('reopen', { id }); break;
      case 'act-correct': openModal('correct', { id }); break;
      case 'act-edit': openModal('edit', { id }); break;
      case 'reveal-case': ui.revealCase = !ui.revealCase; renderDrawer(); break;
      case 'toggle-group': ui.collapsed[el.dataset.group] = !ui.collapsed[el.dataset.group]; renderMain(); break;
      case 'owner-msg': {
        const ts = splitTasks(el.dataset.tasks).map((x) => state.tasks[x]).filter((t) => t && t.status === 'open');
        if (ts.length) openModal('message', { title: `Message for ${ts[0].owner}`, text: taskMessage(ts) });
        break;
      }
      case 'copy-msg': {
        const ta = $('#msg-text');
        copyText(ta ? ta.value : '').then((ok) => {
          if (!ok && ta) { ta.focus(); ta.select(); }
          toast(ok ? 'Message copied. Paste it into WhatsApp or SMS yourself.' : 'Couldn’t copy automatically. The text is selected: press Ctrl+C (⌘C on Mac).', ok ? 'ok' : 'warn');
        });
        break;
      }
      case 'copy-update': {
        const text = societyUpdateText();
        copyText(text).then((ok) => {
          state.flags.updateCopied = true;
          state.flags.updateCopiedAt = state.clock;
          log(null, 'update', `Society update generated at ${hhmm(state.clock)} (totals only; small welfare counts suppressed).`);
          commit();
          if (!ok) {
            const pre = $('#update-text');
            if (pre) { const r = document.createRange(); r.selectNodeContents(pre); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }
          }
          toast(ok ? 'Society update copied. Paste it into the society group yourself.' : 'Couldn’t copy automatically. The text is selected: press Ctrl+C (⌘C on Mac).', ok ? 'ok' : 'warn');
        });
        break;
      }
      case 'msg-bulk': openBulkFromMsg(el.dataset.msg); break;
      case 'msg-handled': {
        const m = state.msgs[el.dataset.msg];
        if (m) { m.handled = !m.handled; ui.msgOpen.delete(el.dataset.msg); save(); renderAll(); }
        break;
      }
      case 'msg-expand': {
        const k = el.dataset.msg;
        if (ui.msgOpen.has(k)) ui.msgOpen.delete(k); else ui.msgOpen.add(k);
        renderAside();
        break;
      }
      case 'toggle-guide': ui.guideOpen = !ui.guideOpen; renderAside(); break;
      case 'toggle-steps': ui.stepsOpen = !ui.stepsOpen; renderAside(); break;
      case 'toggle-inbox': ui.inboxOpen = !ui.inboxOpen; renderAside(); break;
      case 'guide-go': GUIDE[guideIndex()].go(); break;
      case 'guide-prev':
      case 'guide-next':
      case 'guide-jump': {
        const i = guideIndex();
        const n = a === 'guide-jump' ? Number(el.dataset.step) : a === 'guide-next' ? i + 1 : i - 1;
        state.flags.guideStep = Math.max(0, Math.min(GUIDE.length - 1, n));
        if (a === 'guide-jump') ui.stepsOpen = false;
        ui.guideOpen = true;
        save();
        renderAside();
        const g = $('#guide-h');
        if (g) { g.setAttribute('tabindex', '-1'); g.focus(); }
        break;
      }
      case 'open-handover': openModal('handover'); break;
      case 'open-scenario': openModal('scenario'); break;
      default: break;
    }
  });

  document.addEventListener('submit', (e) => {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    const h = FORMS[form.dataset.form];
    if (h && modal) h(form, new FormData(form));
  });

  document.addEventListener('input', (e) => {
    if (e.target.id === 'reg-q') { ui.q = e.target.value; refreshRegister(); }
    if (e.target.id === 'hist-q') { ui.histQ = e.target.value; const r = $('#hist-results'); if (r) r.innerHTML = historyRows(); }
    if (e.target.id === 'f-owner') updateLoadNote();
  });
  document.addEventListener('change', (e) => {
    const id = e.target.id;
    const map = { 'reg-household': 'fHousehold', 'reg-case': 'fCase', 'reg-next': 'fNext', 'reg-building': 'fBuilding' };
    if (map[id]) { ui[map[id]] = e.target.value; refreshRegister(); }
    if (id === 'hist-kind') { ui.histKind = e.target.value; const r = $('#hist-results'); if (r) r.innerHTML = historyRows(); }
    if (id === 'hide-welfare') { ui.hideWelfare = e.target.checked; renderMain(); renderDrawer(); }
    if (id === 'f-owner') updateLoadNote();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (modal) closeModal();
    else if (ui.drawer) closeDrawer();
    else {
      const menu = document.querySelector('details.menu[open]');
      if (menu) menu.removeAttribute('open');
    }
  });
  document.addEventListener('click', (e) => {
    const menu = document.querySelector('details.menu[open]');
    if (menu && !menu.contains(e.target)) menu.removeAttribute('open');
  });

  // ── Boot ───────────────────────────────────────────────────────────────────
  // Testing hook (read-only snapshot); harmless in normal use.
  window.__khairiyat = {
    snapshot: () => JSON.parse(JSON.stringify(state)),
    stats: () => stats(),
    guide: () => GUIDE.map((g, i) => ({ title: g.title, done: stepDone(i), checks: g.checks.map((c) => { try { return !!c[1](state); } catch (e) { return false; } }) })),
    messages: () => MSG_SPECS.map((sp) => ({ id: sp.id, step: sp.step, status: msgStatus(sp.id) }))
  };

  processMessages();
  checkCoverage();
  if (state.order.length && !layoutReady()) ui.view = 'list';
  renderAll();
})();
