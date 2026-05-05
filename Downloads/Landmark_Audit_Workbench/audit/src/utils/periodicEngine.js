/**
 * PERIODIC ENGINE — Account-level analysis
 * ═══════════════════════════════════════════════════════════════
 * Produces AccountProfile objects — one per shortlisted account.
 * This is the CA's entry point: telescope before microscope.
 *
 * INTERACTION WITH TRANSACTION ENGINE:
 * Each AccountProfile.applicableTxRules lists which transaction
 * rules from engine.js are relevant to that account type.
 * When the CA drills into a flagged month, the transaction engine
 * runs ONLY those rules against ONLY that account's rows.
 */
import { Logger, toNum, toDate, monthKey, isManual } from './helpers';
import { SHORTLISTED_GL, ACCOUNT_META, DEFAULT_CONFIG } from '../constants';

// ── Amount histogram buckets ──────────────────────────────────
export const HIST_BUCKETS = [
  { label:'0–499',      min:0,      max:500,     key:'b0' },
  { label:'500–999',    min:500,    max:1000,    key:'b1' },
  { label:'1K–8,999',  min:1000,   max:9000,    key:'b2' },
  { label:'9K–9,999',  min:9000,   max:10000,   key:'b3', threshold:10000 },
  { label:'10K–89K',   min:10000,  max:90000,   key:'b4' },
  { label:'90K–99,999',min:90000,  max:100000,  key:'b5', threshold:100000 },
  { label:'100K–999K', min:100000, max:1000000, key:'b6' },
  { label:'1M+',       min:1000000,max:Infinity, key:'b7' },
];
export function computeHistogram(amountRows) {
  const buckets = HIST_BUCKETS.map(b=>({...b,drCount:0,crCount:0,drTotal:0,crTotal:0,flaggedCount:0}));
  for (const {dr,cr,flagged=false} of amountRows) {
    const a = dr>0 ? dr : cr;
    if (a<=0) continue;
    const b = buckets.find(bk=>a>=bk.min && a<bk.max);
    if (!b) continue;
    if (dr>0){b.drCount++;b.drTotal+=dr;}
    if (cr>0){b.crCount++;b.crTotal+=cr;}
    if (flagged) b.flaggedCount++;
  }
  return buckets;
}

// ── Month utilities ───────────────────────────────────────────
export function sortedMonths(rows) {
  const keys = new Set(rows.map(r => monthKey(toDate(r['GL DATE']))).filter(Boolean));
  return [...keys].sort();
}

function rowsForAccountMonth(rows, glCode, mk) {
  return rows.filter(r =>
    parseInt(r['GL ACCOUNT CODE']) === glCode &&
    monthKey(toDate(r['GL DATE'])) === mk
  );
}

// ── Monthly aggregate for one account ────────────────────────
function monthAggregate(rows, glCode, mk) {
  const acctRows = rowsForAccountMonth(rows, glCode, mk);
  if (!acctRows.length) return {
    month:mk, glCode, rowCount:0, totalDR:0, totalCR:0,
    netMovement:0, absAmount:0, jvCount:0, users:[], sources:[],
    manualCount:0, manualValue:0, lastDayAmt:0, last7Amt:0, rows:[],
  };

  const totalDR = acctRows.reduce((s,r)=>s+toNum(r['ENTERED DR']),0);
  const totalCR = acctRows.reduce((s,r)=>s+toNum(r['ENTERED CR']),0);
  const netMov  = totalDR - totalCR;
  const jvs     = new Set(acctRows.map(r=>r['JV VOUCHER NUMBER']).filter(Boolean));
  const users   = [...new Set(acctRows.map(r=>String(r['USERS']||'').trim()).filter(Boolean))];
  const sources = [...new Set(acctRows.map(r=>String(r['SOURCE']||'').toUpperCase().trim()).filter(Boolean))];
  const manuals = acctRows.filter(r=>isManual(r));

  // Last 3 days and last 7 days of month
  const lastDay = new Date(parseInt(mk.slice(0,4)), parseInt(mk.slice(5,7)), 0).getDate();
  const amtOf   = r => Math.abs(toNum(r['NET AMOUNT']))||Math.max(toNum(r['ENTERED DR']),toNum(r['ENTERED CR']));
  const last3   = acctRows.filter(r=>{ const d=toDate(r['GL DATE']); return d&&d.getDate()>=lastDay-2; });
  const last7   = acctRows.filter(r=>{ const d=toDate(r['GL DATE']); return d&&d.getDate()>=lastDay-6; });

  return {
    month:mk, glCode, rowCount:acctRows.length,
    totalDR, totalCR, netMovement:netMov, absAmount:Math.abs(netMov),
    closingBalance:netMov,
    jvCount:jvs.size, users, sources,
    manualCount:manuals.length,
    manualValue:manuals.reduce((s,r)=>s+amtOf(r),0),
    lastDayAmt:last3.reduce((s,r)=>s+amtOf(r),0),
    last7Amt:last7.reduce((s,r)=>s+amtOf(r),0),
    rows:acctRows,
  };
}

