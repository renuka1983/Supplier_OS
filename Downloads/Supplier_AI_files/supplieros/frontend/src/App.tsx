import { useState, useEffect } from "react";
import Dashboard from "./pages/Dashboard";
import Opportunities from "./pages/Opportunities";
import Copilot from "./pages/Copilot";
import Intelligence from "./pages/Intelligence";
import { Modules, Impact } from "./pages/ModulesAndImpact";
import type { ViewId } from "./types";

// ─── GLOBAL STYLES ─────────────────────────────────────────────────────────
const GLOBAL_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg:        #0A0C10;
    --surface:   #0F1219;
    --card:      #141820;
    --cardhover: #181D28;
    --border:    rgba(255,255,255,0.06);
    --bordermd:  rgba(255,255,255,0.10);
    --borderhi:  rgba(255,255,255,0.18);
    --text:      #E2E8F0;
    --text2:     #94A3B8;
    --text3:     #475569;
    --blue:      #3B82F6;
    --bluelight: #60A5FA;
    --bluedim:   rgba(59,130,246,0.10);
    --blueglow:  rgba(59,130,246,0.20);
    --green:     #22C55E;
    --greendim:  rgba(34,197,94,0.10);
    --amber:     #F59E0B;
    --amberdim:  rgba(245,158,11,0.10);
    --red:       #EF4444;
    --reddim:    rgba(239,68,68,0.10);
    --teal:      #14B8A6;
    --tealdim:   rgba(20,184,166,0.10);
    --purple:    #8B5CF6;
    --purpledim: rgba(139,92,246,0.10);
    --font:      'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    --mono:      'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
  }
  html, body, #root { height: 100%; overflow: hidden; }
  body {
    font-family: var(--font);
    background: var(--bg);
    color: var(--text);
    font-size: 14px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,.08); border-radius: 4px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.2} }
  @keyframes typing { 0%,100%{opacity:.3;transform:translateY(0)} 50%{opacity:1;transform:translateY(-3px)} }
