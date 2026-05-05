import {
  SEV, CAT,
  DUMMY_ACCOUNTS, PENDING_ACCOUNTS, EXPIRED_ACCOUNTS, EXPIRED_CC, SHORTLISTED_GL,
} from '../constants';
import { Logger, f, groupBy, toNum, toInt, daysBetween, monthKey,
         isRound, isBlankDesc, isManual, finding, resetId } from './helpers';

// Best amount for a row: NET AMOUNT if non-zero, else max(DR,CR)
const amt = r => {
  const n = Math.abs(toNum(r['NET AMOUNT']));
  return n > 0 ? n : Math.max(toNum(r['ENTERED DR']), toNum(r['ENTERED CR']));
};
const fmtA = (n, dec=2) => n.toLocaleString('en-US', { minimumFractionDigits:dec, maximumFractionDigits:dec });

const A = {
  CASH_CLEAR:  new Set([14551,14552]),
  ALL_PROV:    new Set([11251,11252,11253,11254,11256,11258,55101,55102,55104,55113,
                        24302,24303,24304,24305,24308,24312,24313,24315,24316,24318,
                        24319,24320,24324,24333,24334,24351,24352,24353,24354,24355,
                        24358,24359,24365,24366,24368,12405]),
  EMP_ADV:     new Set([12504,12505,12507]),
  IC_RECV:     new Set([12701]),
  IC_PAY:      new Set([21101]),
  CWIP:        new Set([16306,16307,16309]),
  GV_LIAB:     new Set([23224]),
};