// ── Period flag evaluators ────────────────────────────────────
function evaluatePeriodFlags(glCode, meta, monthly, config) {
  const flags  = [];
  const type   = meta.type;
  const active = monthly.filter(m=>m.rowCount>0);
  const totalDR = monthly.reduce((s,m)=>s+m.totalDR,0);
  const totalCR = monthly.reduce((s,m)=>s+m.totalCR,0);

  const flag = (ruleId, severity, title, detail, months=[]) =>
    flags.push({ ruleId, severity, title, detail, months });

  // ── DUMMY / PENDING — any activity ───────────────────────
  if (type==='DUMMY'||type==='PENDING') {
    if (active.length>0) {
      flag('PER-DUM-01','CRITICAL',
        'Activity on account with no known purpose',
        `Account ${glCode} has ${active.reduce((s,m)=>s+m.rowCount,0)} entries across ${active.length} month(s). Every transaction requires investigation.`,
        active.map(m=>m.month));
      // Engineered clearing — activity during month, net zero at month-end
      const cleared = monthly.filter(m=>m.rowCount>0 && Math.abs(m.closingBalance)<0.01);
      if (cleared.length>0) {
        flag('PER-DUM-02','CRITICAL',
          'Engineered month-end clearance — activity hidden',
          `In ${cleared.length} month(s), entries were posted and exactly reversed by month-end leaving zero balance. Deliberate concealment pattern.`,
          cleared.map(m=>m.month));
      }
    }
  }

  // ── CLEARING — month-end must be zero ────────────────────
  if (type==='CLEARING') {
    const nonZero = monthly.filter(m=>m.rowCount>0 && Math.abs(m.closingBalance)>0.01);
    if (nonZero.length>0) {
      flag('PER-CLR-01','HIGH',
        'Clearing account carries non-zero month-end balance',
        `Account ${glCode} should net to zero at month-end. Carries a balance in ${nonZero.length} month(s): ${nonZero.map(m=>`${m.month} (${Math.round(m.closingBalance).toLocaleString()} BHD)`).join(', ')}.`,
        nonZero.map(m=>m.month));
    }
    // Growing balance
    if (nonZero.length>=3) {
      const bal = nonZero.map(m=>Math.abs(m.closingBalance));
      const growing = bal.slice(1).every((b,i)=>b>=bal[i]-0.01);
      if (growing) flag('PER-CLR-02','HIGH',
        'Clearing balance growing — systematic reconciliation failure',
        `The outstanding balance in account ${glCode} has increased across ${nonZero.length} months, indicating a systematic failure in the clearing/reconciliation process.`,
        nonZero.map(m=>m.month));
    }
    // Manual entries to clearing
    const manualMon = active.filter(m=>m.manualCount>0);
    if (manualMon.length>0) {
      flag('PER-CLR-03','CRITICAL',
        'Manual entries to clearing account',
        `Account ${glCode} received ${manualMon.reduce((s,m)=>s+m.manualCount,0)} manual journal entries across ${manualMon.length} month(s). Clearing should only be fed by automated system feeds.`,
        manualMon.map(m=>m.month));
    }
  }

  // ── PROVISION — trend, ratio, concentration ───────────────
  if (type==='PROVISION') {
    // 3+ months growing balance
    const bal = monthly.map(m=>m.closingBalance);
    let streak=0, bestStreak=0, streakMs=[], cur=[];
    for (let i=1;i<bal.length;i++) {
      if (bal[i]>bal[i-1]+0.01){ streak++; cur.push(monthly[i].month); if(streak>bestStreak){bestStreak=streak;streakMs=[...cur];} }
      else{ streak=0; cur=[]; }
    }
    if (bestStreak>=3) {
      flag('PER-PROV-01','HIGH',
        'Provision balance growing for 3+ consecutive months — no reversal',
        `Account ${glCode} closing balance increased for ${bestStreak} consecutive months without a corresponding reversal. Provisions should reverse when the underlying liability settles.`,
        streakMs);
    }
    // Booking/reversal ratio
    if (totalDR>0 && totalCR===0 && totalDR>config.roundNumberThreshold*5) {
      flag('PER-PROV-02','HIGH',
        'Provision — zero reversals across entire period',
        `Account ${glCode} has ${Math.round(totalDR).toLocaleString()} BHD in debit entries with no credits anywhere in the dataset. This provision has never been reversed or settled.`,
        active.map(m=>m.month));
    } else if (totalDR>0 && totalCR>0) {
      const ratio = Math.min(totalDR,totalCR)/Math.max(totalDR,totalCR);
      if (ratio<0.15 && Math.max(totalDR,totalCR)>config.roundNumberThreshold*10) {
        flag('PER-PROV-02','HIGH',
          'Provision highly one-directional — rarely reversed',
          `Account ${glCode}: booking/reversal ratio ${(ratio*100).toFixed(0)}%. DR ${Math.round(totalDR).toLocaleString()} vs CR ${Math.round(totalCR).toLocaleString()} BHD. A provision that rarely reverses may be a permanent balance sheet parking account.`,
          active.map(m=>m.month));
      }
    }
    // Period-end concentration per month
    active.forEach(m=>{
      const total=m.totalDR+m.totalCR;
      if(!total) return;
      const pct=(m.last7Amt/total)*100;
      if(pct>=config.provisionConcentrationPct) {
        flag('PER-PROV-03','HIGH',
          'Period-end provision concentration',
          `${m.month}: ${pct.toFixed(0)}% of provision activity (${Math.round(m.last7Amt).toLocaleString()} of ${Math.round(total).toLocaleString()} BHD) booked in last 7 days. Classic earnings management pattern.`,
          [m.month]);
      }
    });
    // Round-trip: booked and reversed same month
    const roundTrip = monthly.filter(m=>
      m.totalDR>config.roundNumberThreshold*2 && m.totalCR>config.roundNumberThreshold*2 &&
      Math.abs(m.totalDR-m.totalCR)/Math.max(m.totalDR,m.totalCR)<0.05
    );
    if (roundTrip.length>0) {
      flag('PER-PROV-04','HIGH',
        'Round-trip provision — booked and reversed same month',
        `Account ${glCode} shows ${roundTrip.length} month(s) where DR ≈ CR, suggesting entries were booked and reversed within the period without affecting the P&L.`,
        roundTrip.map(m=>m.month));
    }
  }

  // ── ADVANCE — balance trend, recovery ────────────────────
  if (type==='ADVANCE') {
    const withBal = monthly.filter(m=>m.closingBalance>0.01);
    if (withBal.length>=2) {
      const growing = withBal.slice(1).every((m,i)=>m.closingBalance>=withBal[i].closingBalance-0.01);
      if (growing) flag('PER-EMP-01','HIGH',
        'Employee advance outstanding balance growing',
        `Aggregate outstanding in account ${glCode} grew for ${withBal.length} consecutive months, reaching ${Math.round(withBal[withBal.length-1].closingBalance).toLocaleString()} BHD. Systemic recovery failure.`,
        withBal.map(m=>m.month));
    }
    if (totalCR===0 && totalDR>config.employeeAdvanceLimit*2) {
      flag('PER-EMP-02','HIGH',
        'Employee advances — zero recoveries across entire period',
        `Account ${glCode}: ${Math.round(totalDR).toLocaleString()} BHD advanced with no recovery credits anywhere in the dataset.`,
        active.map(m=>m.month));
    }
  }

  // ── CWIP — balance with no capitalisation ─────────────────
  if (type==='CWIP') {
    const additionMon = monthly.filter(m=>m.totalDR>0);
    const hasCred = monthly.some(m=>m.totalCR>0);
    if (additionMon.length>=3 && !hasCred) {
      flag('PER-CWIP-01','HIGH',
        'CWIP balance growing — no capitalisation entries detected',
        `Account ${glCode}: ${Math.round(totalDR).toLocaleString()} BHD across ${additionMon.length} months with no credit entries. If the asset is in use, depreciation is not running.`,
        additionMon.map(m=>m.month));
    }
  }

  // ── IC — net balance at month-end ─────────────────────────
  if (type==='IC') {
    const nonZero = monthly.filter(m=>m.rowCount>0&&Math.abs(m.closingBalance)>0.01);
    if (nonZero.length>0) {
      flag('PER-IC-01','HIGH',
        'IC account carries net balance at month-end',
        `Account ${glCode} carries a net balance in ${nonZero.length} month(s), indicating one-sided IC entries that will cause consolidation mismatches.`,
        nonZero.map(m=>m.month));
    }
  }

  // ── LOYALTY — direction and manual entries ────────────────
  if (type==='LOYALTY') {
    const decr = active.filter(m=>m.totalDR>m.totalCR);
    if (decr.length>0) {
      flag('PER-GV-01','HIGH',
        'Loyalty liability reducing — redemptions may not be matched',
        `Account ${glCode} shows net liability reduction in ${decr.length} month(s). Each reduction should match a sales/redemption event.`,
        decr.map(m=>m.month));
    }
    const manMon = active.filter(m=>m.manualCount>0);
    if (manMon.length>0) {
      flag('PER-GV-02','CRITICAL',
        'Manual entries to loyalty account',
        `Account ${glCode} received ${manMon.reduce((s,m)=>s+m.manualCount,0)} manual entries across ${manMon.length} month(s). Only the loyalty platform should post here.`,
        manMon.map(m=>m.month));
    }
  }

  // ── ALL ACCOUNTS — dormancy then spike ────────────────────
  const activity = monthly.map(m=>m.rowCount);
  for (let i=3;i<activity.length;i++) {
    const priorZero = activity.slice(i-3,i).every(c=>c===0);
    if (priorZero && activity[i]>0) {
      flag('PER-ALL-01','HIGH',
        'Dormant account — sudden activity after 3+ inactive months',
        `Account ${glCode} had zero activity for 3+ months then received ${activity[i]} entries in ${monthly[i].month}. Reactivated accounts require documented business justification.`,
        [monthly[i].month]);
      break;
    }
  }

  return flags;
}

