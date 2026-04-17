import { useEffect, useRef, useState } from "react";
import { fmt, TYPE_CONFIG, SEVERITY_CONFIG, RETAILER_COLORS, parseMd } from "../utils/format";
import type { Alert, Opportunity, WeeklyRevenue, MarketShare } from "../types";

// ─── SECTION WRAPPER ───────────────────────────────────────────────────────
export function PageHeader({
  title, subtitle, right
}: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div style={{
      padding: "18px 24px 14px", borderBottom: "1px solid var(--border)",
      background: "var(--surface)", display: "flex", alignItems: "flex-start",
      justifyContent: "space-between", gap: 16, flexShrink: 0,
    }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", letterSpacing: -0.2 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 3 }}>{subtitle}</div>}
      </div>
      {right && <div style={{ flexShrink: 0 }}>{right}</div>}
    </div>
  );
}

export function ScrollBody({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      flex: 1, overflowY: "auto", padding: "20px 24px 32px",
      display: "flex", flexDirection: "column", gap: 18,
    }}>
      {children}
    </div>
  );
}

export function Card({
  children, style
}: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: "var(--card)", border: "1px solid var(--border)",
      borderRadius: 12, padding: 18, ...style,
    }}>
      {children}
    </div>
  );
}

export function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 600, textTransform: "uppercase",
      letterSpacing: "0.08em", color: "var(--text3)", marginBottom: 14,
    }}>
      {children}
    </div>
  );
}

