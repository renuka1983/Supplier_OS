import { useEffect, useState } from "react";
import { api } from "../utils/api";
import { PageHeader, ScrollBody, Card, CardTitle, Spinner, Badge } from "../components/ui";
import type { Module } from "../types";

// ─── MODULES PAGE ──────────────────────────────────────────────────────────
export function Modules() {
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (api.modules() as Promise<Module[]>).then(setModules).finally(() => setLoading(false));
  }, []);

  const commercial = modules.filter(m => m.category === "Commercial");
  const operations  = modules.filter(m => m.category === "Operations");

  const statusStyle = (status: string) => {
    if (status === "connected") return { color: "var(--bluelight)", bg: "var(--bluedim)" };
    if (status === "active")    return { color: "var(--green)",     bg: "var(--greendim)" };
    if (status === "warning")   return { color: "var(--amber)",     bg: "var(--amberdim)" };
    return { color: "var(--text3)", bg: "rgba(255,255,255,.04)" };
  };

  const iconBg: Record<string, string> = {
    blue: "var(--bluedim)", teal: "var(--tealdim)", purple: "var(--purpledim)",
    amber: "var(--amberdim)", red: "var(--reddim)",
  };

  const ModuleCard = ({ mod }: { mod: Module }) => {
    const st = statusStyle(mod.status);
    return (
      <div
        style={{
          background: "var(--card)", border: "1px solid var(--border)",
          borderRadius: 12, padding: 18, cursor: "pointer",
          transition: "all .15s", display: "flex", flexDirection: "column",
        }}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = "var(--bordermd)";
          e.currentTarget.style.background = "var(--cardhover)";
          e.currentTarget.style.transform = "translateY(-1px)";
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = "var(--border)";
          e.currentTarget.style.background = "var(--card)";
          e.currentTarget.style.transform = "";
        }}
      >
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: iconBg[mod.color] || "var(--bluedim)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18, marginBottom: 12,
        }}>
          {mod.icon}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>{mod.name}</div>
        <div style={{ fontSize: 11, color: "var(--text2)", lineHeight: 1.55, flex: 1 }}>
          {getDesc(mod.id)}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
          <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 10, color: st.color, background: st.bg }}>
            {mod.status_label}
          </span>
          <span style={{ fontSize: 10, color: "var(--text3)" }}>{mod.detail}</span>
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <PageHeader
        title="Platform Modules"
        subtitle="All commercial workflows in one unified operating system"
        right={
          <span style={{ fontSize: 11, color: "var(--green)", background: "var(--greendim)", border: "1px solid rgba(34,197,94,.2)", padding: "5px 12px", borderRadius: 6 }}>
            ✓ {modules.length}/{modules.length} modules active
          </span>
        }
      />
      <ScrollBody>
        {loading ? <Spinner /> : (
          <>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text3)", marginBottom: 10 }}>Core Commercial & Growth</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12 }}>
                {commercial.map(m => <ModuleCard key={m.id} mod={m} />)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text3)", marginBottom: 10 }}>Product & Operations</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12 }}>
                {operations.map(m => <ModuleCard key={m.id} mod={m} />)}
              </div>
            </div>

            {/* AI Layer */}
            <div style={{
              background: "linear-gradient(135deg,rgba(15,30,70,.8),rgba(10,20,50,.5))",
              border: "1px solid rgba(59,130,246,.25)", borderRadius: 16,
              padding: "20px 24px", display: "flex", alignItems: "center", gap: 20,
            }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: "linear-gradient(135deg,#1e3a8a,#1d4ed8)", border: "1px solid rgba(59,130,246,.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>✦</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>AI Intelligence Layer — Always On</div>
                <div style={{ fontSize: 12, color: "var(--text2)", lineHeight: 1.5 }}>
                  Connects every module to answer: <em style={{ color: "var(--bluelight)" }}>"What should we do next to drive revenue?"</em> — synthesizing all data sources into ranked, actionable decisions in real time.
                </div>
              </div>
              <div style={{ fontSize: 11, background: "var(--greendim)", color: "var(--green)", padding: "6px 14px", borderRadius: 20, fontWeight: 600, border: "1px solid rgba(34,197,94,.2)", whiteSpace: "nowrap" }}>● Running</div>
            </div>
          </>
        )}
      </ScrollBody>
    </div>
  );
}

function getDesc(id: string): string {
  const descs: Record<string, string> = {
    analytics: "SKU performance, inventory positions, velocity drivers, and category benchmarks across all retailer accounts.",
    pricing: "Monitor everyday and promotional pricing to stay competitive while protecting margin across all channels.",
    retailer_planning: "Build and manage Joint Business Plans including targets, features, innovation roadmaps, and merchant priorities.",
    trade_promos: "Plan and measure ROI on rollbacks, TPRs, and features. Incremental lift analysis with pantry load adjustment.",
    deductions: "Manage chargebacks and disputes to recover lost revenue. Auto-build dispute packages from shortage claims.",
    crm: "Track all buyer interactions, call notes, and internal alignment. Buyer feedback auto-triggers SKU rationalization.",
    item_mgmt: "Maintain SKU data, lifecycle, and retailer-specific setup. Ensure new item dimensions match modular requirements.",
    retail_ops: "Monitor in-store execution and planogram compliance. Escalate endcap failures to market managers automatically.",
    warehouse: "Track inventory flow from DC to stores. Flag mismatch between DC inventory and store OOS signals in real time.",
  };
  return descs[id] || "Module connected and operational.";
}

