// Formatting helpers

export const fmt = {
  currency: (n: number, decimals = 1): string => {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(decimals)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toFixed(0)}`;
  },
  pct: (n: number, decimals = 1): string => `${n.toFixed(decimals)}%`,
  pp: (n: number): string => {
    const sign = n >= 0 ? "+" : "";
    return `${sign}${n.toFixed(2)}pp`;
  },
  changePct: (n: number): string => {
    const sign = n >= 0 ? "+" : "";
    return `${sign}${n.toFixed(1)}%`;
  },
  number: (n: number): string => n.toLocaleString(),
  date: (s: string): string =>
    new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
  shortDate: (s: string): string =>
    new Date(s + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
};

export const TYPE_CONFIG: Record<string, { color: string; bg: string; border: string }> = {
  Expand:  { color: "#60A5FA", bg: "rgba(59,130,246,0.12)",  border: "rgba(59,130,246,0.3)"  },
  Fix:     { color: "#F87171", bg: "rgba(239,68,68,0.12)",   border: "rgba(239,68,68,0.3)"   },
  Trade:   { color: "#FBBF24", bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.3)"  },
  "Sell-in":{ color: "#34D399", bg: "rgba(52,211,153,0.12)", border: "rgba(52,211,153,0.3)"  },
};

export const SEVERITY_CONFIG: Record<string, { color: string; bg: string; border: string; dot: string }> = {
  critical: { color: "#F87171", bg: "rgba(239,68,68,0.08)",  border: "#EF4444", dot: "#EF4444" },
  warning:  { color: "#FBBF24", bg: "rgba(245,158,11,0.08)", border: "#F59E0B", dot: "#F59E0B" },
  info:     { color: "#34D399", bg: "rgba(52,211,153,0.08)", border: "#10B981", dot: "#10B981" },
};

export const RETAILER_COLORS: Record<string, string> = {
  walmart: "#3B82F6",
  target:  "#14B8A6",
  costco:  "#8B5CF6",
  kroger:  "#F59E0B",
};

// Convert markdown-style **bold** to <strong> in JSX safely
export function parseMd(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n\n/g, "<br/><br/>")
    .replace(/\n→/g, "<br/>→")
    .replace(/\n(\d+\.)/g, "<br/>$1")
    .replace(/\n#/g, "<br/>#")
    .replace(/\n/g, "<br/>");
}
