// SupplierOS – shared TypeScript types

export interface Retailer {
  id: string;
  name: string;
  short_name: string;
  banner_color: string;
  store_count: number;
  region: string;
}

export interface SKU {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  brand: string;
  everyday_price: number;
  pack_size: string;
  acv_percentage?: number;
  oos_rate?: number;
  planogram_compliance?: number;
}

export interface DashboardSummary {
  revenue_ytd: number;
  revenue_change_pct: number;
  opportunity_total: number;
  opportunity_count: number;
  skus_at_risk: number;
  market_share_avg: number;
  share_change_pp: number;
  active_alerts: number;
  data_coverage_pct: number;
  retailer_id: string;
}

export interface WeeklyRevenue {
  week: string;
  actual: number;
  target: number;
  label: string;
}

export interface MarketShare {
  retailer_id: string;
  share: number;
}

export interface RootCause {
  icon: string;
  title: string;
  body: string;
}

export interface Opportunity {
  id: number;
  sku_id: string;
  sku_name: string;
  retailer_id: string | null;
  retailer_name: string | null;
  category: string;
  title: string;
  opportunity_type: 'Expand' | 'Fix' | 'Trade' | 'Sell-in';
  estimated_value: number;
  confidence_score: number;
  priority_rank: number;
  status: string;
  description: string;
  action_text: string;
  impact_text: string;
  root_causes: RootCause[];
  metrics: Record<string, string>;
  created_at: string;
}

export interface OpportunitySummary {
  total_value: number;
  by_type: Array<{ opportunity_type: string; total: number; cnt: number }>;
  by_retailer: Array<{ retailer: string; total: number; cnt: number }>;
}

export interface Alert {
  id: number;
  sku_id: string | null;
  sku_name: string | null;
  retailer_id: string | null;
  retailer_name: string | null;
  alert_type: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  estimated_impact: number | null;
  is_read: boolean;
  is_resolved: boolean;
  created_at: string;
}

export interface Distribution {
  id: number;
  retailer_id: string;
  retailer_name: string;
  sku_id: string;
  sku_name: string;
  category: string;
  authorized_stores: number;
  total_stores: number;
  acv_percentage: number;
  oos_rate: number;
  oos_stores: number;
  planogram_compliance: number;
  shelf_facings: number;
  as_of_date: string;
}

export interface Promotion {
  id: number;
  retailer_id: string;
  retailer_name: string;
  sku_id: string;
  sku_name: string;
  promo_type: string;
  start_date: string;
  end_date: string;
  promo_price: number;
  discount_pct: number;
  lift_actual: number | null;
  lift_target: number;
  roi_actual: number | null;
  roi_target: number;
  trade_spend: number;
  status: string;
}

export interface JBPTarget {
  id: number;
  retailer_id: string;
  retailer_name: string;
  year: number;
  quarter: number;
  revenue_target: number;
  revenue_actual: number | null;
  share_target: number;
  share_actual: number | null;
  distribution_target: number;
  distribution_actual: number | null;
  status: string;
}

export interface Deduction {
  id: number;
  retailer_id: string;
  retailer_name: string;
  claim_number: string;
  claim_type: string;
  claim_amount: number;
  dispute_amount: number | null;
  status: string;
  claim_date: string;
  due_date: string | null;
  description: string | null;
}

export interface FieldNote {
  id: number;
  retailer_id: string | null;
  retailer_name: string | null;
  sku_id: string | null;
  sku_name: string | null;
  store_id: string | null;
  note_type: string;
  author: string;
  content: string;
  extracted_data: Record<string, unknown>;
  sentiment: string | null;
  action_items: string[];
  visit_date: string;
  created_at: string;
}

export interface ChatMessage {
  id: number;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata: { sources?: string[]; confidence?: number };
  created_at: string;
}

export interface Module {
  id: string;
  name: string;
  category: string;
  icon: string;
  status: string;
  status_label: string;
  detail: string;
  color: string;
}

export type RetailerFilter = 'all' | 'walmart' | 'target' | 'costco' | 'kroger';
export type ViewId = 'dashboard' | 'opportunities' | 'copilot' | 'modules' | 'intelligence' | 'jbp' | 'deductions';