// ── Build one account profile ─────────────────────────────────
function buildProfile(rows, glCode, months, config) {
  const meta = ACCOUNT_META[glCode] || {
    label:`Account ${glCode}`, type:'UNKNOWN', category:'Other', txRules:[],
  };
  // Monthly aggregates with running balance
  const monthly = months.map(mk=>monthAggregate(rows, glCode, mk));
  let running = 0;
  monthly.forEach(m=>{ running+=m.netMovement; m.closingBalance=running; });

  const totalDR   = monthly.reduce((s,m)=>s+m.totalDR,0);
  const totalCR   = monthly.reduce((s,m)=>s+m.totalCR,0);
  const totalRows = monthly.reduce((s,m)=>s+m.rowCount,0);
  const active    = monthly.filter(m=>m.rowCount>0);

  const flags = evaluatePeriodFlags(glCode, meta, monthly, config);

  const hasCrit = flags.some(f=>f.severity==='CRITICAL');
  const hasHigh = flags.some(f=>f.severity==='HIGH');
  const light   = hasCrit?'RED':hasHigh?'AMBER':active.length===0?'GREY':'GREEN';

  // Histogram from all rows
  const allRows = monthly.flatMap(m=>m.rows||[]);
  const histogram = computeHistogram(allRows.map(r=>({
    dr: toNum(r['ENTERED DR']),
    cr: toNum(r['ENTERED CR']),
  })));

  // Ageing buckets for CLEARING and PROVISION accounts
  let agingBuckets = null;
  if (meta.type==='CLEARING' || meta.type==='PROVISION') {
    const now = Date.now();
    const ag  = { d30:0, d60:0, d90:0, d180:0, d180p:0 };
    allRows.forEach(r=>{
      const d  = toDate(r['GL DATE']);
      const dr = toNum(r['ENTERED DR']);
      if (!d || dr<=0) return;
      const age = (now - d.getTime()) / 86400000;
      if      (age<=30)  ag.d30   += dr;
      else if (age<=60)  ag.d60   += dr;
      else if (age<=90)  ag.d90   += dr;
      else if (age<=180) ag.d180  += dr;
      else               ag.d180p += dr;
    });
    agingBuckets = ag;
  }

  return {
    glCode, meta, monthly, months,
    totalDR, totalCR, totalRows,
    activeMonths: active.length,
    light, flags,
    applicableTxRules: meta.txRules,
    histogram,
    agingBuckets,
  };
}

