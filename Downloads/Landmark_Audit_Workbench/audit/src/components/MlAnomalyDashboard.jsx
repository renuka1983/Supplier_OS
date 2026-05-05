/**
 * ML anomaly analytics: ensemble summary, charts, and explainability grid.
 * Expects anomaly API payload; shows empty state when offline.
 */
import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
import { ANOMALY_MODEL_OPTIONS } from '../constants';
import { fmtNum, f, toNum } from '../utils/helpers';

const MODEL_ID_ORDER = ANOMALY_MODEL_OPTIONS.map((m) => m.id);

Chart.register(...registerables);

const T = {
  card: '#FFFFFF',
  mid: '#EDE8E1',
  border: 'rgba(0,0,0,0.08)',
  text: '#111827',
  sub: '#6B7280',
  orange: '#E8630A',
  teal: '#0D9488',
  blue: '#2563EB',
  red: '#DC2626',
  sm: '0 1px 3px rgba(0,0,0,0.08)',
};

function histogramBins(values, binCount = 16) {
  if (!values.length) return { labels: [], counts: [] };
  // Avoid spreading very large arrays into Math.min/Math.max (can overflow call stack).
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (hi - lo < 1e-9) return { labels: [`${lo.toFixed(3)}`], counts: [values.length] };
  const w = (hi - lo) / binCount;
  const counts = Array(binCount).fill(0);
  for (const v of values) {
    let i = Math.floor((v - lo) / w);
    if (i >= binCount) i = binCount - 1;
    if (i < 0) i = 0;
    counts[i]++;
  }
  const labels = counts.map((_, i) => (lo + (i + 0.5) * w).toFixed(2));
  return { labels, counts };
}

