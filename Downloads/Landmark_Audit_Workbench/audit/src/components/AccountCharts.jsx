/**
 * AccountCharts — v9
 * Two-chart system for the account Overview tab:
 *   Chart 1: Net movement (line + bar) with anomaly markers + cumulative toggle
 *   Chart 2: DR vs CR grouped bars with anomaly highlights
 *
 * Props:
 *   monthly      — array of monthly aggregates from periodicEngine
 *   flags        — period-level flags from periodicEngine
 *   txFindings   — all transaction findings for this account
 *   glCode       — account code (for finding matching)
 *   totalDR      — total DR across all months
 *   totalCR      — total CR across all months
 *   totalRows    — total row count
 *   meta         — account meta (label, type, category)
 *   activeMonths — count of months with activity
 *   onMonthClick — callback(monthKey) when user clicks a month bar/point
 */

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { toDate } from '../utils/helpers';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

const T = {
  orange: '#E8630A', orangeLt: '#FFF0E6',
  green: '#059669',  blue: '#2563EB',
  red: '#DC2626',    amber: '#D97706',
  purple: '#7C3AED', text: '#111827',
  sub: '#6B7280',    dim: '#9CA3AF',
  mid: '#EDE8E1',    card: '#FFFFFF',
  border: 'rgba(0,0,0,0.08)', borderHi: 'rgba(0,0,0,0.15)',
  sm: '0 1px 3px rgba(0,0,0,0.08)',
};

const SC = {
  CRITICAL: { bg:'#FEF2F2', bo:'#FECACA', c:'#DC2626' },
  HIGH:     { bg:'#FFFBEB', bo:'#FDE68A', c:'#D97706' },
  MEDIUM:   { bg:'#EFF6FF', bo:'#BFDBFE', c:'#2563EB' },
};

function fmtK(v) {
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1000000) return (v / 1000000).toFixed(1) + 'M';
  if (a >= 1000)    return (v / 1000).toFixed(1) + 'K';
  return Math.round(v).toLocaleString();
}

function Ctrl({ label, active, onClick, variant = 'orange' }) {
  const colors = {
    orange: { on: { background:'#FFF0E6', borderColor:'#E8630A', color:'#E8630A' }, off: {} },
    blue:   { on: { background:'#EFF6FF', borderColor:'#2563EB', color:'#2563EB' }, off: {} },
    red:    { on: { background:'#FEF2F2', borderColor:'#DC2626', color:'#DC2626' }, off: {} },
  };
  const style = active ? colors[variant]?.on || {} : {};
  return (
    <button onClick={onClick} style={{
      padding:'3px 11px', borderRadius:20,
      border:`0.5px solid ${active ? (colors[variant]?.on?.borderColor || T.amber) : T.borderHi}`,
      background: active ? (colors[variant]?.on?.background || T.orangeLt) : 'transparent',
      cursor:'pointer', fontSize:11, color: active ? (colors[variant]?.on?.color || T.orange) : T.sub,
      fontFamily:'var(--fb)', transition:'all 0.15s', ...style,
    }}>{label}</button>
  );
}

// ── Narrative generator ───────────────────────────────────────
function buildNarrative({ totalDR, totalCR, totalRows, activeMonths, meta, flags, txCount, manualPct }) {
  const net = totalDR - totalCR;
  const netStr = net >= 0 ? `net debit of ${fmtK(Math.abs(net))} BHD` : `net credit of ${fmtK(Math.abs(net))} BHD`;
  const grossStr = `gross activity ${fmtK(totalDR + totalCR)} BHD (DR ${fmtK(totalDR)} / CR ${fmtK(totalCR)})`;
  const critFlags = flags.filter(f => f.severity === 'CRITICAL').length;
  const highFlags = flags.filter(f => f.severity === 'HIGH').length;

  // Round-trip signal
  const isRoundTrip = totalDR > 0 && totalCR > 0 &&
    Math.abs(totalDR - totalCR) / Math.max(totalDR, totalCR) < 0.05;

  let parts = [];
  parts.push(`${netStr} across ${activeMonths} active month${activeMonths !== 1 ? 's' : ''}`);
  parts.push(grossStr);
  if (isRoundTrip) parts.push('near-equal DR and CR suggests possible round-trip activity');
  if (manualPct > 20) parts.push(`${Math.round(manualPct)}% manual entries (above expected)`);
  if (critFlags > 0) parts.push(`${critFlags} critical period flag${critFlags !== 1 ? 's' : ''} require immediate investigation`);
  else if (highFlags > 0) parts.push(`${highFlags} high-severity period flag${highFlags !== 1 ? 's' : ''}`);
  if (txCount > 0) parts.push(`${txCount} transaction-level finding${txCount !== 1 ? 's' : ''} across applicable rules`);

  return parts.join(' · ') + '.';
}

