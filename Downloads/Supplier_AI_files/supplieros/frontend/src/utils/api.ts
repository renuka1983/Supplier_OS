// SupplierOS API Client

const BASE = "/api";

async function get<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(BASE + path, window.location.origin);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json();
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json();
}

async function patch<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json();
}

export const api = {
  health: () => get("/health"),
  dashboard: {
    summary: (retailer_id = "all") => get("/dashboard/summary", { retailer_id }),
    weeklyRevenue: (retailer_id = "all", weeks = "12") =>
      get("/dashboard/weekly-revenue", { retailer_id, weeks }),
    marketShare: () => get("/dashboard/market-share"),
  },
  retailers: () => get("/retailers"),
  skus: {
    list: () => get("/skus"),
    performance: (sku_id: string, retailer_id = "all") =>
      get(`/skus/${sku_id}/performance`, { retailer_id }),
  },
  opportunities: {
    list: (retailer_id = "all", type = "all") =>
      get("/opportunities", { retailer_id, type }),
    detail: (id: number) => get(`/opportunities/${id}`),
    summary: () => get("/opportunities/summary"),
    updateStatus: (id: number, status: string) =>
      patch(`/opportunities/${id}/status`, { status }),
  },
  alerts: {
    list: (resolved = false) => get("/alerts", { resolved: String(resolved) }),
    resolve: (id: number) => patch(`/alerts/${id}/resolve`),
    markRead: (id: number) => patch(`/alerts/${id}/read`),
  },
  distribution: (retailer_id = "all") => get("/distribution", { retailer_id }),
  promotions: (retailer_id = "all") => get("/promotions", { retailer_id }),
  jbp: (retailer_id = "all") => get("/jbp", { retailer_id }),
  deductions: () => get("/deductions"),
  fieldNotes: {
    list: (retailer_id = "all") => get("/field-notes", { retailer_id }),
    create: (body: unknown) => post("/field-notes", body),
  },
  chat: {
    createSession: () => post<{ session_id: string }>("/chat/sessions"),
    getMessages: (session_id: string) =>
      get(`/chat/sessions/${session_id}/messages`),
    sendMessage: (session_id: string, content: string) =>
      post(`/chat/sessions/${session_id}/messages`, { content }),
  },
  modules: () => get("/modules/status"),
};
