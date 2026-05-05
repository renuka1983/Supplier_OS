// ── Logger ────────────────────────────────────────────────────
let _dispatch = null;
export const Logger = {
  init(fn) { _dispatch = fn; },
  _log(level, msg) {
    if (_dispatch) _dispatch({ level, msg, time: new Date().toTimeString().slice(0,8) });
  },
  head:  m => Logger._log('head',  m),
  info:  m => Logger._log('info',  m),
  ok:    m => Logger._log('ok',    m),
  warn:  m => Logger._log('warn',  m),
  error: m => Logger._log('error', m),
  data:  m => Logger._log('data',  m),
  sep:   ()=> Logger._log('sep',   '─'.repeat(60)),
};

// ── Number / date helpers ─────────────────────────────────────
export function toNum(v) {
  if (v == null || v === '') return 0;
  const n = parseFloat(String(v).replace(/,/g,''));
  return isNaN(n) ? 0 : n;
}

export function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export function toInt(v) {
  const n = parseInt(String(v||'').replace(/,/g,''), 10);
  return isNaN(n) ? null : n;
}

export function daysBetween(a, b) {
  const da = toDate(a), db = toDate(b);
  if (!da || !db) return null;
  return Math.abs((db - da) / 86400000);
}

export function monthKey(d) {
  const dt = toDate(d);
  if (!dt) return null;
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
}

export function isRound(n, threshold) {
  return n >= threshold && n % threshold === 0;
}

// Manual source — MANUAL or SPREADSHEET both count as human-initiated
export function isManual(r) {
  const s = String(r['SOURCE'] || '').toUpperCase().trim();
  return s === 'MANUAL' || s === 'SPREADSHEET';
}

export function isBlankDesc(v) {
  if (!v) return true;
  const s = String(v).trim().toLowerCase();
  return !s || ['adjustment','correction','misc','miscellaneous','test','n/a','na','other','others','manual','tbd'].includes(s);
}

export function fmtNum(n)   { return (n||0).toLocaleString('en-US'); }
export function fmtAmt(n,c='BHD') { return `${(n||0).toLocaleString('en-US',{maximumFractionDigits:0})} ${c}`; }
export function fmtDate(d)  { const dt=toDate(d); return dt?dt.toISOString().slice(0,10):'—'; }

// ── Row field accessors ───────────────────────────────────────
export const f = {
  glCode:   r => toInt(r['GL ACCOUNT CODE']),
  netAmt:   r => toNum(r['NET AMOUNT']),
  dr:       r => toNum(r['ENTERED DR']),
  cr:       r => toNum(r['ENTERED CR']),
  glDate:   r => toDate(r['GL DATE']),
  cDate:    r => toDate(r['GL CREATION DATE']),
  jv:       r => String(r['JV VOUCHER NUMBER']||''),
  src:      r => String(r['SOURCE']||'').toUpperCase().trim(),
  concept:  r => String(r['CONCEPT CODE']||'').trim(),
  cc:       r => String(r['COST CENTRE CODE']||'').trim(),
  entity:   r => String(r['ENTITY CODE']||'').trim(),
  user:     r => String(r['USERS']||'').trim(),
  desc:     r => String(r['DESCRIPTION']||'').trim(),
  glDesc:   r => String(r['GL DESC']||'').trim(),
  currency: r => String(r['CURRENCY CODE']||'BHD').trim(),
  vendor:   r => String(r['VENDOR CUSTOMER NAME']||'').trim(),
  icCode:   r => String(r['INTER COMPANY CODE']||'').trim(),
};

// ── Group by ──────────────────────────────────────────────────
export function groupBy(arr, keyFn) {
  return arr.reduce((acc, item) => {
    const k = keyFn(item);
    if (k == null) return acc;
    (acc[k] = acc[k]||[]).push(item);
    return acc;
  }, {});
}

// ── Finding factory ───────────────────────────────────────────
let _id = 0;
export function resetId() { _id = 0; }

/** Matches Python app.feature_engineering.build_transaction_id (SHA-1, first 16 hex chars). */
export function stableTxIdString(row) {
  const p = (v) => {
    if (v == null || v === '') return '';
    if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString();
    return String(v);
  };
  const r = row || {};
  return [
    p(r['JV VOUCHER NUMBER']),
    p(r['GL ACCOUNT CODE']),
    p(r['GL DATE']),
    p(r['ENTERED DR']),
    p(r['ENTERED CR']),
    p(r['USERS']),
    p(r['DESCRIPTION']),
  ].join('|');
}

export async function buildTransactionId(row) {
  const s = stableTxIdString(row);
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest('SHA-1', buf);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

/** Batched IDs for large workbooks (same result as buildTransactionId per row). */
export async function buildTransactionIds(rows, chunkSize = 400) {
  const ids = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    const slice = rows.slice(i, i + chunkSize);
    const part = await Promise.all(slice.map((r) => buildTransactionId(r)));
    ids.push(...part);
  }
  return ids;
}

export function finding({ ruleId, category, severity, row, glCode, glDesc, amount, detail, ruleLabel }) {
  const r = row || {};
  return {
    id:          ++_id,
    ruleId,
    category,
    severity,
    glCode:      String(glCode ?? f.glCode(r) ?? ''),
    glDesc:      glDesc ?? f.glDesc(r),
    jvNumber:    f.jv(r),
    glDate:      f.glDate(r),
    creationDate:f.cDate(r),
    amount:      amount ?? (() => { const net=Math.abs(f.netAmt(r)); return net>0 ? net : Math.max(f.dr(r), f.cr(r)); })(),
    currency:    f.currency(r),
    costCentre:  f.cc(r),
    concept:     f.concept(r),
    entity:      f.entity(r),
    user:        f.user(r),
    source:      f.src(r),
    description: f.desc(r),
    ruleLabel,
    detail,
    row:         r,
  };
}