// ── Chart 1: Net movement with anomaly markers ────────────────
function NetMovementChart({ monthly, flags, txFindings, glCode, granularity, filterMonth, cumulative, onMonthClick }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);

  // Compute flag lookup by month key
  const flagByMonth = useMemo(() => {
    const m = {};
    flags.forEach(f => (f.months || []).forEach(mk => {
      if (!m[mk] || f.severity === 'CRITICAL') m[mk] = f.severity;
    }));
    return m;
  }, [flags]);

  // Tx findings count by month
  const txByMonth = useMemo(() => {
    const m = {};
    txFindings.forEach(f => {
      if (!f.glDate) return;
      const d = f.glDate instanceof Date ? f.glDate : new Date(f.glDate);
      const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      m[mk] = (m[mk] || 0) + 1;
    });
    return m;
  }, [txFindings]);

  const buildData = useCallback(() => {
    const isDaily = granularity === 'daily';

    if (isDaily && filterMonth) {
      // Day-level: expand the selected month's rows into daily buckets
      const [yr, mo] = filterMonth.split('-').map(Number);
      const daysInMonth = new Date(yr, mo, 0).getDate();
      const labels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));
      const drDay = Array(daysInMonth).fill(0);
      const crDay = Array(daysInMonth).fill(0);
      const flagDay = Array(daysInMonth).fill(null);
      const txDay  = Array(daysInMonth).fill(0);

      // Find the matching month aggregate and walk its rows
      const mData = monthly.find(m => m.month === filterMonth);
      if (mData && mData.rows) {
        mData.rows.forEach(row => {
          // toDate handles both Excel serial numbers and string dates safely
          const d = toDate(row['GL DATE']);
          if (!d || isNaN(d.getTime())) return;
          const day = d.getDate() - 1;
          if (day < 0 || day >= daysInMonth) return;
          drDay[day] += parseFloat(row['ENTERED DR'] || 0);
          crDay[day] += parseFloat(row['ENTERED CR'] || 0);
        });
        // tx findings at day level
        txFindings.forEach(f => {
          if (!f.glDate) return;
          const d = f.glDate instanceof Date ? f.glDate : new Date(f.glDate);
          const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          if (mk === filterMonth) txDay[d.getDate() - 1]++;
        });
      }

      // Flag the last 7 days of month if period-end flag exists
      const monthFlag = flagByMonth[filterMonth];
      if (monthFlag) {
        for (let i = daysInMonth - 7; i < daysInMonth; i++) {
          if (i >= 0 && (drDay[i] > 0 || crDay[i] > 0)) flagDay[i] = monthFlag;
        }
      }

      const netDay = drDay.map((dr, i) => dr - crDay[i]);
      const display = cumulative
        ? netDay.reduce((acc, v, i) => { acc.push((acc[i - 1] || 0) + v); return acc; }, [])
        : netDay;

      return { labels, net: display, rawNet: netDay, flags: flagDay, txCounts: txDay, monthly: false };
    }

    // Monthly view
    const labels = monthly.map(m => m.month.slice(5)); // MM
    const netArr = monthly.map(m => m.netMovement);
    const display = cumulative
      ? netArr.reduce((acc, v, i) => { acc.push((acc[i - 1] || 0) + v); return acc; }, [])
      : netArr;
    const flagArr = monthly.map(m => flagByMonth[m.month] || null);
    const txArr   = monthly.map(m => txByMonth[m.month] || 0);

    return { labels, net: display, rawNet: netArr, flags: flagArr, txCounts: txArr, monthly: true };
  }, [granularity, filterMonth, monthly, flags, txByMonth, flagByMonth, cumulative]);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }

    const { labels, net, rawNet, flags: flagArr, txCounts } = buildData();
    const avg = rawNet.reduce((s, v) => s + Math.abs(v), 0) / (rawNet.filter(v => v !== 0).length || 1);

    // Point styles — anomalies get larger coloured markers
    const ptRadius = flagArr.map((f, i) => {
      if (f === 'CRITICAL') return 7;
      if (f === 'HIGH') return 6;
      if (txCounts[i] > 0) return 5;
      if (Math.abs(rawNet[i]) > avg * 2 && rawNet[i] !== 0) return 5;
      return rawNet[i] !== 0 ? 3 : 0;
    });
    const ptBg = flagArr.map((f, i) => {
      if (f === 'CRITICAL') return T.red;
      if (f === 'HIGH') return T.amber;
      if (txCounts[i] > 0) return T.blue;
      if (Math.abs(rawNet[i]) > avg * 2 && rawNet[i] !== 0) return T.purple;
      return net[i] >= 0 ? T.orange : T.green;
    });
    const ptBorder = ptBg;
    const barBg = flagArr.map((f, i) => {
      if (f === 'CRITICAL') return '#DC262620';
      if (f === 'HIGH') return '#D9770620';
      return net[i] >= 0 ? '#E8630A18' : '#05966918';
    });
    const barBorder = flagArr.map((f, i) => {
      if (f === 'CRITICAL') return T.red;
      if (f === 'HIGH') return T.amber;
      return net[i] >= 0 ? T.orange : T.green;
    });

    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            type: 'line',
            label: cumulative ? 'Cumulative net' : 'Net per period',
            data: net,
            borderColor: T.orange,
            borderWidth: 1.5,
            pointRadius: ptRadius,
            pointBackgroundColor: ptBg,
            pointBorderColor: ptBorder,
            pointBorderWidth: 2,
            tension: 0.3,
            fill: false,
            order: 1,
            z: 10,
          },
          {
            type: 'bar',
            label: 'Net (bar)',
            data: net,
            backgroundColor: barBg,
            borderColor: barBorder,
            borderWidth: net.map(v => v !== 0 ? 1 : 0),
            borderRadius: 2,
            order: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (_, elements) => {
          if (!elements.length) return;
          const idx = elements[0].index;
          const mk = granularity === 'daily' && filterMonth
            ? filterMonth
            : monthly[idx]?.month;
          if (mk && onMonthClick) onMonthClick(mk);
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => {
                const i = ctx.dataIndex;
                const f = flagArr[i];
                const tx = txCounts[i];
                let s = `${cumulative ? 'Cumulative' : 'Net'}: ${Math.round(ctx.raw).toLocaleString()} BHD`;
                if (f === 'CRITICAL') s += ' — ⚠ CRITICAL flag';
                else if (f === 'HIGH') s += ' — ⚑ HIGH flag';
                if (tx > 0) s += ` · ${tx} tx finding${tx !== 1 ? 's' : ''}`;
                return s;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              font: { size: 9 }, color: '#9CA3AF',
              maxRotation: granularity === 'daily' ? 45 : 0,
              autoSkip: true, maxTicksLimit: granularity === 'daily' ? 16 : 12,
            },
          },
          y: {
            grid: { color: 'rgba(0,0,0,0.04)' },
            ticks: { font: { size: 9 }, color: '#9CA3AF', callback: v => fmtK(v) },
            title: {
              display: true,
              text: cumulative ? 'Running balance (BHD)' : 'Net BHD',
              font: { size: 9 }, color: '#9CA3AF',
            },
          },
        },
      },
    });

    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [buildData, cumulative, granularity]);

  return <canvas ref={canvasRef} role="img" aria-label="Net movement trend chart with anomaly markers">Net movement chart</canvas>;
}

