import { useEffect, useState } from "react";
import { api } from "../utils/api";
import { fmt } from "../utils/format";
import { PageHeader, ScrollBody, Card, CardTitle, RetailerTabs, Spinner, Badge } from "../components/ui";
import type { FieldNote, Distribution, Promotion, JBPTarget, Deduction, RetailerFilter } from "../types";

type SubTab = "field_notes" | "distribution" | "promotions" | "jbp" | "deductions";

export default function Intelligence() {
  const [retailer, setRetailer] = useState<RetailerFilter>("all");
  const [tab, setTab] = useState<SubTab>("field_notes");

  const tabs: { id: SubTab; label: string }[] = [
    { id: "field_notes", label: "Field Notes" },
    { id: "distribution", label: "Distribution" },
    { id: "promotions", label: "Promotions" },
    { id: "jbp", label: "JBP Tracker" },
    { id: "deductions", label: "Deductions" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <PageHeader
        title="Market Intelligence"
        subtitle="Field notes, distribution health, promotions, JBPs, and deductions"
        right={<RetailerTabs value={retailer} onChange={v => setRetailer(v as RetailerFilter)} />}
      />

      {/* Sub-tabs */}
      <div style={{
        display: "flex", gap: 2, padding: "10px 24px 0",
        borderBottom: "1px solid var(--border)", background: "var(--surface)",
        flexShrink: 0,
      }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              fontSize: 12, fontWeight: 500, padding: "7px 16px",
              borderRadius: "6px 6px 0 0",
              border: `1px solid ${tab === t.id ? "var(--bordermd)" : "transparent"}`,
              borderBottom: tab === t.id ? "1px solid var(--card)" : "none",
              background: tab === t.id ? "var(--card)" : "transparent",
              color: tab === t.id ? "var(--text)" : "var(--text2)",
              cursor: "pointer", fontFamily: "inherit",
              marginBottom: tab === t.id ? -1 : 0,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {tab === "field_notes"  && <FieldNotesTab retailer={retailer} />}
        {tab === "distribution" && <DistributionTab retailer={retailer} />}
        {tab === "promotions"   && <PromotionsTab retailer={retailer} />}
        {tab === "jbp"          && <JBPTab retailer={retailer} />}
        {tab === "deductions"   && <DeductionsTab />}
      </div>
    </div>
  );
}

// ─── FIELD NOTES ───────────────────────────────────────────────────────────
function FieldNotesTab({ retailer }: { retailer: string }) {
  const [notes, setNotes] = useState<FieldNote[]>([]);
  const [selected, setSelected] = useState<FieldNote | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    (api.fieldNotes.list(retailer) as Promise<FieldNote[]>)
      .then(setNotes).finally(() => setLoading(false));
  }, [retailer]);

  const sentimentColor: Record<string, string> = {
    positive: "var(--green)", negative: "var(--red)", mixed: "var(--amber)",
  };

  return (
    <ScrollBody>
      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 14, flex: 1 }}>
        {/* List */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {loading ? <Spinner /> : notes.map(n => (
            <div
              key={n.id}
              onClick={() => setSelected(n)}
              style={{
                background: selected?.id === n.id ? "var(--bluedim)" : "var(--card)",
                border: `1px solid ${selected?.id === n.id ? "rgba(59,130,246,.3)" : "var(--border)"}`,
                borderRadius: 10, padding: "12px 14px", cursor: "pointer",
                transition: "all .12s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 600, background: "rgba(255,255,255,.04)", color: "var(--text2)", padding: "1px 6px", borderRadius: 4 }}>
                  {n.note_type.replace(/_/g, " ")}
                </span>
                {n.sentiment && (
                  <span style={{ fontSize: 10, color: sentimentColor[n.sentiment] || "var(--text3)" }}>
                    ● {n.sentiment}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text)", marginBottom: 2 }}>
                {n.retailer_name || "—"} {n.store_id ? `· ${n.store_id}` : ""}
              </div>
              <div style={{ fontSize: 11, color: "var(--text2)" }}>{n.author}</div>
              <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 4, fontFamily: "var(--mono)" }}>
                {fmt.date(n.visit_date)}
              </div>
            </div>
          ))}
        </div>

        {/* Detail */}
        {selected ? (
          <Card style={{ overflow: "auto" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
                  {selected.retailer_name} {selected.store_id ? `· ${selected.store_id}` : ""}
                </div>
                <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 2 }}>
                  {selected.author} · {fmt.date(selected.visit_date)}
                </div>
              </div>
              {selected.sku_name && (
                <Badge label={`SKU: ${selected.sku_id}`} color="var(--bluelight)" bg="var(--bluedim)" />
              )}
            </div>

            {/* Content */}
            <div style={{ background: "rgba(255,255,255,.02)", border: "1px solid var(--border)", borderRadius: 8, padding: 16, marginBottom: 14 }}>
              <div style={{ fontSize: 12, lineHeight: 1.7, color: "var(--text)", whiteSpace: "pre-wrap", fontFamily: "var(--mono)", fontSize: 11 }}>
                {selected.content}
              </div>
            </div>

            {/* Extracted data */}
            {selected.extracted_data && Object.keys(selected.extracted_data).length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text3)", marginBottom: 8 }}>
                  AI-Extracted Data
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {Object.entries(selected.extracted_data).map(([k, v]) => (
                    <div key={k} style={{ fontSize: 11, background: "rgba(255,255,255,.04)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px" }}>
                      <span style={{ color: "var(--text3)" }}>{k}: </span>
                      <span style={{ color: "var(--text)" }}>{String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action items */}
            {selected.action_items?.length > 0 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text3)", marginBottom: 8 }}>
                  Action Items
                </div>
                {selected.action_items.map((a, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, color: "var(--text2)", marginBottom: 6, alignItems: "flex-start" }}>
                    <span style={{ color: "var(--blue)", flexShrink: 0 }}>→</span> {a}
                  </div>
                ))}
              </div>
            )}
          </Card>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text3)", fontSize: 13 }}>
            Select a note to read it
          </div>
        )}
      </div>
    </ScrollBody>
  );
}