export async function runEngine(parsedData, config, onProgress) {
  Logger.sep();
  Logger.head('RULES ENGINE  —  v11 (29 rules)');
  Logger.info(`Rows: ${parsedData.glData.length}  |  Manual = MANUAL+SPREADSHEET  |  COA Acc: ${(parsedData.coaData['COA Acc']||[]).length}`);
  Logger.sep();

  resetId();
  const rows    = parsedData.glData;
  const coaData = parsedData.coaData;
  const cfg     = config;
  const enabled = cfg.enabledRules || {};
  let   all     = [];

  // Fixed signature: (label, pct, ruleId|null, fn)
  // ruleId=null means always-on (locked rule, never skip)
  const run = async (label, pct, ruleId, fn) => {
    await new Promise(r => setTimeout(r, 0));
    if (ruleId && enabled[ruleId] === false) {
      Logger.info(`  Skipped (disabled): ${label}`);
      if (onProgress) onProgress(pct, label);
      return [];
    }
    Logger.info(`Running: ${label}...`);
    try {
      const res = fn();
      all.push(...res);
      Logger.ok(`  ${label}: ${res.length} finding(s)`);
      if (onProgress) onProgress(pct, label);
      return res;
    } catch (err) {
      Logger.error(`  ${label} ERROR: ${err.message}`);
      if (onProgress) onProgress(pct, label);
      return [];
    }
  };

  const byJV = groupBy(rows, r => f.jv(r));

  // 1 — Dummy & Pending
  await run('Dummy & Pending Accounts', 8, null, () => {
    const out = [];
    for (const row of rows) {
      const gc = f.glCode(row);
      if (DUMMY_ACCOUNTS.has(gc)) {
        out.push(finding({ ruleId:'DUM-01', category:CAT.DUMMY, severity:SEV.CRITICAL, row,
          ruleLabel:'Posting to dummy account (92001)',
          detail:`${fmtA(amt(row))} BHD posted by "${f.user(row)}" to account 92001 — this account has no description or authorised purpose. Every entry here is outside normal financial reporting.` }));
      }
      if (PENDING_ACCOUNTS.has(gc)) {
        out.push(finding({ ruleId:`PEND-${gc}`, category:CAT.DUMMY, severity:SEV.CRITICAL, row,
          ruleLabel:`Posting to unknown account (${gc})`,
          detail:`${fmtA(amt(row))} BHD posted to account ${gc} — this account has no description and no known business purpose. All entries are flagged regardless of amount.` }));
      }
    }
    return out;
  });

  // 2 — Expired GL accounts
  await run('Expired Account Postings', 14, null, () => {
    const out = [];
    for (const row of rows) {
      const gc  = f.glCode(row);
      const exp = EXPIRED_ACCOUNTS[gc];
      if (!exp) continue;
      const gd = f.glDate(row);
      if (gd && gd > new Date(exp)) {
        out.push(finding({ ruleId:'SEG-01', category:CAT.SEGMENT, severity:SEV.CRITICAL, row,
          ruleLabel:`Posting to expired GL account (${gc})`,
          detail:`Account ${gc} was closed on ${exp}. This entry is dated ${gd.toISOString().slice(0,10)}, which is after the account was deactivated. Posting to a closed account is a master data control failure.` }));
      }
    }
    return out;
  });

  // 3 — Expired cost centre
  await run('Expired Cost Centre', 18, null, () => {
    const out = [];
    for (const row of rows) {
      const cc  = f.cc(row);
      const exp = EXPIRED_CC[cc];
      if (!exp) continue;
      const gd = f.glDate(row);
      if (gd && gd > new Date(exp)) {
        out.push(finding({ ruleId:'SEG-02', category:CAT.SEGMENT, severity:SEV.CRITICAL, row,
          ruleLabel:`Posting to expired cost centre (${cc})`,
          detail:`Cost centre ${cc} was closed on ${exp}. This entry is dated ${gd.toISOString().slice(0,10)}, which is after closure. Charges cannot be legitimately allocated to a deactivated cost centre.` }));
      }
    }
    return out;
  });

  // 4 — Orphan GL account
  await run('Orphan GL Accounts', 22, null, () => {
    const coaAccCodes = new Set((coaData['COA Acc']||[]).map(r => toInt(r['Account'])).filter(Boolean));
    if (!coaAccCodes.size) return [];
    const out = [];
    const seen = new Set();
    for (const row of rows) {
      const gc = f.glCode(row);
      if (gc && !coaAccCodes.has(gc) && !seen.has(gc)) {
        seen.add(gc);
        out.push(finding({ ruleId:'SEG-03', category:CAT.SEGMENT, severity:SEV.CRITICAL, row,
          ruleLabel:`Orphan GL account — not in COA (${gc})`,
          detail:`Account ${gc} does not exist in the Chart of Accounts master. This entry has no valid account mapping — it cannot be classified, reported, or reconciled.` }));
      }
    }
    return out;
  });

  // 5 — Manual entry to cash clearing
  await run('Manual Entries to Cash Clearing', 26, null, () => {
    return rows
      .filter(r => A.CASH_CLEAR.has(f.glCode(r)) && isManual(r))
      .map(row => finding({ ruleId:'CLR-01', category:CAT.CLEARING, severity:SEV.CRITICAL, row,
        ruleLabel:'Manual journal to cash clearing account',
        detail:`${fmtA(amt(row))} BHD manually posted to cash clearing account ${f.glCode(row)} by "${f.user(row)}". This account is normally fed by automated POS systems only. A manual entry bypasses all system-enforced clearing controls.` }));
  });

  // 6 — Uncleared clearing balances
  await run('Uncleared Clearing Balances', 31, 'CLR-02', () => {
    const out = [];
    const clearRows = rows.filter(r => A.CASH_CLEAR.has(f.glCode(r)));
    const byCode    = groupBy(clearRows, r => f.glCode(r));
    for (const [code, cRows] of Object.entries(byCode)) {
      const debits  = cRows.filter(r => f.dr(r) > 0);
      const credits = cRows.filter(r => f.cr(r) > 0);
      for (const dr of debits) {
        const matched = credits.find(cr => {
          const d = daysBetween(f.glDate(dr), f.glDate(cr));
          return d !== null && d <= cfg.clearingWindowDays && Math.abs(f.netAmt(dr)-f.netAmt(cr)) < 0.01;
        });
        if (!matched) {
          const age = daysBetween(f.glDate(dr), new Date());
          out.push(finding({ ruleId:'CLR-02', category:CAT.CLEARING, severity:SEV.HIGH, row:dr,
            ruleLabel:`Uncleared clearing balance (${code})`,
            detail:`${fmtA(amt(dr))} BHD received into clearing account ${code} on ${f.glDate(dr)?.toISOString().slice(0,10)} but never settled. No matching bank deposit was found within ${cfg.clearingWindowDays} days.${age ? ` Entry is ${Math.round(age)} days old.` : ''}` }));
        }
      }
    }
    return out;
  });

  // 7 — Provision period-end concentration
  await run('Provision Period-End Concentration', 36, 'PROV-01', () => {
    const byMonth  = {};
    const lastWeek = {};
    for (const row of rows) {
      if (!A.ALL_PROV.has(f.glCode(row))) continue;
      const d = f.glDate(row);
      if (!d) continue;
      const mk  = monthKey(d);
      const a   = Math.abs(f.netAmt(row));
      byMonth[mk]  = (byMonth[mk]||0) + a;
      const lastDay = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
      if (d.getDate() >= lastDay - 6) lastWeek[mk] = (lastWeek[mk]||0) + a;
    }
    const out = [];
    for (const [mk, total] of Object.entries(byMonth)) {
      if (!total) continue;
      const lw  = lastWeek[mk]||0;
      const pct = (lw/total)*100;
      if (pct >= cfg.provisionConcentrationPct) {
        out.push(finding({ ruleId:'PROV-01', category:CAT.PROVISION, severity:SEV.HIGH,
          glCode:'MULTIPLE', glDesc:'Various provision accounts', jvNumber:'', amount:lw, currency:'BHD',
          ruleLabel:'Period-end provision concentration',
          detail:`In ${mk}, ${pct.toFixed(0)}% of all provision entries (${fmtA(lw)} BHD out of ${fmtA(total)} BHD) were booked in the last 7 days of the month. This concentration pattern is a classic earnings management signal. Threshold is ${cfg.provisionConcentrationPct}%.` }));
      }
    }
    return out;
  });

  // 8 — Duplicate provision same account/CC/month
  await run('Duplicate Provision Entries', 41, 'PROV-02', () => {
    const seen = {};
    const out  = [];
    for (const row of rows) {
      if (!A.ALL_PROV.has(f.glCode(row))) continue;
      const key = `${f.glCode(row)}|${f.cc(row)}|${Math.round(Math.abs(f.netAmt(row)))}|${monthKey(f.glDate(row))}`;
      if (seen[key]) {
        out.push(finding({ ruleId:'PROV-02', category:CAT.PROVISION, severity:SEV.HIGH, row,
          ruleLabel:'Duplicate provision entry',
          detail:`${fmtA(amt(row))} BHD provision to account ${f.glCode(row)} on cost centre ${f.cc(row)} was posted more than once in the same month. Duplicate provisions directly double-count expenses and overstate liabilities.` }));
      }
      seen[key] = true;
    }
    return out;
  });

  // 9 — Round number provisions
  await run('Round Number Provisions', 45, 'PROV-03', () => {
    return rows
      .filter(r => A.ALL_PROV.has(f.glCode(r)) && isRound(Math.abs(f.netAmt(r)), cfg.roundNumberThreshold) && Math.abs(f.netAmt(r)) >= cfg.roundNumberThreshold*5)
      .map(row => finding({ ruleId:'PROV-03', category:CAT.PROVISION, severity:SEV.MEDIUM, row,
        ruleLabel:'Round number provision',
        detail:`${fmtA(amt(row))} BHD is an exact round number (multiple of ${cfg.roundNumberThreshold} BHD). Round-number provisions suggest the amount was estimated by management rather than calculated from actual data.` }));
  });

  // 10 — Employee advance above limit / no recovery
  await run('Employee Advances', 49, 'EMP-01', () => {
    const out = [];
    const advDebits  = rows.filter(r => A.EMP_ADV.has(f.glCode(r)) && f.dr(r) > 0);
    const advCredits = rows.filter(r => A.EMP_ADV.has(f.glCode(r)) && f.cr(r) > 0);
    for (const row of advDebits) {
      if (f.dr(row) > cfg.employeeAdvanceLimit) {
        out.push(finding({ ruleId:'EMP-01', category:CAT.EMPLOYEE, severity:SEV.HIGH, row,
          ruleLabel:'Employee advance exceeds policy limit',
          detail:`${fmtA(f.dr(row))} BHD advance to "${f.vendor(row)||f.user(row)}" exceeds the policy limit of ${cfg.employeeAdvanceLimit} BHD. No approval reference was found in the description. This advance requires documented authorisation.` }));
      }
      const age = daysBetween(f.glDate(row), new Date());
      const recovered = advCredits.find(cr =>
        cr['VENDOR CUSTOMER NUMBER'] === row['VENDOR CUSTOMER NUMBER'] &&
        Math.abs(f.netAmt(cr) - f.netAmt(row)) < 0.01
      );
      if (!recovered && age !== null && age > cfg.advanceRecoveryDays) {
        out.push(finding({ ruleId:'EMP-02', category:CAT.EMPLOYEE, severity:SEV.HIGH, row,
          ruleLabel:'Employee advance — no recovery',
          detail:`${fmtA(amt(row))} BHD advance issued on ${f.glDate(row)?.toISOString().slice(0,10)||'unknown date'} has not been recovered after ${Math.round(age)} days. The policy recovery period is ${cfg.advanceRecoveryDays} days. Unrecovered advances may indicate a fictitious employee or an unapproved loan.` }));
      }
    }
    return out;
  });

  // 11 — Discount without tax leg
  await run('Employee Discount — Missing Tax', 53, 'EMP-03', () => {
    const out = [];
    for (const [, jvRows] of Object.entries(byJV)) {
      const d5 = jvRows.filter(r => f.glCode(r)===42305);
      const d6 = jvRows.filter(r => f.glCode(r)===42306);
      if (d5.length && !d6.length) {
        d5.forEach(row => out.push(finding({ ruleId:'EMP-03', category:CAT.EMPLOYEE, severity:SEV.HIGH, row,
          ruleLabel:'Employee discount without tax entry (42306)',
          detail:`JV ${f.jv(row)}: An employee discount was recorded but no corresponding tax entry was posted in the same voucher. The tax leg is missing — this is a VAT/tax compliance gap.` })));
      }
    }
    return out;
  });

  // 12 — Manual entry to Shukran GC
  await run('Manual Entry to Shukran Gift Card', 57, null, () => {
    return rows
      .filter(r => A.GV_LIAB.has(f.glCode(r)) && isManual(r))
      .map(row => finding({ ruleId:'GV-01', category:CAT.GV, severity:SEV.CRITICAL, row,
        ruleLabel:'Manual journal to Shukran Gift Card (23224)',
        detail:`${fmtA(amt(row))} BHD manually posted to the Shukran loyalty liability account by "${f.user(row)}". This account should only be updated by the loyalty platform. A manual entry can inflate or deflate the program balance, directly affecting reported liabilities.` }));
  });

  // 13 — Shukran liability release without redemption
  await run('Shukran Liability — Unjustified Release', 60, 'GV-02', () => {
    const out = [];
    for (const [, jvRows] of Object.entries(byJV)) {
      const releases = jvRows.filter(r => A.GV_LIAB.has(f.glCode(r)) && f.dr(r)>0);
      for (const row of releases) {
        const hasSales = jvRows.some(r => String(f.glCode(r)).startsWith('4') && f.cr(r)>0 && !A.GV_LIAB.has(f.glCode(r)));
        if (!hasSales) {
          out.push(finding({ ruleId:'GV-02', category:CAT.GV, severity:SEV.CRITICAL, row,
            ruleLabel:'Shukran loyalty liability — unjustified release',
            detail:`JV ${f.jv(row)}: The Shukran loyalty liability was reduced by ${fmtA(f.dr(row))} BHD but no corresponding sales or redemption entry was found in the same voucher. Releasing a liability without a redemption event artificially inflates profit.` }));
        }
      }
    }
    return out;
  });

  // 14 — One-sided IC entry
  await run('One-Sided IC Entry', 63, null, () => {
    const out = [];
    for (const [, jvRows] of Object.entries(byJV)) {
      const recv = jvRows.filter(r => A.IC_RECV.has(f.glCode(r)));
      const pay  = jvRows.filter(r => A.IC_PAY.has(f.glCode(r)));
      if (recv.length && !pay.length) {
        recv.forEach(row => out.push(finding({ ruleId:'IC-01', category:CAT.IC, severity:SEV.CRITICAL, row,
          ruleLabel:'One-sided IC entry — receivable without payable',
          detail:`JV ${f.jv(row)}: This voucher records that another Landmark entity owes ${fmtA(amt(row))} BHD (intercompany receivable), but the matching payable entry is missing. At group consolidation, this one-sided entry will cause an imbalance.` })));
      }
      if (pay.length && !recv.length) {
        pay.forEach(row => out.push(finding({ ruleId:'IC-01b', category:CAT.IC, severity:SEV.CRITICAL, row,
          ruleLabel:'One-sided IC entry — payable without receivable',
          detail:`JV ${f.jv(row)}: This voucher records that Shukran owes ${fmtA(amt(row))} BHD to another group entity (intercompany payable), but the matching receivable entry is missing. The intercompany transaction is incomplete and will not eliminate correctly at consolidation.` })));
      }
    }
    return out;
  });

  // 15 — CWIP ageing
  await run('CWIP Ageing', 66, 'CWIP-01', () => {
    return rows
      .filter(r => A.CWIP.has(f.glCode(r)) && f.dr(r)>0)
      .filter(r => { const age=daysBetween(f.glDate(r), new Date()); return age!==null && age>cfg.cwipAgeingDays; })
      .map(row => {
        const age = Math.round(daysBetween(f.glDate(row), new Date()));
        return finding({ ruleId:'CWIP-01', category:CAT.CWIP, severity:SEV.HIGH, row,
          ruleLabel:'CWIP entry — ageing exceeded',
          detail:`${fmtA(amt(row))} BHD sitting in capital work-in-progress account "${f.glDesc(row)||f.glCode(row)}" for ${age} days. The capitalisation threshold is ${cfg.cwipAgeingDays} days. If the asset is already in use, depreciation should be running but is not — this overstates profits.` });
      });
  });

  // 16 — SoD: same user both legs of manual JV
  await run('Segregation of Duties', 70, 'SOD-01', () => {
    const out = [];
    for (const [jv, jvRows] of Object.entries(byJV)) {
      if (!jvRows.some(r => isManual(r))) continue;
      const users = new Set(jvRows.map(r => f.user(r)).filter(Boolean));
      if (users.size===1 && jvRows.some(r=>f.dr(r)>0) && jvRows.some(r=>f.cr(r)>0)) {
        const row = jvRows[0];
        out.push(finding({ ruleId:'SOD-01', category:CAT.SOD, severity:SEV.HIGH, row,
          glCode:f.glCode(row), amount:jvRows.reduce((s,r)=>s+Math.abs(f.netAmt(r)),0),
          ruleLabel:'SoD violation — same user on both sides of manual JV',
          detail:`JV ${jv}: Both the debit and credit sides of this manual journal were posted by the same person ("${[...users][0]}"). No independent review occurred. This is a segregation of duties violation — one person should not be able to create and approve their own entries.` }));
      }
    }
    return out;
  });

  // 17 — After-hours posting
  await run('After-Hours Posting', 74, 'TIME-01', () => {
    return rows
      .filter(r => {
        const cd = f.cDate(r);
        if (!cd) return false;
        const hr = cd.getHours();
        return (hr < cfg.businessHoursStart || hr >= cfg.businessHoursEnd) &&
               (isManual(r) || Math.abs(f.netAmt(r))>=cfg.highValueManualThreshold);
      })
      .map(row => {
        const cd = f.cDate(row);
        return finding({ ruleId:'TIME-01', category:CAT.TIMING, severity:SEV.HIGH, row,
          ruleLabel:'After-hours posting',
          detail:`This entry was created at ${cd.toISOString().slice(0,16)} (${cd.getHours()}:00 hrs) — outside the configured business hours of ${cfg.businessHoursStart}:00 to ${cfg.businessHoursEnd}:00. After-hours postings indicate system access during unsupervised periods.` });
      });
  });

  // 18 — Weekend posting
  await run('Weekend Posting', 78, 'TIME-02', () => {
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    return rows
      .filter(r => {
        const cd = f.cDate(r);
        return cd && cfg.weekendDays.includes(cd.getDay()) &&
               (isManual(r) || Math.abs(f.netAmt(r))>=cfg.highValueManualThreshold);
      })
      .map(row => {
        const cd = f.cDate(row);
        return finding({ ruleId:'TIME-02', category:CAT.TIMING, severity:SEV.HIGH, row,
          ruleLabel:'Weekend posting',
          detail:`This entry was created on ${cd.toISOString().slice(0,10)} (${days[cd.getDay()]}), which is a configured weekend day. Weekend postings on manual or high-value entries indicate unauthorised system access outside normal working hours.` });
      });
  });

  // 19 — Backdated entry (prior-period)
  await run('Backdated Entries', 81, 'TIME-03', () => {
    return rows
      .filter(r => {
        const gd=f.glDate(r), cd=f.cDate(r);
        if (!gd||!cd) return false;
        const lagDays = (cd - gd) / 86400000;
        if (lagDays <= cfg.postingLagDays) return false;
        return cd.getFullYear() !== gd.getFullYear() || cd.getMonth() !== gd.getMonth();
      })
      .map(row => {
        const lag = Math.round((f.cDate(row) - f.glDate(row)) / 86400000);
        return finding({ ruleId:'TIME-03', category:CAT.TIMING, severity:SEV.HIGH, row,
          ruleLabel:'Backdated entry — prior period',
          detail:`This entry is dated ${f.glDate(row)?.toISOString().slice(0,10)} (a prior month) but was only created on ${f.cDate(row)?.toISOString().slice(0,10)}, ${lag} days later. Backdating into a closed period can manipulate period-end financial results and requires controller-level approval.` });
      });
  });

  // 20 — Posting lag (same period)
  await run('Posting Lag', 84, 'TIME-04', () => {
    return rows
      .filter(r => {
        const gd=f.glDate(r), cd=f.cDate(r);
        if (!gd||!cd) return false;
        const lag = (cd-gd)/86400000;
        if (lag <= cfg.postingLagDays) return false;
        // Only same-period lag here (prior-period is TIME-03)
        return cd.getFullYear()===gd.getFullYear() && cd.getMonth()===gd.getMonth();
      })
      .map(row => {
        const lag = Math.round((f.cDate(row)-f.glDate(row))/86400000);
        return finding({ ruleId:'TIME-04', category:CAT.TIMING, severity:SEV.MEDIUM, row,
          ruleLabel:'Delayed posting',
          detail:`Entry dated ${f.glDate(row)?.toISOString().slice(0,10)} was not recorded in the system until ${f.cDate(row)?.toISOString().slice(0,10)}, a delay of ${lag} days. Entries should normally be posted within ${cfg.postingLagDays} days of the transaction date.` });
      });
  });

  // 21 — Blank description
  await run('Blank Description', 87, 'JQ-01', () => {
    return rows
      .filter(r => isManual(r) && Math.abs(f.netAmt(r))>=cfg.blankDescMinAmount && isBlankDesc(f.desc(r)))
      .map(row => finding({ ruleId:'JQ-01', category:CAT.JOURNAL, severity:SEV.MEDIUM, row,
        ruleLabel:'Blank/generic description on manual entry',
        detail:`${fmtA(amt(row))} BHD manual entry by "${f.user(row)}" has no meaningful description. Without a description, this entry cannot be assessed for business purpose during an audit. A description is mandatory for manual entries above ${cfg.blankDescMinAmount} BHD.` }));
  });

  // 22 — Duplicate posting (O(n log n) grouped approach)
  await run('Duplicate Postings', 91, 'DUP-01', () => {
    const out  = [];
    const seen = {};
    const groups = {};
    for (const r of rows) {
      const a = Math.round(Math.abs(f.netAmt(r)));
      if (!a) continue;
      const key = `${f.glCode(r)}|${a}|${f.cc(r)}|${f.concept(r)}`;
      (groups[key] = groups[key] || []).push(r);
    }
    for (const [key, grp] of Object.entries(groups)) {
      if (grp.length < 2) continue;
      const sorted = [...grp].sort((a,b)=>{ const da=f.glDate(a),db=f.glDate(b); return da&&db?da-db:0; });
      for (let i=0; i<sorted.length; i++) {
        const r = sorted[i];
        const gd = f.glDate(r);
        for (let j=i+1; j<sorted.length; j++) {
          const r2 = sorted[j];
          const d  = daysBetween(gd, f.glDate(r2));
          if (d===null || d>cfg.duplicateWindowDays) break;
          if (f.jv(r)===f.jv(r2)) continue;
          const dk = [key,f.jv(r),f.jv(r2)].sort().join('|');
          if (!seen[dk]) {
            seen[dk]=true;
            const a = Math.round(Math.abs(f.netAmt(r)));
            out.push(finding({ ruleId:'DUP-01', category:CAT.DUPLICATE, severity:SEV.HIGH, row:r,
              jvNumber:`${f.jv(r)} & ${f.jv(r2)}`,
              ruleLabel:'Potential duplicate posting',
              detail:`Account ${f.glCode(r)}, ${fmtA(a)} BHD on cost centre ${f.cc(r)} appears in both JV ${f.jv(r)} and JV ${f.jv(r2)} within ${Math.round(d)} days. This may be a duplicate posting — the same transaction recorded twice, causing double-counted expenses.` }));
          }
        }
      }
    }
    return out;
  });

  // 23 — High-value manual without approval
  await run('Unapproved High-Value Manuals', 94, 'SOD-02', () => {
    return rows
      .filter(r => isManual(r) && Math.abs(f.netAmt(r))>=cfg.highValueManualThreshold && isBlankDesc(f.desc(r)))
      .map(row => finding({ ruleId:'SOD-02', category:CAT.SOD, severity:SEV.HIGH, row,
        ruleLabel:'High-value manual — no approval reference',
        detail:`${fmtA(amt(row))} BHD manual entry by "${f.user(row)}" has a blank or generic description. High-value manual entries require an approval reference in the description field so the authorising officer can be identified during review.` }));
  });

  // 24 — CWIP below capitalization threshold
  await run('CWIP Below Cap Threshold', 97, 'CWIP-02', () => {
    return rows
      .filter(r => A.CWIP.has(f.glCode(r)) && Math.abs(f.netAmt(r))>0 && Math.abs(f.netAmt(r))<cfg.capitalizationThreshold)
      .map(row => finding({ ruleId:'CWIP-02', category:CAT.CWIP, severity:SEV.MEDIUM, row,
        ruleLabel:'CWIP — below capitalisation threshold',
        detail:`${fmtA(amt(row))} BHD posted to capital work-in-progress account ${f.glCode(row)}, but this amount is below the capitalisation threshold of ${cfg.capitalizationThreshold} BHD. Low-value items should be expensed directly to the P&L, not held in CWIP where they avoid depreciation.` }));
  });

  // 26 — Deferred expense: manual JV debits prepayment (12802) AND credits expense (5xxxx/6xxxx)
  await run('Deferred Expense Detection', 101, 'DEF-01', () => {
    const out = [];
    for (const [, jvRows] of Object.entries(byJV)) {
      if (!jvRows.some(r => isManual(r))) continue;
      const prepDebits = jvRows.filter(r => f.glCode(r)===12802 && f.dr(r)>0);
      if (!prepDebits.length) continue;
      const hasExpCr = jvRows.some(r => {
        const gc = String(f.glCode(r)||'');
        return (gc.startsWith('5')||gc.startsWith('6')) && f.cr(r)>0;
      });
      if (hasExpCr) {
        prepDebits.forEach(row => out.push(finding({
          ruleId:'DEF-01', category:CAT.JOURNAL, severity:SEV.HIGH, row,
          ruleLabel:'Deferred expense — rerouted to prepayment account',
          detail:`JV ${f.jv(row)}: A manual/spreadsheet entry debits the prepayments account (12802) for ${fmtA(f.dr(row))} BHD while crediting an expense account in the same voucher. This reclassification shifts a current-period expense to a future period, understating current expenses. Requires documented business justification.`,
        })));
      }
    }
    return out;
  });

  // 27 — Threshold avoidance: manual entries just below configured approval thresholds
  await run('Threshold Avoidance Detection', 103, 'THR-01', () => {
    const out = [];
    const thresholds = (cfg.approvalThresholds || [500, 1000, 10000, 100000]).sort((a,b)=>a-b);
    const bandPct    = (cfg.thresholdBandPct || 10) / 100;
    for (const row of rows) {
      if (!isManual(row)) continue;
      const a = amt(row);
      if (a === 0) continue;
      for (const T of thresholds) {
        const lower = T * (1 - bandPct);
        if (a >= lower && a < T) {
          const pctBelow = ((T - a) / T * 100).toFixed(1);
          out.push(finding({
            ruleId:'THR-01', category:CAT.JOURNAL, severity:SEV.HIGH, row,
            ruleLabel:'Possible threshold avoidance',
            detail:`Manual/spreadsheet entry of ${fmtA(a)} BHD by "${f.user(row)}" falls ${pctBelow}% below the ${fmtA(T,0)} BHD approval threshold. Entries clustered just below control thresholds are a strong indicator of deliberate avoidance to bypass approval requirements.`,
          }));
          break;
        }
      }
    }
    return out;
  });

  // 28 — Vendor dormancy: payments to vendors inactive for > configured months
  await run('Dormant Vendor Payments', 105, 'VND-01', () => {
    const out = [];
    const dormancyMs = (cfg.vendorDormancyMonths || 8) * 30 * 86400000;
    // Identify payment-like rows by SOURCE or TRANSACTION TYPE
    const isPayment = r => {
      const src = f.src(r);
      const tt  = String(r['TRANSACTION TYPE']||'').toUpperCase();
      return src.includes('PAYAB') || src==='AP' || src.includes('PAYMENT') || tt.includes('PAYMENT');
    };
    const payments = rows.filter(r => isPayment(r) && f.cr(r)>0);
    if (!payments.length) return out;
    // Build per-vendor sorted date array
    const vendorDates = {};
    rows.forEach(r => {
      const vn = r['VENDOR CUSTOMER NUMBER'];
      const d  = f.glDate(r);
      if (!vn || !d) return;
      (vendorDates[vn] = vendorDates[vn]||[]).push(d.getTime());
    });
    Object.values(vendorDates).forEach(arr => arr.sort((a,b)=>a-b));
    for (const row of payments) {
      const vn = row['VENDOR CUSTOMER NUMBER'];
      if (!vn) continue;
      const dates = vendorDates[vn];
      if (!dates || dates.length < 2) continue;
      const lastTs = dates[dates.length-1];
      const prevTs = dates[dates.length-2];
      const gapMs  = lastTs - prevTs;
      if (gapMs > dormancyMs) {
        const gapDays = Math.round(gapMs / 86400000);
        out.push(finding({
          ruleId:'VND-01', category:CAT.DUPLICATE, severity:SEV.HIGH, row,
          ruleLabel:'Payment to dormant vendor',
          detail:`Payment of ${fmtA(amt(row))} BHD to vendor "${f.vendor(row)||vn}" — this vendor had no activity for ${gapDays} days prior to this payment (threshold: ${cfg.vendorDormancyMonths*30} days). Payments to long-dormant vendors require verification that the vendor relationship is still active and legitimate.`,
        }));
      }
    }
    return out;
  });

  // 29 — New vendor: first-ever manual payment
  await run('New Vendor — First Payment', 107, 'VND-02', () => {
    const out = [];
    const isPayment = r => {
      const src = f.src(r);
      const tt  = String(r['TRANSACTION TYPE']||'').toUpperCase();
      return src.includes('PAYAB') || src==='AP' || src.includes('PAYMENT') || tt.includes('PAYMENT');
    };
    const vendorCount = {};
    rows.forEach(r => {
      const vn = r['VENDOR CUSTOMER NUMBER'];
      if (vn) vendorCount[vn] = (vendorCount[vn]||0)+1;
    });
    for (const row of rows) {
      if (!isManual(row)) continue;
      if (!isPayment(row)) continue;
      const vn = row['VENDOR CUSTOMER NUMBER'];
      if (!vn) continue;
      if ((vendorCount[vn]||0) <= 1) {
        out.push(finding({
          ruleId:'VND-02', category:CAT.DUPLICATE, severity:SEV.MEDIUM, row,
          ruleLabel:'Manual payment to new/unknown vendor',
          detail:`Manual/spreadsheet payment of ${fmtA(amt(row))} BHD to vendor "${f.vendor(row)||vn}" — this vendor has no other activity in the dataset. First-time manual payments require verification that the vendor is properly registered and the payment is authorised.`,
        }));
      }
    }
    return out;
  });

  // 25 — Coverage check (informational only)
  await run('Shortlisted GL Coverage Check', 110, null, () => {
    const glInData = new Set(rows.map(r=>f.glCode(r)).filter(Boolean));
    const missing  = [...SHORTLISTED_GL].filter(g=>!glInData.has(g));
    if (missing.length > 0) Logger.info(`  ${missing.length} shortlisted GL codes not present in this dataset.`);
    return [];
  });

  const stats = buildStats(all);
  Logger.sep();
  Logger.head('ENGINE COMPLETE');
  Logger.data(`Total: ${all.length}  |  CRITICAL: ${stats.bySev.CRITICAL||0}  |  HIGH: ${stats.bySev.HIGH||0}  |  MEDIUM: ${stats.bySev.MEDIUM||0}`);
  Logger.data(`Categories: ${Object.keys(stats.byCat).length}  |  Accounts: ${stats.glCount}  |  Users: ${stats.userCount}`);
  Logger.sep();
  return { findings:all, stats };
}

function buildStats(findings) {
  const bySev={}, byCat={}, byRule={}, byUser={};
  const gls=new Set(), users=new Set();
  for (const fi of findings) {
    bySev[fi.severity] = (bySev[fi.severity]||0)+1;
    byCat[fi.category] = (byCat[fi.category]||0)+1;
    byRule[fi.ruleId]  = (byRule[fi.ruleId] ||0)+1;
    if (fi.user) { byUser[fi.user]=(byUser[fi.user]||0)+1; users.add(fi.user); }
    if (fi.glCode && fi.glCode!=='MULTIPLE') gls.add(fi.glCode);
  }
  return {
    total:     findings.length,
    bySev, byCat, byRule, byUser,
    glCount:   gls.size,
    userCount: users.size,
    catBreakdown: Object.entries(byCat).map(([n,c])=>({name:n,count:c})).sort((a,b)=>b.count-a.count),
    topUsers:     Object.entries(byUser).map(([u,c])=>({user:u,count:c})).sort((a,b)=>b.count-a.count).slice(0,15),
    topRules:     Object.entries(byRule).map(([r,c])=>({ruleId:r,count:c})).sort((a,b)=>b.count-a.count).slice(0,15),
  };
}