// ── Journal Intelligence ──────────────────────────────────────
export function buildJournalIntelligence(rows) {
  const manuals = rows.filter(r=>isManual(r));
  const total   = manuals.length;
  if (!total) {
    return {
      total:0, shareOfAll:0, users:[], patterns:[], sodViolations:0,
      sodPct:0, periodEnd:0, periodEndPct:0,
    };
  }

  const amtOf = r => Math.abs(toNum(r['NET AMOUNT']))||Math.max(toNum(r['ENTERED DR']),toNum(r['ENTERED CR']));

  // Per-user profiling
  const uMap = new Map();
  for (const row of manuals) {
    const user = String(row['USERS']||'').trim()||'Unknown';
    const gl   = parseInt(row['GL ACCOUNT CODE'])||0;
    const amt  = amtOf(row);
    const cd   = toDate(row['GL CREATION DATE']);
    const gd   = toDate(row['GL DATE']);
    const mk   = monthKey(gd);
    const hour = cd?cd.getHours():null;
    const dow  = cd?cd.getDay():null;

    if (!uMap.has(user)) uMap.set(user,{
      user, count:0, value:0, accounts:new Map(), months:new Map(),
      afterHours:0, weekend:0, lastDay:0,
    });
    const u = uMap.get(user);
    u.count++; u.value+=amt;
    u.accounts.set(gl,(u.accounts.get(gl)||0)+1);
    if (mk) u.months.set(mk,(u.months.get(mk)||0)+1);
    if (hour!==null && (hour<8||hour>=20)) u.afterHours++;
    if (dow!==null && (dow===5||dow===6))  u.weekend++;
    if (gd && mk) {
      const lastDay=new Date(gd.getFullYear(),gd.getMonth()+1,0).getDate();
      if (gd.getDate()>=lastDay-2) u.lastDay++;
    }
  }

  const users = [...uMap.values()].map(u=>{
    const share      = (u.count/total*100);
    const ahPct      = (u.afterHours/u.count*100);
    const wePct      = (u.weekend/u.count*100);
    const ldPct      = (u.lastDay/u.count*100);
    const topAccts   = [...u.accounts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5)
                        .map(([code,cnt])=>({ code, count:cnt, pct:(cnt/u.count*100).toFixed(0),
                          label:(ACCOUNT_META[code]||{}).label||`Account ${code}` }));

    let score=0; const riskFlags=[];
    if (share>50)      { score+=30; riskFlags.push(`Posts ${share.toFixed(0)}% of all manual JVs`); }
    else if (share>25) { score+=15; riskFlags.push(`Posts ${share.toFixed(0)}% of all manual JVs`); }
    if (ahPct>20)      { score+=25; riskFlags.push(`${ahPct.toFixed(0)}% after-hours`); }
    if (wePct>10)      { score+=20; riskFlags.push(`${wePct.toFixed(0)}% on weekends`); }
    if (ldPct>30)      { score+=20; riskFlags.push(`${ldPct.toFixed(0)}% in last 3 days of month`); }
    if (topAccts.length<=3&&u.count>5){ score+=15; riskFlags.push(`Concentrated in ${topAccts.length} account(s)`); }

    return {
      user:u.user, count:u.count, value:u.value, share, topAccts,
      afterHours:u.afterHours, ahPct, weekend:u.weekend, wePct,
      lastDay:u.lastDay, ldPct,
      riskScore:score, riskFlags,
      riskLevel: score>=50?'HIGH':score>=25?'MEDIUM':'LOW',
    };
  }).sort((a,b)=>b.riskScore-a.riskScore);

  // SoD at JV level
  const jvUsers = new Map();
  for (const row of manuals) {
    const jv=String(row['JV VOUCHER NUMBER']||'');
    const u=String(row['USERS']||'').trim();
    if (!jv) continue;
    if (!jvUsers.has(jv)) jvUsers.set(jv,new Set());
    jvUsers.get(jv).add(u);
  }
  const sodViolations = [...jvUsers.values()].filter(s=>s.size===1).length;
  const sodPct = jvUsers.size>0?(sodViolations/jvUsers.size*100):0;

  // Period-end surge
  const peManuals = manuals.filter(r=>{
    const gd=toDate(r['GL DATE']); if(!gd) return false;
    const ld=new Date(gd.getFullYear(),gd.getMonth()+1,0).getDate();
    return gd.getDate()>=ld-2;
  });
  const pePct = (peManuals.length/total*100);

  const patterns = [];
  if (sodViolations>0) patterns.push({
    type:'SOD', severity:'HIGH',
    title:'Single-user manual JVs — SoD not segregated',
    detail:`${sodViolations} of ${jvUsers.size} manual JVs (${sodPct.toFixed(0)}%) were posted entirely by one user. This is a systemic SoD gap, not an isolated incident.`,
  });
  if (pePct>25) patterns.push({
    type:'PERIOD_END', severity:'HIGH',
    title:'Manual journal surge at period-end',
    detail:`${peManuals.length} entries (${pePct.toFixed(0)}% of all manual journals) posted in the last 3 days of their accounting periods. Period-end manual activity is the primary earnings management mechanism.`,
  });

  return {
    total, shareOfAll:(total/rows.length*100),
    users, patterns, sodViolations, sodPct,
    periodEnd:peManuals.length, periodEndPct:pePct,
  };
}