// ─── DISTRIBUTION TABLE ────────────────────────────────────────────────────
function DistributionTab({ retailer }: { retailer: string }) {
  const [data, setData] = useState<Distribution[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    (api.distribution(retailer) as Promise<Distribution[]>)
      .then(setData).finally(() => setLoading(false));
  }, [retailer]);

  const col = (v: number, warn: number, ok: number) =>
    v >= ok ? "var(--green)" : v >= warn ? "var(--amber)" : "var(--red)";

  return (
    <ScrollBody>
      <Card>
        <CardTitle>Distribution Health — All SKUs</CardTitle>
        {loading ? <Spinner /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                {["SKU", "Retailer", "Category", "ACV %", "OOS Rate", "Compliance", "Authorized", "Facings"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 10px", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text3)", borderBottom: "1px solid var(--border)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map(d => (
                <tr key={d.id}
                  style={{ borderBottom: "1px solid var(--border)" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,.02)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "")}
                >
                  <td style={{ padding: "9px 10px", color: "var(--text)", fontWeight: 500 }}>{d.sku_id}</td>
                  <td style={{ padding: "9px 10px", color: "var(--text2)" }}>{d.retailer_name || d.retailer_id}</td>
                  <td style={{ padding: "9px 10px", color: "var(--text2)" }}>{d.category}</td>
                  <td style={{ padding: "9px 10px", color: col(d.acv_percentage, 60, 80), fontWeight: 600, fontFamily: "var(--mono)" }}>
                    {fmt.pct(d.acv_percentage)}
                  </td>
                  <td style={{ padding: "9px 10px", color: d.oos_rate > 5 ? "var(--red)" : d.oos_rate > 2 ? "var(--amber)" : "var(--green)", fontFamily: "var(--mono)" }}>
                    {fmt.pct(d.oos_rate)}
                  </td>
                  <td style={{ padding: "9px 10px", color: col(d.planogram_compliance, 70, 85), fontFamily: "var(--mono)" }}>
                    {fmt.pct(d.planogram_compliance)}
                  </td>
                  <td style={{ padding: "9px 10px", color: "var(--text2)", fontFamily: "var(--mono)" }}>
                    {fmt.number(d.authorized_stores)} / {fmt.number(d.total_stores)}
                  </td>
                  <td style={{ padding: "9px 10px", color: "var(--text2)", fontFamily: "var(--mono)" }}>
                    {d.shelf_facings}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </ScrollBody>
  );
}

// ─── PROMOTIONS ────────────────────────────────────────────────────────────
function PromotionsTab({ retailer }: { retailer: string }) {
  const [data, setData] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    (api.promotions(retailer) as Promise<Promotion[]>)
      .then(setData).finally(() => setLoading(false));
  }, [retailer]);

  const statusColor = (s: string) =>
    s === "completed" ? "var(--green)" : s === "planned" ? "var(--blue)" : "var(--amber)";

  return (
    <ScrollBody>
      <Card>
        <CardTitle>Promotion ROI Tracker</CardTitle>
        {loading ? <Spinner /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                {["SKU", "Retailer", "Type", "Period", "Discount", "ROI Actual", "ROI Target", "Trade Spend", "Status"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 10px", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text3)", borderBottom: "1px solid var(--border)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map(p => (
                <tr key={p.id} style={{ borderBottom: "1px solid var(--border)" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,.02)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "")}
                >
                  <td style={{ padding: "9px 10px", color: "var(--text)", fontWeight: 500 }}>{p.sku_id}</td>
                  <td style={{ padding: "9px 10px", color: "var(--text2)" }}>{p.retailer_name}</td>
                  <td style={{ padding: "9px 10px" }}>
                    <Badge label={p.promo_type} color="var(--bluelight)" bg="var(--bluedim)" />
                  </td>
                  <td style={{ padding: "9px 10px", color: "var(--text2)", fontSize: 11 }}>
                    {fmt.shortDate(p.start_date)} – {fmt.shortDate(p.end_date)}
                  </td>
                  <td style={{ padding: "9px 10px", color: "var(--text2)", fontFamily: "var(--mono)" }}>
                    {fmt.pct(p.discount_pct)}
                  </td>
                  <td style={{ padding: "9px 10px", fontFamily: "var(--mono)", fontWeight: 600,
                    color: p.roi_actual == null ? "var(--text3)" : p.roi_actual >= p.roi_target ? "var(--green)" : "var(--red)" }}>
                    {p.roi_actual != null ? `${p.roi_actual.toFixed(1)}×` : "—"}
                  </td>
                  <td style={{ padding: "9px 10px", color: "var(--text2)", fontFamily: "var(--mono)" }}>
                    {p.roi_target.toFixed(1)}×
                  </td>
                  <td style={{ padding: "9px 10px", color: "var(--text2)", fontFamily: "var(--mono)" }}>
                    {fmt.currency(p.trade_spend, 0)}
                  </td>
                  <td style={{ padding: "9px 10px" }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: statusColor(p.status) }}>
                      {p.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </ScrollBody>
  );
}

// ─── JBP TRACKER ──────────────────────────────────────────────────────────
function JBPTab({ retailer }: { retailer: string }) {
  const [data, setData] = useState<JBPTarget[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    (api.jbp(retailer) as Promise<JBPTarget[]>)
      .then(setData).finally(() => setLoading(false));
  }, [retailer]);

  function Progress({ actual, target }: { actual: number | null; target: number }) {
    if (actual == null) return <span style={{ color: "var(--text3)" }}>—</span>;
    const pct = Math.min(100, (actual / target) * 100);
    const color = pct >= 100 ? "var(--green)" : pct >= 85 ? "var(--amber)" : "var(--red)";
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontFamily: "var(--mono)", color }}>{fmt.pct(pct, 0)}</span>
        </div>
        <div style={{ height: 4, background: "rgba(255,255,255,.06)", borderRadius: 2, overflow: "hidden", width: 80 }}>
          <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2 }} />
        </div>
      </div>
    );
  }

  return (
    <ScrollBody>
      <Card>
        <CardTitle>Joint Business Plan Tracker</CardTitle>
        {loading ? <Spinner /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                {["Retailer", "Period", "Revenue Target", "Revenue Actual", "Rev %", "Share Target", "Share Actual", "Status"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 10px", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text3)", borderBottom: "1px solid var(--border)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map(j => (
                <tr key={j.id} style={{ borderBottom: "1px solid var(--border)" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,.02)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "")}
                >
                  <td style={{ padding: "9px 10px", color: "var(--text)", fontWeight: 500 }}>{j.retailer_name}</td>
                  <td style={{ padding: "9px 10px", color: "var(--text2)" }}>Q{j.quarter} {j.year}</td>
                  <td style={{ padding: "9px 10px", color: "var(--text2)", fontFamily: "var(--mono)" }}>{fmt.currency(j.revenue_target)}</td>
                  <td style={{ padding: "9px 10px", fontFamily: "var(--mono)", color: j.revenue_actual ? "var(--text)" : "var(--text3)" }}>
                    {j.revenue_actual ? fmt.currency(j.revenue_actual) : "—"}
                  </td>
                  <td style={{ padding: "9px 10px" }}>
                    <Progress actual={j.revenue_actual} target={j.revenue_target} />
                  </td>
                  <td style={{ padding: "9px 10px", color: "var(--text2)", fontFamily: "var(--mono)" }}>{fmt.pct(j.share_target)}</td>
                  <td style={{ padding: "9px 10px", fontFamily: "var(--mono)", color: j.share_actual ? "var(--text)" : "var(--text3)" }}>
                    {j.share_actual ? fmt.pct(j.share_actual) : "—"}
                  </td>
                  <td style={{ padding: "9px 10px" }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: j.status === "completed" ? "var(--green)" : "var(--amber)" }}>
                      {j.status.replace(/_/g, " ")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </ScrollBody>
  );
}

// ─── DEDUCTIONS ────────────────────────────────────────────────────────────
function DeductionsTab() {
  const [data, setData] = useState<Deduction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    (api.deductions() as Promise<Deduction[]>)
      .then(setData).finally(() => setLoading(false));
  }, []);

  const total = data.reduce((s, d) => s + (d.dispute_amount || 0), 0);
  const pending = data.filter(d => d.status === "pending").length;

  return (
    <ScrollBody>
      {/* Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
        {[
          { label: "Total Outstanding", value: fmt.currency(total, 0), color: "var(--red)" },
          { label: "Pending Claims", value: String(pending), color: "var(--amber)" },
          { label: "Total Claims", value: String(data.length), color: "var(--text)" },
        ].map(s => (
          <div key={s.label} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 10, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.color, fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
          </div>
        ))}
      </div>

      <Card>
        <CardTitle>Deduction Claims</CardTitle>
        {loading ? <Spinner /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                {["Claim #", "Retailer", "Type", "Amount", "Claim Date", "Due Date", "Status", "Description"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 10px", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text3)", borderBottom: "1px solid var(--border)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map(d => (
                <tr key={d.id} style={{ borderBottom: "1px solid var(--border)" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,.02)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "")}
                >
                  <td style={{ padding: "9px 10px", color: "var(--text)", fontWeight: 500, fontFamily: "var(--mono)", fontSize: 11 }}>{d.claim_number}</td>
                  <td style={{ padding: "9px 10px", color: "var(--text2)" }}>{d.retailer_name}</td>
                  <td style={{ padding: "9px 10px" }}>
                    <Badge label={d.claim_type.replace(/_/g, " ")} color="var(--amber)" bg="var(--amberdim)" />
                  </td>
                  <td style={{ padding: "9px 10px", color: "var(--red)", fontWeight: 600, fontFamily: "var(--mono)" }}>
                    {fmt.currency(d.claim_amount, 0)}
                  </td>
                  <td style={{ padding: "9px 10px", color: "var(--text2)", fontSize: 11 }}>{fmt.date(d.claim_date)}</td>
                  <td style={{ padding: "9px 10px", color: d.due_date ? "var(--amber)" : "var(--text3)", fontSize: 11 }}>
                    {d.due_date ? fmt.date(d.due_date) : "—"}
                  </td>
                  <td style={{ padding: "9px 10px" }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: d.status === "resolved" ? "var(--green)" : d.status === "disputed" ? "var(--blue)" : "var(--amber)" }}>
                      {d.status}
                    </span>
                  </td>
                  <td style={{ padding: "9px 10px", color: "var(--text2)", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {d.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </ScrollBody>
  );
}
