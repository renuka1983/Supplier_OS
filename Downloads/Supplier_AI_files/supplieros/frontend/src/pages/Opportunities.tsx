import { useEffect, useState, useRef } from "react";
import { api } from "../utils/api";
import { fmt, TYPE_CONFIG } from "../utils/format";
import {
  PageHeader, ScrollBody, Card, CardTitle, OppRow,
  DrillPanel, RetailerTabs, Spinner, TypeBadge,
} from "../components/ui";
import type { Opportunity, OpportunitySummary, RetailerFilter } from "../types";

export default function Opportunities() {
  const [retailer, setRetailer] = useState<RetailerFilter>("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [summary, setSummary] = useState<OpportunitySummary | null>(null);
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [loading, setLoading] = useState(true);

  // Donut chart ref
  const donutRef = useRef<HTMLCanvasElement>(null);
  const donutChart = useRef<any>(null);
  const barRef = useRef<HTMLCanvasElement>(null);
  const barChart = useRef<any>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.opportunities.list(retailer, typeFilter) as Promise<Opportunity[]>,
      api.opportunities.summary() as Promise<OpportunitySummary>,
    ]).then(([o, s]) => {
      setOpps(o);
      setSummary(s);
    }).finally(() => setLoading(false));
  }, [retailer, typeFilter]);

  // Build donut chart
  useEffect(() => {
    if (!donutRef.current || !(window as any).Chart || !summary) return;
    if (donutChart.current) donutChart.current.destroy();
    const Chart = (window as any).Chart;
    const types = summary.by_type || [];
    donutChart.current = new Chart(donutRef.current, {
      type: "doughnut",
      data: {
        labels: types.map(t => t.opportunity_type),
        datasets: [{
          data: types.map(t => t.total),
          backgroundColor: types.map(t => TYPE_CONFIG[t.opportunity_type]?.color || "#3B82F6"),
          borderWidth: 0, hoverOffset: 4,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 300 },
        plugins: {
          legend: { display: true, position: "right", labels: { color: "#94A3B8", font: { size: 11 }, padding: 12, boxWidth: 10, boxHeight: 10 } },
          tooltip: { callbacks: { label: (c: any) => ` ${fmt.currency(c.raw)}` } },
        },
        cutout: "60%",
      },
    });
    return () => { if (donutChart.current) donutChart.current.destroy(); };
  }, [summary]);

  // Build bar chart by retailer
  useEffect(() => {
    if (!barRef.current || !(window as any).Chart || !summary) return;
    if (barChart.current) barChart.current.destroy();
    const Chart = (window as any).Chart;
    const retailers = (summary.by_retailer || []).filter(r => r.retailer);
    const colors = { Walmart: "#3B82F6", Target: "#14B8A6", Costco: "#8B5CF6", Kroger: "#F59E0B" };
    barChart.current = new Chart(barRef.current, {
      type: "bar",
      data: {
        labels: retailers.map(r => r.retailer),
        datasets: [{
          data: retailers.map(r => r.total / 1e6),
          backgroundColor: retailers.map(r => (colors as any)[r.retailer] || "#3B82F6"),
          borderRadius: 4, borderSkipped: false, label: "Opportunity $M",
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 300 },
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: "#475569", font: { size: 10 } }, grid: { display: false }, border: { color: "rgba(255,255,255,0.06)" } },
          y: { ticks: { color: "#475569", font: { size: 10 }, callback: (v: number) => `$${v}M` }, grid: { color: "rgba(255,255,255,0.04)" }, border: { display: false } },
        },
      },
    });
    return () => { if (barChart.current) barChart.current.destroy(); };
  }, [summary]);

  const typeFilters = ["all", "Expand", "Fix", "Trade", "Sell-in"];

  return (
    <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <PageHeader
          title="Opportunity Intelligence"
          subtitle="All AI-ranked growth actions — prioritized by revenue impact"
          right={
            <div style={{
              fontSize: 12, color: "var(--green)",
              background: "var(--greendim)", border: "1px solid rgba(34,197,94,.2)",
              padding: "6px 12px", borderRadius: 6,
            }}>
              {summary ? fmt.currency(summary.total_value) : "—"} total opportunity identified
            </div>
          }
        />
        <ScrollBody>
          {/* Filter row */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <RetailerTabs value={retailer} onChange={v => setRetailer(v as RetailerFilter)} />
            <div style={{ width: 1, height: 24, background: "var(--border)" }} />
            <div style={{ display: "flex", gap: 6 }}>
              {typeFilters.map(f => (
                <button
                  key={f}
                  onClick={() => setTypeFilter(f)}
                  style={{
                    fontSize: 11, fontWeight: 500, padding: "5px 12px", borderRadius: 6,
                    border: `1px solid ${typeFilter === f ? "rgba(59,130,246,0.5)" : "var(--bordermd)"}`,
                    background: typeFilter === f ? "var(--bluedim)" : "transparent",
                    color: typeFilter === f ? "var(--bluelight)" : "var(--text2)",
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  {f === "all" ? "All Types" : f}
                </button>
              ))}
            </div>
          </div>

          {/* Opportunity List */}
          <Card>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <CardTitle>All Opportunities</CardTitle>
              <span style={{ fontSize: 11, color: "var(--text3)" }}>{opps.length} results</span>
            </div>
            {loading ? <Spinner /> : opps.length === 0 ? (
              <div style={{ textAlign: "center", padding: 32, color: "var(--text3)", fontSize: 13 }}>No opportunities match your filters.</div>
            ) : opps.map(o => (
              <OppRow
                key={o.id} opp={o}
                selected={selected?.id === o.id}
                onClick={() => setSelected(selected?.id === o.id ? null : o)}
              />
            ))}
          </Card>

          {/* Charts */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Card>
              <CardTitle>Opportunity by Retailer ($M)</CardTitle>
              <div style={{ position: "relative", width: "100%", height: 180 }}>
                <canvas ref={barRef} role="img" aria-label="Opportunity by retailer" />
              </div>
            </Card>
            <Card>
              <CardTitle>Opportunity by Type</CardTitle>
              <div style={{ position: "relative", width: "100%", height: 180 }}>
                <canvas ref={donutRef} role="img" aria-label="Opportunity by type" />
              </div>
            </Card>
          </div>
        </ScrollBody>
      </div>
      {selected && <DrillPanel opp={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