export default function MlAnomalyDashboard({ anomalyResult, allRows }) {
  const [sortKey, setSortKey] = useState('ensemble_score');
  const [sortDir, setSortKeyDir] = useState('desc');
  const histRef = useRef(null);
  const voteRef = useRef(null);
  const chartInst = useRef({ h: null, v: null });

  const tx = anomalyResult?.transactions;
  const summary = anomalyResult?.summary;

  const joined = useMemo(() => {
    if (!tx?.length) return [];
    if (tx.length === allRows?.length) {
      return tx.map((a, i) => ({ a, row: allRows[i] }));
    }
    return tx.map((a) => ({ a, row: null }));
  }, [tx, allRows]);

  const kpis = useMemo(() => {
    if (!tx?.length) return null;
    const anom = tx.filter((t) => t.is_anomaly);
    const hybrid = anom.filter((t) => t.detection_type === 'hybrid').length;
    const genOnly = anom.filter((t) => t.detection_type === 'generic_only').length;
    const expertOnly = anom.filter((t) => t.detection_type === 'expert_only').length;
    return {
      total: tx.length,
      flagged: anom.length,
      rate: anom.length / tx.length,
      hybrid,
      genOnly,
      expertOnly,
    };
  }, [tx]);

  const topAccounts = useMemo(() => {
    const m = new Map();
    for (const { a, row } of joined) {
      if (!a.is_anomaly) continue;
      const code = row ? f.glCode(row) : null;
      const k = code != null ? String(code) : '—';
      m.set(k, (m.get(k) || 0) + 1);
    }
    return [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 15);
  }, [joined]);

  const topUsers = useMemo(() => {
    const m = new Map();
    for (const { a, row } of joined) {
      if (!a.is_anomaly) continue;
      const u = row ? f.user(row) : '—';
      m.set(u || '—', (m.get(u || '—') || 0) + 1);
    }
    return [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 15);
  }, [joined]);

  const modelVoteTotals = useMemo(() => {
    const mv0 = tx?.length ? tx[0].model_votes || {} : {};
    const keys = tx?.length && Object.keys(mv0).length ? MODEL_ID_ORDER.filter((k) => k in mv0) : MODEL_ID_ORDER.slice();
    const out = Object.fromEntries(keys.map((k) => [k, 0]));
    if (!tx) return out;
    for (const t of tx) {
      if (!t.is_anomaly) continue;
      const mv = t.model_votes || {};
      for (const k of keys) {
        if (mv[k]) out[k]++;
      }
    }
    return out;
  }, [tx]);

  const sortedTable = useMemo(() => {
    if (!joined.length) return [];
    const rows = joined.filter(({ a }) => a.is_anomaly).slice();
    const dir = sortDir === 'asc' ? 1 : -1;
    rows.sort((x, y) => {
      if (sortKey === 'ensemble_score') return dir * (x.a.ensemble_score - y.a.ensemble_score);
      if (sortKey === 'gl') {
        const gx = x.row ? f.glCode(x.row) ?? 0 : 0;
        const gy = y.row ? f.glCode(y.row) ?? 0 : 0;
        return dir * (gx - gy);
      }
      if (sortKey === 'amt') {
        const ax = x.row ? (Math.abs(toNum(x.row['NET AMOUNT'])) || Math.max(toNum(x.row['ENTERED DR']), toNum(x.row['ENTERED CR']))) : 0;
        const ay = y.row ? (Math.abs(toNum(y.row['NET AMOUNT'])) || Math.max(toNum(y.row['ENTERED DR']), toNum(y.row['ENTERED CR']))) : 0;
        return dir * (ax - ay);
      }
      return 0;
    });
    return rows.slice(0, 80);
  }, [joined, sortKey, sortDir]);

  const onSort = useCallback((k) => {
    setSortKey((prev) => {
      if (prev === k) {
        setSortKeyDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prev;
      }
      setSortKeyDir('desc');
      return k;
    });
  }, []);

  useEffect(() => {
    if (!tx?.length) return;
    const scores = tx.map((t) => t.ensemble_score);
    const { labels, counts } = histogramBins(scores, 14);
    if (histRef.current) {
      chartInst.current.h?.destroy();
      chartInst.current.h = new Chart(histRef.current, {
        type: 'bar',
        data: {
          labels,
          datasets: [{ label: 'Rows', data: counts, backgroundColor: T.orange + '99' }],
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false }, title: { display: true, text: 'Ensemble score distribution (all scored rows)' } },
          scales: { x: { ticks: { maxRotation: 45 } } },
        },
      });
    }
    const vk = Object.keys(modelVoteTotals);
    const vv = vk.map((k) => modelVoteTotals[k]);
    if (voteRef.current) {
      chartInst.current.v?.destroy();
      chartInst.current.v = new Chart(voteRef.current, {
        type: 'bar',
        data: {
          labels: vk.map((k) => k.replace(/_/g, ' ')),
          datasets: [{ label: 'Anomaly rows with model vote', data: vv, backgroundColor: T.teal + 'aa' }],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          plugins: {
            title: {
              display: true,
              text: 'Model votes among flagged anomalies (KNN distance = unsupervised k-NN)',
            },
          },
        },
      });
    }
    return () => {
      chartInst.current.h?.destroy();
      chartInst.current.v?.destroy();
      chartInst.current = { h: null, v: null };
    };
  }, [tx, modelVoteTotals]);

  if (!tx?.length) {
    return (
      <div style={{ padding: 24, background: T.card, borderRadius: 12, border: `1px solid ${T.border}`, boxShadow: T.sm }}>
        <div style={{ fontWeight: 700, marginBottom: 8, color: T.text }}>ML anomalies</div>
        <div style={{ color: T.sub, fontSize: 13 }}>
          No ensemble scores available. Start the anomaly API (<code style={{ fontSize: 12 }}>docker compose up anomaly-api</code> or{' '}
          <code style={{ fontSize: 12 }}>uvicorn</code>) and re-run analysis. Rule-based findings still work without it.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 12, color: T.sub, lineHeight: 1.5 }}>
        {summary?.active_anomaly_models?.length ? (
          <>
            Active detectors: <b style={{ color: T.text }}>{summary.active_anomaly_models.map((k) => k.replace(/_/g, ' ')).join(', ')}</b>.{' '}
            {summary.ml_vote_rule_applies
              ? 'Weighted ensemble plus vote-count rule (three or more models).'
              : 'Weighted ensemble vs threshold only (one or two models — votes are informational).'}{' '}
          </>
        ) : (
          <>Full five-model ensemble (Isolation Forest, PCA, DBSCAN, LOF, KNN) with scores and vote rule. </>
        )}
        Critical rules can force a row into the anomaly set regardless of ML.
      </div>

      {kpis && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
          {[
            ['Scored rows', fmtNum(kpis.total)],
            ['Flagged', fmtNum(kpis.flagged)],
            ['Rate', `${(kpis.rate * 100).toFixed(1)}%`],
            ['Hybrid (rules + generic)', fmtNum(kpis.hybrid)],
            ['ML-only (generic_only)', fmtNum(kpis.genOnly)],
          ].map(([l, v]) => (
            <div key={l} style={{ background: T.card, borderRadius: 10, border: `1px solid ${T.border}`, padding: 12, boxShadow: T.sm }}>
              <div style={{ fontSize: 9, color: T.sub, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{l}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: T.text }}>{v}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={{ background: T.card, borderRadius: 12, border: `1px solid ${T.border}`, padding: 12, boxShadow: T.sm }}>
          <canvas ref={histRef} height={220} />
        </div>
        <div style={{ background: T.card, borderRadius: 12, border: `1px solid ${T.border}`, padding: 12, boxShadow: T.sm }}>
          <canvas ref={voteRef} height={220} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={{ background: T.card, borderRadius: 12, border: `1px solid ${T.border}`, padding: 14, boxShadow: T.sm }}>
          <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 13 }}>Top GL accounts (anomaly count)</div>
          <div style={{ fontSize: 12, color: T.sub, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {topAccounts.map(([code, n]) => (
              <div key={code} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{code}</span>
                <span style={{ fontWeight: 600 }}>{n}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ background: T.card, borderRadius: 12, border: `1px solid ${T.border}`, padding: 14, boxShadow: T.sm }}>
          <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 13 }}>Top users (anomaly count)</div>
          <div style={{ fontSize: 12, color: T.sub, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {topUsers.map(([u, n]) => (
              <div key={u} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u}</span>
                <span style={{ fontWeight: 600 }}>{n}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ background: T.card, borderRadius: 12, border: `1px solid ${T.border}`, padding: 14, boxShadow: T.sm, overflow: 'auto' }}>
        <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 13 }}>Flagged rows — explainability (click column to sort)</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: T.sub }}>
              {[
                ['gl', 'GL'],
                ['amt', 'Amount'],
                ['ensemble_score', 'Ensemble'],
                ['x', 'Type'],
                ['x', 'Votes'],
                ['x', 'Reasons'],
                ['x', 'Top drivers'],
              ].map(([k, lab]) => (
                <th key={lab + k} style={{ padding: '6px 8px', cursor: k !== 'x' ? 'pointer' : 'default' }} onClick={() => k !== 'x' && onSort(k)}>
                  {lab}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedTable.map(({ a, row }, idx) => {
              const amt = row
                ? Math.abs(toNum(row['NET AMOUNT'])) || Math.max(toNum(row['ENTERED DR']), toNum(row['ENTERED CR']))
                : null;
              const drivers = (a.top_generic_features || []).slice(0, 2).map((x) => `${x.feature} z=${x.z_score}`).join('; ');
              return (
                <tr key={idx} style={{ borderTop: `1px solid ${T.mid}` }}>
                  <td style={{ padding: '6px 8px' }}>{row ? f.glCode(row) : '—'}</td>
                  <td style={{ padding: '6px 8px' }}>{amt != null ? fmtNum(amt) : '—'}</td>
                  <td style={{ padding: '6px 8px' }}>{a.ensemble_score?.toFixed?.(3) ?? a.ensemble_score}</td>
                  <td style={{ padding: '6px 8px' }}>{a.detection_type}</td>
                  <td style={{ padding: '6px 8px' }}>{a.vote_count ?? '—'}</td>
                  <td style={{ padding: '6px 8px', maxWidth: 180 }}>{(a.reasons || []).join(', ')}</td>
                  <td style={{ padding: '6px 8px', maxWidth: 220 }}>{drivers}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {summary && (
          <div style={{ marginTop: 10, fontSize: 11, color: T.sub }}>
            feature_version {anomalyResult.feature_version} · model {anomalyResult.model_version} · threshold {summary.threshold} · votes needed{' '}
            {summary.vote_count_threshold}
          </div>
        )}
      </div>
    </div>
  );
}
