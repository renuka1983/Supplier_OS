import { useEffect, useState, useCallback } from "react";
import { api } from "../utils/api";
import { fmt } from "../utils/format";
import {
  PageHeader, ScrollBody, Card, CardTitle, KPICard,
  RetailerTabs, RevenueChart, ShareChart, OppRow, AlertItem,
  DrillPanel, KPIDrillPanel, Spinner,
} from "../components/ui";
import type {
  DashboardSummary, WeeklyRevenue, MarketShare,
  Opportunity, Alert, RetailerFilter,
} from "../types";

export default function Dashboard() {
  const [retailer, setRetailer] = useState<RetailerFilter>("all");
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [revenue, setRevenue] = useState<WeeklyRevenue[]>([]);
  const [share, setShare] = useState<MarketShare[]>([]);
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null);
  const [drillMode, setDrillMode] = useState<'revenue' | 'opportunity' | 'share' | 'risk' | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async (r: string) => {
    setLoading(true);
    try {
      const [sum, rev, sh, ops, als] = await Promise.all([
        api.dashboard.summary(r) as Promise<DashboardSummary>,
        api.dashboard.weeklyRevenue(r) as Promise<WeeklyRevenue[]>,
        api.dashboard.marketShare() as Promise<MarketShare[]>,
        api.opportunities.list(r) as Promise<Opportunity[]>,
        api.alerts.list() as Promise<Alert[]>,
      ]);
      setSummary(sum);
      setRevenue(rev);
      setShare(sh);
      setOpps(ops);
      setAlerts(als);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(retailer); }, [retailer, loadData]);

  // Live refresh every 30s
  useEffect(() => {
    const id = setInterval(() => loadData(retailer), 30_000);
    return () => clearInterval(id);
  }, [retailer, loadData]);

  const handleResolveAlert = async (id: number) => {
    await api.alerts.resolve(id);
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  return (
    <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <PageHeader
          title="Revenue Command Center"
          subtitle="AI-identified opportunities, live alerts & portfolio performance"
          right={<RetailerTabs value={retailer} onChange={v => setRetailer(v as RetailerFilter)} />}
        />

        {/* Overview Banner */}
        <div style={{
          padding: "12px 24px", borderBottom: "1px solid var(--border)",
          background: "linear-gradient(135deg, rgba(15,30,60,.8), rgba(10,20,45,.6))",
          display: "flex", alignItems: "center", gap: 24, flexShrink: 0, flexWrap: "wrap",
        }}>
          {[
            { label: "Data Coverage", value: summary ? `${summary.data_coverage_pct}%` : "—" },
            { label: "Retailers Connected", value: "4" },
            { label: "Active SKUs", value: "247" },
            { label: "Stores Monitored", value: "10,000+" },
            { label: "Active Alerts", value: String(summary?.active_alerts ?? "—") },
          ].map((s, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", letterSpacing: -0.5, fontVariantNumeric: "tabular-nums" }}>
                {s.value}
              </div>
              <div style={{ fontSize: 10, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {s.label}
              </div>
            </div>
          ))}
          <div style={{ marginLeft: "auto", fontSize: 11, color: "var(--text3)" }}>
            Synced from Walmart Luminate · Target+ · Circana · Nielsen
          </div>
        </div>

        {loading ? (
          <Spinner />
        ) : (
          <ScrollBody>
            {/* KPI Row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 }}>
              <KPICard
                label="Revenue YTD"
                value={summary ? fmt.currency(summary.revenue_ytd) : "—"}
                delta={summary ? fmt.changePct(summary.revenue_change_pct) : undefined}
                deltaLabel="vs prior year"
                deltaDir="up"
                accentColor="var(--blue)"
                clickable
                onClick={() => setDrillMode('revenue')}
              />
              <KPICard
                label="AI Opportunity Pipeline"
                value={summary ? fmt.currency(summary.opportunity_total) : "—"}
                delta={String(summary?.opportunity_count ?? "")}
                deltaLabel="open opportunities"
                deltaDir="neutral"
                accentColor="var(--green)"
                clickable
                onClick={() => setDrillMode('opportunity')}
              />
              <KPICard
                label="Market Share"
                value={summary ? fmt.pct(summary.market_share_avg) : "—"}
                delta={summary ? fmt.pp(summary.share_change_pp) : undefined}
                deltaLabel="vs prior period"
                deltaDir={summary && summary.share_change_pp >= 0 ? "up" : "dn"}
                accentColor="var(--teal)"
                clickable
                onClick={() => setDrillMode('share')}
              />
              <KPICard
                label="SKUs at Risk"
                value={summary ? String(summary.skus_at_risk) : "—"}
                delta={summary?.skus_at_risk ? "Needs attention" : "All good"}
                deltaDir={summary && summary.skus_at_risk > 3 ? "dn" : "neutral"}
                accentColor="var(--red)"
                clickable
                onClick={() => setDrillMode('risk')}
              />
            </div>

            {/* Charts Row */}
            <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 14 }}>
              <Card>
                <CardTitle>Weekly Revenue ($M) — Actual vs Target</CardTitle>
                {revenue.length > 0 ? <RevenueChart data={revenue} /> : <Spinner />}
              </Card>
              <Card>
                <CardTitle>Market Share by Retailer (%)</CardTitle>
                {share.length > 0 ? <ShareChart data={share} /> : <Spinner />}
              </Card>
            </div>

            {/* Bottom Row */}
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14 }}>
              <Card>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <CardTitle>Top AI-Identified Revenue Opportunities</CardTitle>
                  <span style={{ fontSize: 11, color: "var(--text3)" }}>Click any row to drill down →</span>
                </div>
                {opps.slice(0, 5).map(o => (
                  <OppRow
                    key={o.id}
                    opp={o}
                    selected={selectedOpp?.id === o.id}
                    onClick={() => setSelectedOpp(selectedOpp?.id === o.id ? null : o)}
                  />
                ))}
              </Card>
              <Card>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <CardTitle>AI Alerts</CardTitle>
                  <span style={{
                    fontSize: 10, background: "var(--reddim)", color: "var(--red)",
                    padding: "2px 7px", borderRadius: 10, fontWeight: 600,
                  }}>
                    {alerts.filter(a => !a.is_resolved).length} Active
                  </span>
                </div>
                {alerts.slice(0, 5).map(a => (
                  <AlertItem key={a.id} alert={a} onResolve={() => handleResolveAlert(a.id)} />
                ))}
              </Card>
            </div>
          </ScrollBody>
        )}
      </div>

      {/* Drill Panels */}
      {selectedOpp && (
        <DrillPanel opp={selectedOpp} onClose={() => setSelectedOpp(null)} />
      )}
      {drillMode === 'revenue' && (
        <KPIDrillPanel
          type="revenue"
          title="Revenue Performance"
          summary={summary}
          data={revenue}
          onClose={() => setDrillMode(null)}
        />
      )}
      {drillMode === 'opportunity' && (
        <KPIDrillPanel
          type="opportunity"
          title="Top Opportunities"
          summary={summary}
          data={opps}
          onClose={() => setDrillMode(null)}
        />
      )}
      {drillMode === 'share' && (
        <KPIDrillPanel
          type="share"
          title="Market Share Analysis"
          summary={summary}
          data={share}
          onClose={() => setDrillMode(null)}
        />
      )}
      {drillMode === 'risk' && (
        <KPIDrillPanel
          type="risk"
          title="SKUs at Risk"
          summary={summary}
          data={[]}
          onClose={() => setDrillMode(null)}
        />
      )}
    </div>
  );
}