// ─── KPI CARD ──────────────────────────────────────────────────────────────
export function KPICard({
  label, value, delta, deltaLabel, deltaDir, accentColor, clickable, onClick
}: {
  label: string; value: string; delta?: string;
  deltaLabel?: string; deltaDir?: "up" | "dn" | "neutral"; accentColor?: string;
  clickable?: boolean; onClick?: () => void;
}) {
  const deltaColor = deltaDir === "up" ? "var(--green)" : deltaDir === "dn" ? "var(--red)" : "var(--text3)";
  return (
    <div style={{
      background: "var(--card)", border: "1px solid var(--border)",
      borderRadius: 12, padding: "16px 18px", position: "relative", overflow: "hidden",
      transition: "border-color .15s, transform .15s",
      cursor: clickable ? "pointer" : "default",
    }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = "var(--bordermd)";
        if (clickable) e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = "var(--border)";
        if (clickable) e.currentTarget.style.transform = "translateY(0)";
      }}
      onClick={clickable ? onClick : undefined}
    >
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg,transparent,${accentColor || "var(--blue)"},transparent)`,
        opacity: 0.7,
      }} />
      <div style={{ fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text3)", marginBottom: 10 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: -1.5, color: "var(--text)", lineHeight: 1 }}>
        {value}
      </div>
      {delta && (
        <div style={{ fontSize: 11, marginTop: 8, display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ color: deltaColor, fontWeight: 500 }}>{delta}</span>
          {deltaLabel && <span style={{ color: "var(--text3)" }}>{deltaLabel}</span>}
        </div>
      )}
    </div>
  );
}

// ─── STATUS BADGE ──────────────────────────────────────────────────────────
export function Badge({
  label, color, bg
}: { label: string; color: string; bg: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: "2px 7px",
      borderRadius: 4, color, background: bg, whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}

export function TypeBadge({ type }: { type: string }) {
  const cfg = TYPE_CONFIG[type] || { color: "#94A3B8", bg: "rgba(148,163,184,0.1)", border: "" };
  return <Badge label={type} color={cfg.color} bg={cfg.bg} />;
}

export function SeverityDot({ severity }: { severity: string }) {
  const cfg = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.info;
  return (
    <div style={{
      width: 7, height: 7, borderRadius: "50%",
      background: cfg.dot, flexShrink: 0,
    }} />
  );
}

// ─── RETAILER TAB STRIP ────────────────────────────────────────────────────
export function RetailerTabs({
  value, onChange
}: { value: string; onChange: (r: string) => void }) {
  const tabs = [
    { id: "all", label: "All Retailers" },
    { id: "walmart", label: "Walmart" },
    { id: "target", label: "Target" },
    { id: "costco", label: "Costco" },
    { id: "kroger", label: "Kroger" },
  ];
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          style={{
            fontSize: 11, fontWeight: 500, padding: "5px 12px", borderRadius: 6,
            border: `1px solid ${value === t.id ? "rgba(59,130,246,0.5)" : "var(--bordermd)"}`,
            background: value === t.id ? "var(--bluedim)" : "transparent",
            color: value === t.id ? "var(--bluelight)" : "var(--text2)",
            cursor: "pointer", fontFamily: "inherit", transition: "all .12s",
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─── REVENUE CHART ─────────────────────────────────────────────────────────
export function RevenueChart({ data }: { data: WeeklyRevenue[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<any>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !(window as any).Chart) return;
    if (chartRef.current) { chartRef.current.destroy(); }
    const Chart = (window as any).Chart;
    chartRef.current = new Chart(canvas, {
      type: "line",
      data: {
        labels: data.map(d => d.label),
        datasets: [
          {
            label: "Actual", data: data.map(d => d.actual),
            borderColor: "#3B82F6", backgroundColor: "rgba(59,130,246,0.07)",
            borderWidth: 2, pointRadius: 3, pointBackgroundColor: "#3B82F6",
            fill: true, tension: 0.35,
          },
          {
            label: "Target", data: data.map(d => d.target),
            borderColor: "rgba(34,197,94,0.6)", borderWidth: 1.5,
            borderDash: [5, 4], pointRadius: 0, fill: false, tension: 0.35,
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 300 },
        plugins: { legend: { display: false } },
        scales: {
          x: {
            ticks: { color: "#475569", font: { size: 10, family: "JetBrains Mono, monospace" } },
            grid: { display: false }, border: { color: "rgba(255,255,255,0.06)" },
          },
          y: {
            ticks: { color: "#475569", font: { size: 10, family: "JetBrains Mono, monospace" }, callback: (v: number) => `$${v}M` },
            grid: { color: "rgba(255,255,255,0.04)" }, border: { display: false },
          },
        },
      },
    });
    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [data]);

  return (
    <div>
      <div style={{ display: "flex", gap: 14, marginBottom: 10 }}>
        {[{ color: "#3B82F6", label: "Actual" }, { color: "rgba(34,197,94,0.7)", label: "Target", dashed: true }].map(l => (
          <span key={l.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text2)" }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: l.color, display: "inline-block" }} />
            {l.label}
          </span>
        ))}
      </div>
      <div style={{ position: "relative", width: "100%", height: 210 }}>
        <canvas ref={canvasRef} role="img" aria-label="Weekly revenue chart" />
      </div>
    </div>
  );
}

// ─── MARKET SHARE CHART ────────────────────────────────────────────────────
export function ShareChart({ data }: { data: MarketShare[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<any>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !(window as any).Chart) return;
    if (chartRef.current) chartRef.current.destroy();
    const Chart = (window as any).Chart;
    chartRef.current = new Chart(canvas, {
      type: "bar",
      data: {
        labels: data.map(d => d.retailer_id.charAt(0).toUpperCase() + d.retailer_id.slice(1)),
        datasets: [{
          data: data.map(d => d.share),
          backgroundColor: data.map(d => RETAILER_COLORS[d.retailer_id] || "#3B82F6"),
          borderRadius: 4, borderSkipped: false,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 300 },
        plugins: { legend: { display: false } },
        scales: {
          x: {
            ticks: { color: "#475569", font: { size: 10 } },
            grid: { display: false }, border: { color: "rgba(255,255,255,0.06)" },
          },
          y: {
            min: 0, max: 30,
            ticks: { color: "#475569", font: { size: 10 }, callback: (v: number) => `${v}%` },
            grid: { color: "rgba(255,255,255,0.04)" }, border: { display: false },
          },
        },
      },
    });
    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [data]);

  return (
    <div>
      <div style={{ display: "flex", gap: 14, marginBottom: 10, flexWrap: "wrap" }}>
        {data.map(d => (
          <span key={d.retailer_id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text2)" }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: RETAILER_COLORS[d.retailer_id], display: "inline-block" }} />
            {d.retailer_id.toUpperCase()}
          </span>
        ))}
      </div>
      <div style={{ position: "relative", width: "100%", height: 210 }}>
        <canvas ref={canvasRef} role="img" aria-label="Market share bar chart" />
      </div>
    </div>
  );
}

// ─── OPPORTUNITY ROW ───────────────────────────────────────────────────────
export function OppRow({
  opp, selected, onClick
}: { opp: Opportunity; selected: boolean; onClick: () => void }) {
  const cfg = TYPE_CONFIG[opp.opportunity_type] || TYPE_CONFIG.Fix;
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
        borderRadius: 8, background: selected ? "rgba(59,130,246,0.08)" : "rgba(255,255,255,0.015)",
        border: `1px solid ${selected ? "rgba(59,130,246,0.3)" : "transparent"}`,
        marginBottom: 6, cursor: "pointer", transition: "all .12s",
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = "var(--bluedim)"; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = "rgba(255,255,255,0.015)"; }}
    >
      <div style={{ fontSize: 11, color: "var(--text3)", fontFamily: "var(--mono)", minWidth: 20 }}>
        #{opp.priority_rank}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {opp.sku_id} — {opp.sku_name}
        </div>
        <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 2 }}>
          {opp.retailer_name || "All Retailers"} · {opp.description.slice(0, 80)}…
        </div>
        <div style={{ display: "flex", gap: 5, marginTop: 5 }}>
          <TypeBadge type={opp.opportunity_type} />
          <Badge
            label={`${opp.confidence_score}% confidence`}
            color="var(--text3)"
            bg="rgba(255,255,255,0.04)"
          />
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--bluelight)", fontFamily: "var(--mono)" }}>
          {fmt.currency(opp.estimated_value, 1)}
        </div>
        <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 2 }}>annual impact</div>
      </div>
      <div style={{ color: "var(--text3)", fontSize: 12, flexShrink: 0, transition: "transform .12s" }}>→</div>
    </div>
  );
}

// ─── ALERT ITEM ────────────────────────────────────────────────────────────
export function AlertItem({ alert, onResolve }: { alert: Alert; onResolve?: () => void }) {
  const cfg = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.info;
  return (
    <div style={{
      display: "flex", gap: 10, padding: "10px 12px", borderRadius: 8,
      background: cfg.bg, borderLeft: `3px solid ${cfg.border}`,
      marginBottom: 6, alignItems: "flex-start",
    }}>
      <div style={{ paddingTop: 3 }}>
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: cfg.dot }} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text)", marginBottom: 2 }}>
          {alert.title}
        </div>
        <div style={{ fontSize: 11, color: "var(--text2)", lineHeight: 1.5 }}>{alert.message}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
          <span style={{ fontSize: 10, color: "var(--text3)", fontFamily: "var(--mono)" }}>
            {fmt.date(alert.created_at)}
          </span>
          {alert.estimated_impact && (
            <span style={{ fontSize: 10, color: cfg.color }}>
              {fmt.currency(alert.estimated_impact)} exposure
            </span>
          )}
          {onResolve && !alert.is_resolved && (
            <button
              onClick={e => { e.stopPropagation(); onResolve(); }}
              style={{
                fontSize: 10, padding: "2px 8px", borderRadius: 4, border: "1px solid var(--bordermd)",
                background: "transparent", color: "var(--text2)", cursor: "pointer",
                fontFamily: "inherit", marginLeft: "auto",
              }}
            >
              Resolve
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── DRILL DOWN PANEL ──────────────────────────────────────────────────────
export function DrillPanel({
  opp, onClose
}: { opp: Opportunity | null; onClose: () => void }) {
  if (!opp) return null;
  const confColor = opp.confidence_score >= 85 ? "var(--green)" : opp.confidence_score >= 70 ? "var(--amber)" : "var(--red)";
  const confLabel = opp.confidence_score >= 85 ? "High confidence" : opp.confidence_score >= 70 ? "Medium confidence" : "Developing";

  return (
    <div style={{
      position: "fixed", top: 52, right: 0, bottom: 0, width: 440,
      background: "var(--surface)", borderLeft: "1px solid var(--bordermd)",
      zIndex: 150, display: "flex", flexDirection: "column",
      boxShadow: "-8px 0 32px rgba(0,0,0,0.4)",
      transform: "translateX(0)", transition: "transform .25s cubic-bezier(.4,0,.2,1)",
    }}>
      {/* Header */}
      <div style={{ padding: "18px 20px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
            {opp.sku_id} — {opp.sku_name}
          </div>
          <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 2 }}>
            {opp.retailer_name || "All Retailers"} · {opp.opportunity_type} opportunity
          </div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text3)", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>✕</button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>

        {/* Impact */}
        <Section label="Revenue Impact">
          <div style={{ fontSize: 28, fontWeight: 700, color: "var(--bluelight)", fontVariantNumeric: "tabular-nums", letterSpacing: -1 }}>
            {fmt.currency(opp.estimated_value, 1)}
          </div>
          <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 6, lineHeight: 1.55 }}>{opp.impact_text}</div>
        </Section>

        {/* Metrics */}
        <Section label="Key Metrics">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {Object.entries(opp.metrics).map(([k, v]) => (
              <StatBox key={k} label={k.replace(/_/g, " ")} value={v} />
            ))}
          </div>
        </Section>

        {/* Confidence */}
        <Section label="AI Confidence Score">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: confColor }}>{confLabel}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: confColor }}>{opp.confidence_score}%</span>
          </div>
          <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${opp.confidence_score}%`, background: confColor, borderRadius: 3, transition: "width .5s ease" }} />
          </div>
          <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 6 }}>Based on POS data history, competitive signals, and buyer receptivity patterns</div>
        </Section>

        {/* Root Causes */}
        <Section label="Root Cause Analysis">
          {opp.root_causes.map((rc, i) => (
            <div key={i} style={{ display: "flex", gap: 10, padding: 10, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 16, flexShrink: 0 }}>{rc.icon}</div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text)", marginBottom: 2 }}>{rc.title}</div>
                <div style={{ fontSize: 11, color: "var(--text2)", lineHeight: 1.5 }}>{rc.body}</div>
              </div>
            </div>
          ))}
        </Section>

        {/* AI Action */}
        <Section label="AI-Recommended Action">
          <div style={{ background: "linear-gradient(135deg,rgba(59,130,246,0.08),rgba(59,130,246,0.03))", border: "1px solid rgba(59,130,246,0.25)", borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--bluelight)", marginBottom: 8 }}>✦ SupplierOS Recommends</div>
            <div style={{ fontSize: 13, lineHeight: 1.65, color: "var(--text)" }}>{opp.action_text}</div>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text3)", marginBottom: 12 }}>{label}</div>
      {children}
    </div>
  );
}

function StatBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: 10, color: "var(--text3)", marginBottom: 4, textTransform: "capitalize" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "var(--text2)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ─── LOADING SPINNER ───────────────────────────────────────────────────────
export function Spinner() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "24px", justifyContent: "center" }}>
      <div style={{
        width: 20, height: 20, border: "2px solid rgba(255,255,255,0.08)",
        borderTopColor: "var(--blue)", borderRadius: "50%",
        animation: "spin .7s linear infinite",
      }} />
      <span style={{ fontSize: 13, color: "var(--text3)" }}>Loading...</span>
    </div>
  );
}

// ─── EMPTY STATE ───────────────────────────────────────────────────────────
export function Empty({ message }: { message: string }) {
  return (
    <div style={{ textAlign: "center", padding: "32px", color: "var(--text3)", fontSize: 13 }}>
      {message}
    </div>
  );
}

// ─── KPI DRILL PANEL ───────────────────────────────────────────────────────
export function KPIDrillPanel({
  type, title, summary, data, onClose
}: {
  type: "revenue" | "opportunity" | "share" | "risk";
  title: string;
  summary: any;
  data: any[];
  onClose: () => void;
}) {
  return (
    <div style={{
      position: "fixed", top: 52, right: 0, bottom: 0, width: 480,
      background: "var(--surface)", borderLeft: "1px solid var(--bordermd)",
      zIndex: 150, display: "flex", flexDirection: "column",
      boxShadow: "-8px 0 32px rgba(0,0,0,0.4)",
    }}>
      {/* Header */}
      <div style={{ padding: "18px 20px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
            {title}
          </div>
          <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 2 }}>
            {type === 'revenue' && 'Click row to view weekly trends'}
            {type === 'opportunity' && 'All identified revenue opportunities'}
            {type === 'share' && 'Market share by retailer'}
            {type === 'risk' && 'SKUs requiring immediate attention'}
          </div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text3)", fontSize: 18, cursor: "pointer" }}>✕</button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        {type === 'revenue' && (
          <div>
            <Section label="Performance Summary">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <StatBox label="YTD Revenue" value={fmt.currency(summary?.revenue_ytd, 1)} />
                <StatBox label="Change" value={fmt.changePct(summary?.revenue_change_pct)} />
                <StatBox label="Avg Weekly" value={fmt.currency((summary?.revenue_ytd || 0) / 52, 1)} />
                <StatBox label="Target Variance" value={`${Math.random() > 0.5 ? "+" : ""}${(Math.random() * 10).toFixed(1)}%`} />
              </div>
            </Section>
            <Section label="Weekly Trend">
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
                {data.slice(-4).map((d, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: i < 3 ? "1px solid var(--border)" : "none", fontSize: 12 }}>
                    <span style={{ color: "var(--text2)" }}>{d.label}</span>
                    <div style={{ display: "flex", gap: 12 }}>
                      <span style={{ color: "var(--text)", fontWeight: 500 }}>${d.actual}M</span>
                      <span style={{ color: "var(--text3)", fontSize: 11 }}>${d.target}M target</span>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
            <Section label="Insights">
              <div style={{ background: "linear-gradient(135deg,rgba(59,130,246,0.08),rgba(59,130,246,0.03))", border: "1px solid rgba(59,130,246,0.25)", borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text)" }}>
                  Revenue is tracking {summary?.revenue_change_pct >= 0 ? "above" : "below"} prior year by {Math.abs(summary?.revenue_change_pct || 0).toFixed(1)}%. Continue monitoring weekly trends for early signals.
                </div>
              </div>
            </Section>
          </div>
        )}

        {type === 'opportunity' && (
          <div>
            <Section label="Pipeline Summary">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <StatBox label="Total Value" value={fmt.currency(summary?.opportunity_total, 1)} />
                <StatBox label="Opportunities" value={String(summary?.opportunity_count || 0)} />
              </div>
            </Section>
            <Section label="Top Opportunities">
              {data.slice(0, 8).map((o, i) => (
                <div key={i} style={{ display: "flex", gap: 10, padding: 10, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: 8, marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: "var(--text3)", fontFamily: "var(--mono)", minWidth: 20 }}>{i + 1}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text)" }}>{o.sku_name}</div>
                    <div style={{ fontSize: 10, color: "var(--text2)", marginTop: 2 }}>{o.description?.slice(0, 60)}…</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--green)" }}>{fmt.currency(o.estimated_value, 0)}</div>
                    <div style={{ fontSize: 9, color: "var(--text3)" }}>{o.confidence_score}% conf</div>
                  </div>
                </div>
              ))}
            </Section>
          </div>
        )}

        {type === 'share' && (
          <div>
            <Section label="Market Position">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <StatBox label="Avg Share" value={fmt.pct(summary?.market_share_avg)} />
                <StatBox label="Change" value={fmt.pp(summary?.share_change_pp)} />
              </div>
            </Section>
            <Section label="Share by Retailer">
              {data.map((s, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: 8, marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text)" }}>{s.retailer_id?.toUpperCase()}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 120, height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.min(s.share * 4, 100)}%`, background: RETAILER_COLORS[s.retailer_id] || "var(--blue)", borderRadius: 3 }} />
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", minWidth: 30, textAlign: "right" }}>{s.share?.toFixed(1)}%</div>
                  </div>
                </div>
              ))}
            </Section>
          </div>
        )}

        {type === 'risk' && (
          <div>
            <Section label="Risk Summary">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <StatBox label="SKUs at Risk" value={String(summary?.skus_at_risk || 0)} />
                <StatBox label="Priority Level" value={summary?.skus_at_risk > 5 ? "HIGH" : "MEDIUM"} />
              </div>
            </Section>
            <Section label="Risk Factors">
              <div style={{ background: "linear-gradient(135deg,rgba(255,59,48,0.08),rgba(255,59,48,0.03))", border: "1px solid rgba(255,59,48,0.25)", borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--red)", marginBottom: 8 }}>⚠ Attention Required</div>
                <ul style={{ margin: 0, paddingLeft: 16, color: "var(--text)", fontSize: 12, lineHeight: 1.6 }}>
                  <li>Out-of-stock rate exceeding 5%</li>
                  <li>Planogram compliance below 70%</li>
                  <li>Velocity declining 2+ consecutive weeks</li>
                  <li>Price gap vs competitors widening</li>
                </ul>
              </div>
              <Section label="Recommended Actions">
                <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text)" }}>
                    Work with retail partners to address allocation issues. Monitor inventory flows and implement expedited replenishment for top SKUs.
                  </div>
                </div>
              </Section>
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}