`;

// ─── SIDEBAR ITEM ──────────────────────────────────────────────────────────
function SBItem({
  icon, label, active, badge, badgeColor, onClick,
}: {
  icon: string; label: string; active: boolean;
  badge?: string | number; badgeColor?: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "7px 10px", borderRadius: 6,
        fontSize: 12, fontWeight: active ? 500 : 400,
        color: active ? "var(--bluelight)" : "var(--text2)",
        border: "none", background: active ? "var(--bluedim)" : "transparent",
        cursor: "pointer", fontFamily: "var(--font)", width: "100%", textAlign: "left",
        transition: "all .12s",
      }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.color = "var(--text)"; e.currentTarget.style.background = "rgba(255,255,255,.04)"; } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.color = "var(--text2)"; e.currentTarget.style.background = "transparent"; } }}
    >
      <span style={{ fontSize: 14, width: 18, textAlign: "center", flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {badge && (
        <span style={{
          fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 10,
          background: badgeColor === "amber" ? "var(--amberdim)" : "var(--reddim)",
          color: badgeColor === "amber" ? "var(--amber)" : "var(--red)",
        }}>
          {badge}
        </span>
      )}
    </button>
  );
}

function SBSection({ label }: { label: string }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text3)", padding: "10px 10px 4px", marginTop: 4 }}>
      {label}
    </div>
  );
}

// ─── LIVE CLOCK ────────────────────────────────────────────────────────────
function Clock() {
  const [t, setT] = useState(new Date().toLocaleTimeString("en-US", { hour12: false }));
  useEffect(() => {
    const id = setInterval(() => setT(new Date().toLocaleTimeString("en-US", { hour12: false })), 1000);
    return () => clearInterval(id);
  }, []);
  return <span style={{ fontSize: 11, color: "var(--text3)", fontFamily: "var(--mono)" }}>{t}</span>;
}

// ─── NAV TAB ───────────────────────────────────────────────────────────────
function NavTab({ label, icon, active, onClick }: { label: string; icon: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "6px 14px", borderRadius: 6,
        fontSize: 12, fontWeight: 500,
        color: active ? "var(--bluelight)" : "var(--text2)",
        border: "none", background: active ? "var(--bluedim)" : "transparent",
        cursor: "pointer", fontFamily: "var(--font)", transition: "all .15s",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.color = "var(--text)"; e.currentTarget.style.background = "rgba(255,255,255,.04)"; } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.color = "var(--text2)"; e.currentTarget.style.background = "transparent"; } }}
    >
      <span style={{ fontSize: 13, opacity: 0.7 }}>{icon}</span>
      {label}
    </button>
  );
}

// ─── ROOT APP ──────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState<ViewId>("dashboard");

  const navItems: { id: ViewId; label: string; icon: string }[] = [
    { id: "dashboard",     label: "Dashboard",     icon: "⬡" },
    { id: "opportunities", label: "Opportunities",  icon: "◎" },
    { id: "copilot",       label: "AI Co-Pilot",   icon: "✦" },
    { id: "modules",       label: "Modules",        icon: "⬢" },
    { id: "intelligence",  label: "Intelligence",   icon: "◆" },
    { id: "jbp",           label: "Impact",         icon: "▲" },
  ];

  const sidebarNav: { section: string; items: { id: ViewId; icon: string; label: string; badge?: string; badgeColor?: string }[] }[] = [
    {
      section: "Revenue",
      items: [
        { id: "dashboard",     icon: "⬡", label: "Overview" },
        { id: "opportunities", icon: "◎", label: "Opportunities" },
        { id: "intelligence",  icon: "◆", label: "Analytics" },
        { id: "intelligence",  icon: "▷", label: "Trade Promos" },
      ],
    },
    {
      section: "Commercial",
      items: [
        { id: "intelligence",  icon: "◉", label: "Retailer Planning" },
        { id: "intelligence",  icon: "◳", label: "Deductions", badge: "3", badgeColor: "red" },
        { id: "intelligence",  icon: "◎", label: "Channel CRM" },
      ],
    },
    {
      section: "Operations",
      items: [
        { id: "modules",  icon: "◐", label: "Item Management" },
        { id: "modules",  icon: "◑", label: "Retail Ops", badge: "7", badgeColor: "amber" },
        { id: "modules",  icon: "◒", label: "Warehouse" },
      ],
    },
    {
      section: "Intelligence",
      items: [
        { id: "copilot", icon: "✦", label: "AI Co-Pilot" },
        { id: "jbp",     icon: "▲", label: "Impact & Roadmap" },
      ],
    },
  ];

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

        {/* ─── TOPBAR ───────────────────────────────────────────────── */}
        <div style={{
          height: 52, flexShrink: 0,
          background: "var(--surface)", borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 20px", gap: 16, position: "relative", zIndex: 200,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.4, color: "var(--text)", whiteSpace: "nowrap" }}>
              Supplier<span style={{ color: "var(--blue)" }}>OS</span>
              <span style={{ fontSize: 10, fontWeight: 400, color: "var(--text3)", marginLeft: 6, letterSpacing: "0.03em" }}>Revenue Decisioning Platform</span>
            </div>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", background: "linear-gradient(135deg,#1e3a5f,#0f2744)", border: "1px solid rgba(59,130,246,.3)", borderRadius: 6, padding: "3px 9px", color: "var(--bluelight)", textTransform: "uppercase" }}>
              PoC Demo
            </div>
          </div>

          <nav style={{ display: "flex", gap: 2 }}>
            {navItems.map(n => (
              <NavTab
                key={`${n.id}-${n.label}`}
                label={n.label} icon={n.icon}
                active={view === n.id}
                onClick={() => setView(n.id)}
              />
            ))}
          </nav>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(34,197,94,.08)", border: "1px solid rgba(34,197,94,.2)", borderRadius: 20, padding: "4px 10px", fontSize: 11, fontWeight: 500, color: "var(--green)" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)", animation: "blink 1.8s ease-in-out infinite" }} />
              Live
            </div>
            <Clock />
          </div>
        </div>

        {/* ─── BODY ─────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

          {/* Sidebar */}
          <aside style={{
            width: 210, flexShrink: 0,
            background: "var(--surface)", borderRight: "1px solid var(--border)",
            display: "flex", flexDirection: "column",
            overflowY: "auto", padding: "12px 10px 20px",
          }}>
            {sidebarNav.map(section => (
              <div key={section.section}>
                <SBSection label={section.section} />
                {section.items.map((item, i) => (
                  <SBItem
                    key={`${item.id}-${item.label}-${i}`}
                    icon={item.icon}
                    label={item.label}
                    active={view === item.id && item.label === navItems.find(n => n.id === view)?.label || view === item.id && section.items.findIndex(x => x.id === item.id) === section.items.indexOf(item)}
                    badge={item.badge}
                    badgeColor={item.badgeColor}
                    onClick={() => setView(item.id)}
                  />
                ))}
              </div>
            ))}
          </aside>

          {/* Main content */}
          <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {view === "dashboard"     && <Dashboard />}
            {view === "opportunities" && <Opportunities />}
            {view === "copilot"       && <Copilot />}
            {view === "modules"       && <Modules />}
            {view === "intelligence"  && <Intelligence />}
            {view === "jbp"           && <Impact />}
          </main>
        </div>
      </div>
    </>
  );
}