// ─── IMPACT PAGE ───────────────────────────────────────────────────────────
export function Impact() {
  const phases = [
    {
      num: "Phase 1 — Now", name: "Insight Engine",
      color: "var(--bluelight)", border: "rgba(59,130,246,.3)",
      bg: "linear-gradient(135deg,rgba(59,130,246,.06),transparent)",
      desc: "Everything demonstrated today. Unified data ingestion, AI opportunity identification, prioritized action recommendations.",
      features: ["Unified data command center", "AI-ranked revenue opportunities", "Real-time alerts & monitoring", "AI Co-Pilot (conversational)"],
      status: "● Live in demo today", statusColor: "var(--bluelight)",
    },
    {
      num: "Phase 2 — Q3 2025", name: "Decision Simulation",
      color: "var(--amber)", border: "var(--border)",
      bg: "var(--card)",
      desc: "Interactive scenario modeling — stress-test decisions before committing budget or buyer conversations.",
      features: ["What-if revenue scenario modeling", "Promotional mix optimizer", "Assortment & innovation planning", "Quantified impact scoring"],
      status: "◌ In development", statusColor: "var(--amber)",
    },
    {
      num: "Phase 3 — Q1 2026", name: "Execution Automation",
      color: "var(--text3)", border: "var(--border)",
      bg: "var(--card)",
      desc: "Close the loop from insight to execution — AI-driven forecasting, supply signals, and direct system integrations.",
      features: ["AI demand forecasting & replenishment", "Automatic supply chain signals", "ERP & planning system integration", "Closed-loop insight → action → outcome"],
      status: "○ Planned", statusColor: "var(--text3)",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <PageHeader title="Business Impact" subtitle="What SupplierOS delivers to your bottom line" />
      <ScrollBody>
        {/* Hero */}
        <div style={{ background: "linear-gradient(135deg,#0f1e3d,#0a1628)", border: "1px solid rgba(59,130,246,.2)", borderRadius: 16, padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.5, color: "var(--text)", marginBottom: 8 }}>
            From reactive selling to AI-driven growth — permanently
          </div>
          <div style={{ fontSize: 14, color: "var(--text2)" }}>
            SupplierOS moves supplier commercial teams from manual analysis to proactive, revenue-compounding decisions
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginTop: 24 }}>
            {[
              { num: "$XM", label: "Identified opportunity per brand within first 30 days" },
              { num: "5×", label: "Faster decisions — question to action in minutes" },
              { num: "100%", label: "Data coverage — every retailer, every SKU, every signal" },
              { num: "1", label: "Unified platform replacing fragmented Excel & BI tools" },
            ].map(s => (
              <div key={s.num} style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: 20, textAlign: "center" }}>
                <div style={{ fontSize: 36, fontWeight: 700, color: "var(--bluelight)", letterSpacing: -1 }}>{s.num}</div>
                <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 6, lineHeight: 1.4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Before / After */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Card>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--red)", marginBottom: 14 }}>Before SupplierOS</div>
            {["Data scattered across retailer portals, Excel exports, and syndicated PDFs",
              "Static dashboards that explain what happened — not what to do",
              "Analysts spend weeks building reports that are stale on arrival",
              "Gut decisions at the buyer table with no data confidence",
              "Siloed workflows — sales, trade, supply, and finance misaligned",
              "Missed OOS events and distribution gaps cost weeks of lost revenue"].map((item, i) => (
              <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, color: "var(--text2)", marginBottom: 8, lineHeight: 1.5 }}>
                <span style={{ color: "var(--red)", flexShrink: 0 }}>✕</span> {item}
              </div>
            ))}
          </Card>
          <div style={{ background: "linear-gradient(135deg,rgba(59,130,246,.06),rgba(59,130,246,.02))", border: "1px solid rgba(59,130,246,.2)", borderRadius: 12, padding: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--bluelight)", marginBottom: 14 }}>After SupplierOS</div>
            {["One unified command center ingesting all data sources in real time",
              "AI prescribes ranked, executable actions — not just charts",
              "Opportunities surface automatically — no analyst required",
              "Every buyer conversation backed by AI-generated insights",
              "Cross-functional teams operating from a single source of truth",
              "Continuous monitoring catches OOS and share drops in hours"].map((item, i) => (
              <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, color: "var(--text2)", marginBottom: 8, lineHeight: 1.5 }}>
                <span style={{ color: "var(--green)", flexShrink: 0 }}>✓</span> {item}
              </div>
            ))}
          </div>
        </div>

        {/* Roadmap */}
        <Card>
          <CardTitle>Product Roadmap — Three-Phase Journey</CardTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
            {phases.map(p => (
              <div key={p.num} style={{ background: p.bg, border: `1px solid ${p.border}`, borderRadius: 10, padding: 18 }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: p.color, marginBottom: 8 }}>{p.num}</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: "var(--text2)", lineHeight: 1.6, marginBottom: 14 }}>{p.desc}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {p.features.map(f => (
                    <div key={f} style={{ fontSize: 11, color: "var(--text2)", display: "flex", gap: 6 }}>
                      <span style={{ color: "var(--text3)", flexShrink: 0 }}>→</span> {f}
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: p.statusColor, marginTop: 16 }}>{p.status}</div>
              </div>
            ))}
          </div>
        </Card>
      </ScrollBody>
    </div>
  );
}