// ── Chart 2: DR vs CR grouped bars ───────────────────────────
function DrCrChart({ monthly, flags, txFindings, granularity, filterMonth, showAnnotations, onMonthClick }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);

  const flagByMonth = useMemo(() => {
    const m = {};
    flags.forEach(f => (f.months || []).forEach(mk => {
      if (!m[mk] || f.severity === 'CRITICAL') m[mk] = f.severity;
    }));
    return m;
  }, [flags]);

  const txByMonth = useMemo(() => {
    const m = {};
    txFindings.forEach(f => {
      if (!f.glDate) return;
      const d = f.glDate instanceof Date ? f.glDate : new Date(f.glDate);
      const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      m[mk] = (m[mk] || 0) + 1;
    });
    return m;
  }, [txFindings]);

  const buildData = useCallback(() => {
    const isDaily = granularity === 'daily';
    if (isDaily && filterMonth) {
      const [yr, mo] = filterMonth.split('-').map(Number);
      const daysInMonth = new Date(yr, mo, 0).getDate();
      const labels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));
      const drDay = Array(daysInMonth).fill(0);
      const crDay = Array(daysInMonth).fill(0);
      const flagDay = Array(daysInMonth).fill(null);
      const txDay  = Array(daysInMonth).fill(0);
      const mData = monthly.find(m => m.month === filterMonth);
      if (mData?.rows) {
        mData.rows.forEach(row => {
          const d = toDate(row['GL DATE']);
          if (!d || isNaN(d.getTime())) return;
          const day = d.getDate() - 1;
          if (day < 0 || day >= daysInMonth) return;
          drDay[day] += parseFloat(row['ENTERED DR'] || 0);
          crDay[day] += parseFloat(row['ENTERED CR'] || 0);
        });
        txFindings.forEach(f => {
          if (!f.glDate) return;
          const d = f.glDate instanceof Date ? f.glDate : new Date(f.glDate);
          const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          if (mk === filterMonth) txDay[d.getDate() - 1]++;
        });
      }
      const monthFlag = flagByMonth[filterMonth];
      if (monthFlag) {
        for (let i = daysInMonth - 7; i < daysInMonth; i++) {
          if (i >= 0 && (drDay[i] > 0 || crDay[i] > 0)) flagDay[i] = monthFlag;
        }
      }
      return { labels, dr: drDay, cr: crDay, flagArr: flagDay, txCounts: txDay };
    }
    return {
      labels: monthly.map(m => m.month.slice(5)),
      dr: monthly.map(m => m.totalDR),
      cr: monthly.map(m => m.totalCR),
      flagArr: monthly.map(m => flagByMonth[m.month] || null),
      txCounts: monthly.map(m => txByMonth[m.month] || 0),
    };
  }, [granularity, filterMonth, monthly, flagByMonth, txByMonth, txFindings]);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
    const { labels, dr, cr, flagArr, txCounts } = buildData();

    const drBg = dr.map((_, i) => {
      if (showAnnotations && flagArr[i] === 'CRITICAL') return '#DC262655';
      if (showAnnotations && flagArr[i] === 'HIGH') return '#D9770655';
      return '#2563EB88';
    });
    const crBg = cr.map((_, i) => {
      if (showAnnotations && flagArr[i] === 'CRITICAL') return '#DC262633';
      if (showAnnotations && flagArr[i] === 'HIGH') return '#D9770633';
      return '#05966988';
    });

    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'DR', data: dr, backgroundColor: drBg, borderRadius: 2, borderSkipped: false },
          { label: 'CR', data: cr, backgroundColor: crBg, borderRadius: 2, borderSkipped: false },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (_, elements) => {
          if (!elements.length) return;
          const idx = elements[0].index;
          const mk = granularity === 'daily' && filterMonth
            ? filterMonth
            : monthly[idx]?.month;
          if (mk && onMonthClick) onMonthClick(mk);
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              afterBody: (items) => {
                if (!items.length) return [];
                const i = items[0].dataIndex;
                const f = flagArr[i];
                const tx = txCounts[i];
                const isRT = dr[i] > 0 && cr[i] > 0 && Math.abs(dr[i] - cr[i]) / Math.max(dr[i], cr[i]) < 0.05;
                const lines = [];
                if (showAnnotations && f === 'CRITICAL') lines.push('⚠ CRITICAL period flag');
                else if (showAnnotations && f === 'HIGH')  lines.push('⚑ HIGH period flag');
                if (showAnnotations && isRT) lines.push('⟳ Near round-trip (DR ≈ CR)');
                if (tx > 0) lines.push(`● ${tx} tx finding${tx !== 1 ? 's' : ''}`);
                return lines;
              },
              label: ctx => `${ctx.dataset.label}: ${Math.round(ctx.raw).toLocaleString()} BHD`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              font: { size: 9 }, color: '#9CA3AF',
              maxRotation: granularity === 'daily' ? 45 : 0,
              autoSkip: true, maxTicksLimit: granularity === 'daily' ? 16 : 12,
            },
          },
          y: {
            grid: { color: 'rgba(0,0,0,0.04)' },
            ticks: { font: { size: 9 }, color: '#9CA3AF', callback: v => fmtK(v) },
          },
        },
      },
    });

    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [buildData, showAnnotations]);

  return <canvas ref={canvasRef} role="img" aria-label="DR vs CR grouped bar chart">DR vs CR chart</canvas>;
}