// ── Main entry ────────────────────────────────────────────────
export async function runPeriodicEngine(parsedData, config, onProgress) {
  Logger.sep();
  Logger.head('PERIODIC ENGINE — Account Pulse + Journal Intelligence');
  Logger.info(`Shortlisted accounts: ${SHORTLISTED_GL.size}  |  GL rows: ${parsedData.glData.length}`);
  Logger.sep();

  const rows   = parsedData.glData;
  const months = sortedMonths(rows);
  Logger.info(`Months: ${months[0]} → ${months[months.length-1]} (${months.length} months)`);

  if (onProgress) onProgress(5, 'Building account profiles...');
  await new Promise(r=>setTimeout(r,0));

  const cfg     = config || DEFAULT_CONFIG;
  const glCodes = [...SHORTLISTED_GL];
  const profiles = [];

  for (let i=0;i<glCodes.length;i++) {
    profiles.push(buildProfile(rows, glCodes[i], months, cfg));
    if (i%15===0) {
      if (onProgress) onProgress(5+Math.round(i/glCodes.length*60), `Profiling accounts (${i+1}/${glCodes.length})...`);
      await new Promise(r=>setTimeout(r,0));
    }
  }

  Logger.ok(`Profiles built: ${profiles.length}`);
  Logger.data(`RED: ${profiles.filter(p=>p.light==='RED').length}  AMBER: ${profiles.filter(p=>p.light==='AMBER').length}  GREEN: ${profiles.filter(p=>p.light==='GREEN').length}  GREY: ${profiles.filter(p=>p.light==='GREY').length}`);

  if (onProgress) onProgress(70, 'Building journal intelligence...');
  await new Promise(r=>setTimeout(r,0));
  const journalIntel = buildJournalIntelligence(rows);
  Logger.ok(`Journal intelligence: ${journalIntel.users.length} users profiled`);
  Logger.data(`Manual share: ${journalIntel.shareOfAll.toFixed(1)}%  |  SoD violations: ${journalIntel.sodViolations}  |  Period-end surge: ${journalIntel.periodEndPct.toFixed(0)}%`);

  if (onProgress) onProgress(95, 'Computing statistics...');
  const stats = {
    months: months.length,
    red:    profiles.filter(p=>p.light==='RED').length,
    amber:  profiles.filter(p=>p.light==='AMBER').length,
    green:  profiles.filter(p=>p.light==='GREEN').length,
    grey:   profiles.filter(p=>p.light==='GREY').length,
    totalFlags:    profiles.reduce((s,p)=>s+p.flags.length,0),
    criticalFlags: profiles.reduce((s,p)=>s+p.flags.filter(f=>f.severity==='CRITICAL').length,0),
    highFlags:     profiles.reduce((s,p)=>s+p.flags.filter(f=>f.severity==='HIGH').length,0),
    flaggedAccounts: profiles.filter(p=>p.flags.length>0).length,
  };

  if (onProgress) onProgress(100, 'Complete');
  Logger.sep();
  Logger.head('PERIODIC ENGINE COMPLETE');
  Logger.data(`Period flags: ${stats.totalFlags}  |  Critical: ${stats.criticalFlags}  |  High: ${stats.highFlags}`);
  Logger.data(`Accounts needing attention: ${stats.red+stats.amber} of ${profiles.length}`);
  Logger.sep();

  return { profiles, journalIntel, months, stats };
}
