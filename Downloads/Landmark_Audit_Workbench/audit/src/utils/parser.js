import * as XLSX from 'xlsx';
import { EXPECTED_COLS, EXPECTED_SHEETS, SHORTLISTED_GL } from '../constants';
import { Logger, toDate, toNum } from './helpers';

export async function parseWorkbook(file) {
  Logger.sep();
  Logger.head('FILE INGESTION');
  Logger.info(`${file.name}  ·  ${(file.size/1024).toFixed(1)} KB`);

  const buf = await file.arrayBuffer();
  const wb  = XLSX.read(buf, { type:'array', cellDates:true });

  Logger.ok(`Workbook parsed  —  ${wb.SheetNames.length} sheet(s): [${wb.SheetNames.join(', ')}]`);

  // ── Sheet metadata ────────────────────────────────────────
  const sheetMeta = {};
  wb.SheetNames.forEach(name => {
    const ws    = wb.Sheets[name];
    const range = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : null;
    sheetMeta[name] = { rows: range ? range.e.r : 0, cols: range ? range.e.c+1 : 0 };
  });

  // Check expected sheets
  for (const [name, cfg] of Object.entries(EXPECTED_SHEETS)) {
    const found = wb.SheetNames.includes(name);
    if (found) Logger.ok(`  FOUND    "${name}"  [${sheetMeta[name].rows} rows × ${sheetMeta[name].cols} cols]`);
    else cfg.required ? Logger.error(`  MISSING  "${name}"  — REQUIRED`) : Logger.warn(`  MISSING  "${name}"  — optional`);
  }

  // ── Parse GL Transactions ─────────────────────────────────
  if (!wb.SheetNames.includes('GL Transactions')) throw new Error('"GL Transactions" sheet not found.');

  const glWs   = wb.Sheets['GL Transactions'];
  const raw    = XLSX.utils.sheet_to_json(glWs, { header:1, defval:null, raw:false, dateNF:'yyyy-mm-dd' });
  const headers= (raw[0]||[]).map(h => String(h??'').trim());
  const rows   = [];

  for (let i = 1; i < raw.length; i++) {
    const row = raw[i];
    if (!row || row.every(v => v==null||v==='')) continue;
    const obj = {};
    headers.forEach((h,idx) => { obj[h] = row[idx]??null; });
    rows.push(obj);
  }

  Logger.ok(`GL rows parsed: ${rows.length}  |  Columns: ${headers.length}`);
  const missingCols = EXPECTED_COLS.filter(c => !headers.includes(c));
  if (missingCols.length === 0) Logger.ok(`All ${EXPECTED_COLS.length} expected columns present ✓`);
  else Logger.warn(`Missing columns (${missingCols.length}): [${missingCols.slice(0,5).join(', ')}${missingCols.length>5?'...':''}]`);

  // ── Parse COA sheets ──────────────────────────────────────
  const coaData = {};
  for (const name of ['COA Concept','COA CC','COA Acc','COA IC','ICC','Reporting']) {
    if (!wb.SheetNames.includes(name)) { coaData[name]=[]; continue; }
    const data = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval:null, raw:false });
    coaData[name] = data;
    Logger.ok(`  COA "${name}"  —  ${data.length} records`);
  }

  // ── Validation checks ─────────────────────────────────────
  Logger.sep();
  Logger.head('SCHEMA VALIDATION');
  const checks = [];
  const chk = (ok, label, detail, critical=false) => {
    checks.push({ ok, label, detail, critical });
    Logger[ok?'ok':(critical?'error':'warn')](`  [${ok?'PASS':'FAIL'}] ${label}  —  ${detail}`);
  };

  chk(rows.length > 0,                     'GL rows present',               `${rows.length} rows`, true);
  chk(missingCols.length === 0,            'Schema columns',                 missingCols.length===0?`${EXPECTED_COLS.length}/47 ✓`:`${missingCols.length} missing`, true);
  chk(rows.filter(r=>!r['GL DATE']).length===0, 'GL DATE populated',         `${rows.filter(r=>!r['GL DATE']).length} nulls`);
  chk(rows.filter(r=>!r['GL ACCOUNT CODE']).length===0, 'GL ACCOUNT CODE',  'all rows', true);
  chk(rows.filter(r=>!r['USERS']||!String(r['USERS']).trim()).length===0, 'USERS field', 'all rows');

  const glInData    = new Set(rows.map(r=>parseInt(r['GL ACCOUNT CODE'])).filter(Boolean));
  const slFound     = [...SHORTLISTED_GL].filter(g=>glInData.has(g));
  chk(slFound.length>0, 'Shortlisted GLs in data', `${slFound.length}/${SHORTLISTED_GL.size} shortlisted accounts present`);
  chk((coaData['COA Acc']||[]).length>0,  'COA Acc loaded',                  `${(coaData['COA Acc']||[]).length} accounts`);
  chk((coaData['COA CC']||[]).length>0,   'COA CC loaded',                   `${(coaData['COA CC']||[]).length} cost centres`);

  const totalDR = rows.reduce((s,r)=>s+toNum(r['ENTERED DR']),0);
  const totalCR = rows.reduce((s,r)=>s+toNum(r['ENTERED CR']),0);
  chk(Math.abs(totalDR-totalCR)<1, 'DR = CR (trial balance)', Math.abs(totalDR-totalCR)<1?'Balanced ✓':`Delta ${Math.abs(totalDR-totalCR).toLocaleString()}`);

  // ── Summary ───────────────────────────────────────────────
  Logger.sep();
  Logger.head('DATA SUMMARY');
  const dates    = rows.map(r=>toDate(r['GL DATE'])).filter(Boolean).sort((a,b)=>a-b);
  const uniq     = col => [...new Set(rows.map(r=>r[col]).filter(Boolean))];
  const sumNum   = col => rows.reduce((s,r)=>s+toNum(r[col]),0);

  const summary = {
    totalRecords:   rows.length,
    dateMin:        dates[0]||null,
    dateMax:        dates[dates.length-1]||null,
    dateDays:       dates.length>1?Math.round((dates[dates.length-1]-dates[0])/86400000)+1:0,
    entityCount:    uniq('ENTITY CODE').length,
    entityList:     uniq('ENTITY CODE').slice(0,5).join(', '),
    conceptCount:   uniq('CONCEPT CODE').length,
    currencyList:   uniq('CURRENCY CODE').join(', '),
    userCount:      uniq('USERS').length,
    accountCount:   uniq('GL ACCOUNT CODE').length,
    sourceList:     uniq('SOURCE').join(', '),
    jvCount:        new Set(rows.map(r=>r['JV VOUCHER NUMBER']).filter(Boolean)).size,
    manualJVs:      rows.filter(r=>String(r['SOURCE']||'').toUpperCase()==='MANUAL').length,
    totalDR:        sumNum('ENTERED DR'),
    totalCR:        sumNum('ENTERED CR'),
    shortlistedFound: slFound.length,
  };

  Logger.data(`Records: ${summary.totalRecords}  |  JVs: ${summary.jvCount}  |  Manual: ${summary.manualJVs}`);
  Logger.data(`Dates: ${dates[0]?.toISOString().slice(0,10)} → ${dates[dates.length-1]?.toISOString().slice(0,10)}  (${summary.dateDays} days)`);
  Logger.data(`Entities: ${summary.entityCount}  |  Concepts: ${summary.conceptCount}  |  Users: ${summary.userCount}`);
  Logger.data(`Total DR: ${summary.totalDR.toLocaleString()}  |  Total CR: ${summary.totalCR.toLocaleString()}`);
  Logger.ok('Ingestion complete.');

  return { fileName:file.name, fileSize:(file.size/1024).toFixed(1)+' KB',
           sheetNames:wb.SheetNames, sheetMeta, glData:rows, glHeaders:headers,
           coaData, validation:checks, summary };
}