// ── Legend dot ────────────────────────────────────────────────
const LDot = ({ color, border, label }) => (
  <span style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color: T.sub, fontFamily:'var(--fb)' }}>
    <span style={{ width:9, height:9, borderRadius:'50%', background: color || 'transparent', border: border ? `2px solid ${border}` : 'none', display:'inline-block', flexShrink:0 }}/>
    {label}
  </span>
);
const LSq = ({ color, label }) => (
  <span style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color: T.sub, fontFamily:'var(--fb)' }}>
    <span style={{ width:9, height:9, borderRadius:2, background: color, display:'inline-block', flexShrink:0 }}/>
    {label}
  </span>
);

// ── Main export ───────────────────────────────────────────────
export default function AccountCharts({
  monthly, flags, txFindings, glCode,
  totalDR, totalCR, totalRows, meta, activeMonths,
  onMonthClick,
}) {
  const [gran,         setGran]    = useState('monthly');
  const [gran2,        setGran2]   = useState('monthly');
  const [cumulative,   setCumul]   = useState(false);
  const [showAnn,      setShowAnn] = useState(true);
  const [filterMonth,  setFMonth]  = useState(null);

  // When granularity switches to daily, default to first active month
  useEffect(() => {
    if (gran === 'daily') {
      const first = monthly.find(m => m.rowCount > 0);
      setFMonth(first?.month || null);
    } else {
      setFMonth(null);
    }
  }, [gran, monthly]);

  // Months that have data — for the month selector
  const activeMonthList = useMemo(() => monthly.filter(m => m.rowCount > 0), [monthly]);

  // KPI computations
  const net = totalDR - totalCR;
  const manualRows = useMemo(() => monthly.reduce((s, m) => s + m.manualCount, 0), [monthly]);
  const manualPct  = totalRows > 0 ? (manualRows / totalRows) * 100 : 0;
  const acctTxCount = useMemo(() => {
    if (!glCode) return 0;
    return txFindings.filter(f => String(f.glCode) === String(glCode) || f.glCode === 'MULTIPLE').length;
  }, [txFindings, glCode]);

  const narrative = buildNarrative({ totalDR, totalCR, totalRows, activeMonths, meta, flags, txCount: acctTxCount, manualPct });

  const kpiStyle = {
    background: '#F8F9FA',
    borderRadius: 8,
    padding: '11px 14px',
  };
  const kpiLabel = { fontSize: 10, color: T.sub, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, fontFamily: 'var(--fb)' };
  const kpiVal = { fontSize: 20, fontWeight: 500, fontFamily: 'var(--fm)', lineHeight: 1 };
  const kpiSub = { fontSize: 10, color: T.dim, marginTop: 3, fontFamily: 'var(--fb)' };

  const cardStyle = {
    background: T.card,
    border: `0.5px solid ${T.border}`,
    borderRadius: 12,
    padding: '13px 16px',
  };
  const ctrlRowStyle = {
    display: 'flex', alignItems: 'center', gap: 8,
    marginBottom: 10, flexWrap: 'wrap',
  };
  const divider = <span style={{ fontSize: 12, color: T.border, userSelect: 'none' }}>|</span>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* ── KPI boxes ─────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
        <div style={kpiStyle}>
          <div style={kpiLabel}>Total DR</div>
          <div style={{ ...kpiVal, color: T.blue }}>{fmtK(totalDR)}</div>
          <div style={kpiSub}>BHD debits</div>
        </div>
        <div style={kpiStyle}>
          <div style={kpiLabel}>Total CR</div>
          <div style={{ ...kpiVal, color: T.green }}>{fmtK(totalCR)}</div>
          <div style={kpiSub}>BHD credits</div>
        </div>
        <div style={kpiStyle}>
          <div style={kpiLabel}>Net total</div>
          <div style={{ ...kpiVal, color: net >= 0 ? T.orange : T.green }}>
            {net >= 0 ? '+' : ''}{fmtK(net)}
          </div>
          <div style={kpiSub}>{net >= 0 ? 'net debit' : 'net credit'} position</div>
        </div>
        <div style={kpiStyle}>
          <div style={kpiLabel}>Manual share</div>
          <div style={{ ...kpiVal, color: manualPct > 20 ? T.amber : T.sub }}>
            {Math.round(manualPct)}%
          </div>
          <div style={kpiSub}>{manualRows} of {totalRows} entries</div>
        </div>
      </div>

      {/* ── Narrative ─────────────────────────────────────── */}
      <div style={{
        background: '#F8F9FA',
        borderLeft: `3px solid ${flags.some(f => f.severity === 'CRITICAL') ? T.red : flags.length > 0 ? T.amber : T.sub}`,
        borderRadius: '0 8px 8px 0',
        padding: '9px 14px',
        fontSize: 12,
        color: T.sub,
        lineHeight: 1.6,
        fontFamily: 'var(--fb)',
      }}>
        {narrative}
      </div>

      {/* ── Charts: side by side ──────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

        {/* Chart 1: Net movement */}
        <div style={cardStyle}>
          <div style={ctrlRowStyle}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: T.text, fontFamily: 'var(--fb)' }}>
                Net movement {cumulative ? '— cumulative' : '— per period'}
              </div>
              <div style={{ fontSize: 10, color: T.dim, marginTop: 2, fontFamily: 'var(--fb)' }}>
                Red=critical · Amber=high · Blue=tx · Purple=unusual
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
            <Ctrl label="Monthly" active={gran === 'monthly'} onClick={() => setGran('monthly')} />
            <Ctrl label="Daily"   active={gran === 'daily'}   onClick={() => setGran('daily')} />
            {divider}
            <Ctrl label="Cumulative" active={cumulative} onClick={() => setCumul(c => !c)} variant="blue" />
            {gran === 'daily' && activeMonthList.length > 0 && <>
              {divider}
              <select
                value={filterMonth || ''}
                onChange={e => setFMonth(e.target.value || null)}
                style={{
                  fontSize: 11, padding: '3px 8px',
                  borderRadius: 8, border: `0.5px solid ${T.borderHi}`,
                  background: '#F8F9FA', color: T.text,
                  fontFamily: 'var(--fb)', cursor: 'pointer',
                }}
              >
                {activeMonthList.map(m => (
                  <option key={m.month} value={m.month}>{m.month}</option>
                ))}
              </select>
            </>}
          </div>
          <div style={{ position: 'relative', width: '100%', height: 160 }}>
            <NetMovementChart
              monthly={monthly} flags={flags} txFindings={txFindings}
              glCode={glCode} granularity={gran} filterMonth={filterMonth}
              cumulative={cumulative} onMonthClick={onMonthClick}
            />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
            <LDot color={T.orange} label="Net debit" />
            <LDot color={T.green}  label="Net credit" />
            <LDot color={T.red}    label="CRIT" />
            <LDot color={T.amber}  label="HIGH" />
            <LDot color={T.blue}   label="Tx" />
          </div>
        </div>

        {/* Chart 2: DR vs CR */}
        <div style={cardStyle}>
          <div style={ctrlRowStyle}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: T.text, fontFamily: 'var(--fb)' }}>
                DR vs CR — gross activity
              </div>
              <div style={{ fontSize: 10, color: T.dim, marginTop: 2, fontFamily: 'var(--fb)' }}>
                Near-equal DR ≈ CR = possible round-trip
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
            <Ctrl label="Monthly" active={gran2 === 'monthly'} onClick={() => setGran2('monthly')} />
            <Ctrl label="Daily"   active={gran2 === 'daily'}   onClick={() => setGran2('daily')} />
            {divider}
            <Ctrl label={showAnn ? 'Anomalies on' : 'Anomalies off'} active={showAnn}
                  onClick={() => setShowAnn(a => !a)} variant={showAnn ? 'red' : 'orange'} />
          </div>
          <div style={{ position: 'relative', width: '100%', height: 160 }}>
            <DrCrChart
              monthly={monthly} flags={flags} txFindings={txFindings}
              granularity={gran2} filterMonth={gran2 === 'daily' ? filterMonth : null}
              showAnnotations={showAnn} onMonthClick={onMonthClick}
            />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
            <LSq color="#2563EB88" label="DR" />
            <LSq color="#05966988" label="CR" />
            <LDot color={T.red}   label="CRIT flag" />
            <LDot color={T.amber} label="HIGH flag" />
          </div>
        </div>

      </div>

    </div>
  );
}
