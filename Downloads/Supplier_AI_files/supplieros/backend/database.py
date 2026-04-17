"""
SupplierOS Database Layer — SQLite (production-equivalent schema)
Designed to be swapped to PostgreSQL by changing DATABASE_URL only.
"""
import sqlite3
import os
import json
from contextlib import contextmanager

DATABASE_PATH = os.path.join(os.path.dirname(__file__), "supplieros.db")

SCHEMA = """
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- ─── RETAILERS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS retailers (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    short_name  TEXT NOT NULL,
    banner_color TEXT NOT NULL,
    store_count INTEGER NOT NULL,
    region      TEXT NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─── SKUS ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS skus (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    category        TEXT NOT NULL,
    subcategory     TEXT NOT NULL,
    brand           TEXT NOT NULL,
    upc             TEXT UNIQUE NOT NULL,
    unit_cost       REAL NOT NULL,
    everyday_price  REAL NOT NULL,
    pack_size       TEXT NOT NULL,
    weight_oz       REAL,
    is_active       BOOLEAN DEFAULT 1,
    launch_date     DATE,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─── WEEKLY SALES (POS DATA) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS weekly_sales (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    retailer_id     TEXT NOT NULL REFERENCES retailers(id),
    sku_id          TEXT NOT NULL REFERENCES skus(id),
    week_ending     DATE NOT NULL,
    units_sold      INTEGER NOT NULL,
    revenue         REAL NOT NULL,
    avg_selling_price REAL NOT NULL,
    promo_flag      BOOLEAN DEFAULT 0,
    promo_type      TEXT,
    stores_selling  INTEGER NOT NULL,
    stores_total    INTEGER NOT NULL,
    velocity_per_store REAL NOT NULL,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(retailer_id, sku_id, week_ending)
);

-- ─── DISTRIBUTION ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS distribution (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    retailer_id         TEXT NOT NULL REFERENCES retailers(id),
    sku_id              TEXT NOT NULL REFERENCES skus(id),
    authorized_stores   INTEGER NOT NULL,
    total_stores        INTEGER NOT NULL,
    acv_percentage      REAL NOT NULL,
    oos_rate            REAL NOT NULL,
    oos_stores          INTEGER NOT NULL,
    planogram_compliance REAL NOT NULL,
    shelf_facings       INTEGER NOT NULL,
    as_of_date          DATE NOT NULL,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(retailer_id, sku_id, as_of_date)
);

-- ─── MARKET SHARE ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS market_share (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    retailer_id     TEXT NOT NULL REFERENCES retailers(id),
    sku_id          TEXT NOT NULL REFERENCES skus(id),
    category        TEXT NOT NULL,
    week_ending     DATE NOT NULL,
    dollar_share    REAL NOT NULL,
    unit_share      REAL NOT NULL,
    share_change_pp REAL NOT NULL,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(retailer_id, sku_id, week_ending)
);

-- ─── PROMOTIONS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promotions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    retailer_id     TEXT NOT NULL REFERENCES retailers(id),
    sku_id          TEXT NOT NULL REFERENCES skus(id),
    promo_type      TEXT NOT NULL,
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    promo_price     REAL NOT NULL,
    discount_pct    REAL NOT NULL,
    lift_actual     REAL,
    lift_target     REAL NOT NULL,
    roi_actual      REAL,
    roi_target      REAL NOT NULL,
    trade_spend     REAL NOT NULL,
    incremental_units INTEGER,
    status          TEXT DEFAULT 'planned',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─── AI OPPORTUNITIES ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_opportunities (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    sku_id          TEXT NOT NULL REFERENCES skus(id),
    retailer_id     TEXT REFERENCES retailers(id),
    title           TEXT NOT NULL,
    opportunity_type TEXT NOT NULL,
    estimated_value  REAL NOT NULL,
    confidence_score REAL NOT NULL,
    priority_rank    INTEGER NOT NULL,
    status          TEXT DEFAULT 'open',
    description     TEXT NOT NULL,
    action_text     TEXT NOT NULL,
    impact_text     TEXT NOT NULL,
    root_causes     TEXT NOT NULL,   -- JSON array
    metrics         TEXT NOT NULL,   -- JSON object
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─── AI ALERTS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_alerts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    sku_id          TEXT REFERENCES skus(id),
    retailer_id     TEXT REFERENCES retailers(id),
    alert_type      TEXT NOT NULL,
    severity        TEXT NOT NULL,
    title           TEXT NOT NULL,
    message         TEXT NOT NULL,
    estimated_impact REAL,
    is_read         BOOLEAN DEFAULT 0,
    is_resolved     BOOLEAN DEFAULT 0,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─── JOINT BUSINESS PLANS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jbp_targets (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    retailer_id     TEXT NOT NULL REFERENCES retailers(id),
    year            INTEGER NOT NULL,
    quarter         INTEGER NOT NULL,
    revenue_target  REAL NOT NULL,
    revenue_actual  REAL,
    share_target    REAL NOT NULL,
    share_actual    REAL,
    distribution_target REAL NOT NULL,
    distribution_actual REAL,
    status          TEXT DEFAULT 'in_progress',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(retailer_id, year, quarter)
);

-- ─── DEDUCTIONS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deductions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    retailer_id     TEXT NOT NULL REFERENCES retailers(id),
    claim_number    TEXT UNIQUE NOT NULL,
    claim_type      TEXT NOT NULL,
    claim_amount    REAL NOT NULL,
    dispute_amount  REAL,
    status          TEXT DEFAULT 'pending',
    claim_date      DATE NOT NULL,
    due_date        DATE,
    description     TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─── FIELD NOTES (UNSTRUCTURED) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS field_notes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    retailer_id     TEXT REFERENCES retailers(id),
    sku_id          TEXT REFERENCES skus(id),
    store_id        TEXT,
    note_type       TEXT NOT NULL,
    author          TEXT NOT NULL,
    content         TEXT NOT NULL,
    extracted_data  TEXT,            -- JSON: AI-extracted structured data
    sentiment       TEXT,
    action_items    TEXT,            -- JSON array
    visit_date      DATE NOT NULL,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─── CHAT HISTORY ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_sessions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      TEXT UNIQUE NOT NULL,
    user_id         TEXT DEFAULT 'demo_user',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      TEXT NOT NULL REFERENCES chat_sessions(session_id),
    role            TEXT NOT NULL,
    content         TEXT NOT NULL,
    metadata        TEXT,            -- JSON: sources, confidence, etc.
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─── INDEXES ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_weekly_sales_retailer ON weekly_sales(retailer_id);
CREATE INDEX IF NOT EXISTS idx_weekly_sales_sku ON weekly_sales(sku_id);
CREATE INDEX IF NOT EXISTS idx_weekly_sales_week ON weekly_sales(week_ending);
CREATE INDEX IF NOT EXISTS idx_distribution_retailer ON distribution(retailer_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_status ON ai_opportunities(status);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON ai_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_resolved ON ai_alerts(is_resolved);
"""

@contextmanager
def get_db():
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def init_db():
    """Initialize the database schema."""
    with get_db() as conn:
        conn.executescript(SCHEMA)
    print(f"[DB] Database initialized at {DATABASE_PATH}")

def row_to_dict(row):
    """Convert sqlite3.Row to dict."""
    if row is None:
        return None
    return dict(row)

def rows_to_list(rows):
    """Convert list of sqlite3.Row to list of dicts."""
    return [dict(r) for r in rows]
