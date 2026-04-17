# SupplierOS — Revenue Decisioning Platform
### Proof-of-Concept Demo

A full-stack AI-powered revenue decisioning platform for consumer goods suppliers.
Built with **React 19 + TypeScript** (frontend), **Python Flask** (backend), and **SQLite/PostgreSQL** (database).

---

## 🚀 Quick Start (30 seconds)

```bash
# 1. Clone / unzip the project
cd supplieros

# 2. Run everything with one command
./start.sh

# 3. Open in browser
open http://localhost:8000
```

The start script will:
- Verify Python 3 + Flask are available
- Seed the database with synthetic data (749 sales records, 14 SKUs, 4 retailers)
- Start the Flask API server serving both the API and the React frontend

---

## 📁 Project Structure

```
supplieros/
├── backend/
│   ├── app.py          # Flask REST API (14 endpoint groups)
│   ├── database.py     # SQLite schema + connection layer
│   ├── seed.py         # Synthetic data generator
│   └── supplieros.db   # SQLite database (auto-created on first run)
├── frontend/
│   ├── src/
│   │   ├── App.tsx                    # Root layout + navigation
│   │   ├── index.tsx                  # React entry point
│   │   ├── components/ui.tsx          # Shared UI components
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx          # Revenue command center
│   │   │   ├── Opportunities.tsx      # AI opportunity table + drill-down
│   │   │   ├── Copilot.tsx            # AI chat interface
│   │   │   ├── Intelligence.tsx       # Field notes, distribution, promos, JBP, deductions
│   │   │   └── ModulesAndImpact.tsx   # Platform modules + impact roadmap
│   │   ├── types/index.ts             # TypeScript interfaces
│   │   └── utils/
│   │       ├── api.ts                 # API client (all fetch calls)
│   │       └── format.ts              # Formatting helpers
│   ├── public/index.html              # HTML shell
│   └── dist/                          # Built bundle (auto-generated)
│       ├── index.html
│       └── bundle.js
├── start.sh            # One-command startup
├── build.sh            # Frontend rebuild script
└── README.md
```

---

## 🏗️ Architecture

```
Browser (React 19 + TypeScript)
        │  HTTP/JSON
        ▼
Flask REST API (Python 3, port 8000)
  ├── /api/dashboard/*      → KPIs, weekly revenue, market share
  ├── /api/opportunities/*  → AI-ranked revenue opportunities
  ├── /api/alerts/*         → Real-time AI alerts
  ├── /api/distribution     → Distribution health by SKU/retailer
  ├── /api/promotions       → Promo ROI tracker
  ├── /api/jbp              → Joint Business Plan tracker
  ├── /api/deductions       → Chargeback management
  ├── /api/field-notes/*    → Store audit notes (unstructured → structured)
  ├── /api/chat/*           → AI Co-Pilot session management
  ├── /api/modules/status   → Platform module status
  └── /api/health           → Health check
        │
        ▼
SQLite (supplieros.db) ← swap DATABASE_URL for PostgreSQL
  ├── retailers             (4 retailers)
  ├── skus                  (14 active SKUs across 4 brands)
  ├── weekly_sales          (749 records, 26 weeks of POS data)
  ├── distribution          (34 current distribution snapshots)
  ├── market_share          (286 weekly share records)
  ├── promotions            (10 promo events with ROI data)
  ├── ai_opportunities      (7 ranked opportunities, $28.7M total)
  ├── ai_alerts             (6 active alerts)
  ├── jbp_targets           (10 quarterly JBP records)
  ├── deductions            (5 chargeback claims)
  ├── field_notes           (4 unstructured store visit reports)
  └── chat_sessions/messages (AI Co-Pilot conversation history)
```

---

## 🗄️ Migrate to PostgreSQL

The schema is identical. Just change one line in `backend/database.py`:

```python
# SQLite (current)
DATABASE_PATH = os.path.join(os.path.dirname(__file__), "supplieros.db")

# PostgreSQL — install psycopg2 and swap to SQLAlchemy:
# pip install sqlalchemy psycopg2-binary
# DATABASE_URL = "postgresql://user:password@localhost:5432/supplieros"
```

Full PostgreSQL migration:
```bash
# 1. Create database
createdb supplieros

# 2. Install SQLAlchemy
pip install sqlalchemy psycopg2-binary

# 3. Update database.py to use psycopg2 connection
# 4. Re-run seed.py
python3 backend/seed.py
```

---

## 🛠️ Development

### Rebuild frontend after changes
```bash
./build.sh
```

### Run backend only (for API development)
```bash
cd backend
python3 app.py 8000
```

### Re-seed the database
```bash
cd backend
python3 seed.py
```

### API reference
```bash
# Health check
curl http://localhost:8000/api/health

# Dashboard KPIs (all retailers)
curl http://localhost:8000/api/dashboard/summary

# Dashboard KPIs (single retailer)
curl "http://localhost:8000/api/dashboard/summary?retailer_id=walmart"

# Weekly revenue chart data
curl "http://localhost:8000/api/dashboard/weekly-revenue?retailer_id=all&weeks=12"

# All opportunities
curl http://localhost:8000/api/opportunities

# Filtered by type
curl "http://localhost:8000/api/opportunities?type=Expand&retailer_id=walmart"

# Opportunity detail
curl http://localhost:8000/api/opportunities/1

# Update opportunity status
curl -X PATCH http://localhost:8000/api/opportunities/1/status \
  -H "Content-Type: application/json" \
  -d '{"status": "in_progress"}'

# Active alerts
curl http://localhost:8000/api/alerts

# Resolve alert
curl -X PATCH http://localhost:8000/api/alerts/1/resolve

# Start AI chat session
SESSION=$(curl -s -X POST http://localhost:8000/api/chat/sessions | python3 -c "import sys,json; print(json.load(sys.stdin)['session_id'])")

# Send message
curl -X POST "http://localhost:8000/api/chat/sessions/$SESSION/messages" \
  -H "Content-Type: application/json" \
  -d '{"content": "What are my top growth opportunities at Walmart?"}'
```

---

## 📊 Synthetic Data Overview

### Structured Data
| Table | Records | Description |
|-------|---------|-------------|
| `weekly_sales` | 749 | 26 weeks × 4 retailers × 14 SKUs, with promo flags, velocity, revenue |
| `distribution` | 34 | ACV%, OOS rate, planogram compliance, shelf facings per retailer/SKU |
| `market_share` | 286 | Weekly dollar/unit share with trend data |
| `promotions` | 10 | TPRs, rollbacks, road shows with actual vs target ROI |
| `jbp_targets` | 10 | Quarterly Joint Business Plan targets vs actuals |
| `deductions` | 5 | Chargeback claims with dispute status |

### Unstructured Data
| Table | Records | Description |
|-------|---------|-------------|
| `field_notes` | 4 | Full store audit reports and buyer meeting notes |
| `ai_opportunities` | 7 | AI-generated with root causes, actions, confidence scores |
| `ai_alerts` | 6 | Real-time alerts with severity levels and impact estimates |

### Key Synthetic Data Scenarios
- **SKU-4421 @ Walmart**: 840-store distribution gap ($4.2M opportunity)
- **SKU-1187 @ Target**: 214 stores OOS 6+ days ($380K/week exposure)
- **SKU-2203 @ Costco**: Promo ROI at 2.1× vs 3.4× benchmark
- **SKU-0892 @ Kroger**: 620-store sell-in whitespace ($2.0M opportunity)
- **SKU-3345 All**: Velocity -12% vs 8-week prior, priced 8% above category

---

## 🎯 App Features

| Feature | Description |
|---------|-------------|
| **Revenue Dashboard** | Live KPIs, weekly revenue vs target chart, market share by retailer, AI alerts — all filterable by retailer |
| **Opportunity Intelligence** | Ranked table of all 7 AI opportunities with type/retailer filters + drill-down panel showing root causes, confidence score, and AI-recommended action |
| **AI Co-Pilot** | Full chat session with persistent history. 6 pre-loaded questions. Regex-routed to detailed analytical responses backed by live DB context |
| **Market Intelligence** | 5-tab module: Field Notes (with AI extraction), Distribution table, Promo ROI tracker, JBP tracker, Deductions |
| **Platform Modules** | Live status of all 9 commercial modules (connected/active/warning states from DB) |
| **Impact & Roadmap** | Before/After comparison, 4 impact metrics, 3-phase product roadmap |

---

## 🔧 Production Deployment Checklist

- [ ] Swap SQLite for PostgreSQL (change one line)
- [ ] Set `debug=False` in `app.py` (already done)
- [ ] Add authentication (JWT/OAuth) middleware to Flask
- [ ] Configure HTTPS via nginx reverse proxy
- [ ] Move AI Co-Pilot to call Anthropic Claude API for live responses
- [ ] Add proper logging (structlog or Python logging module)
- [ ] Containerize with Docker (Dockerfile templates below)
- [ ] Set up CI/CD pipeline

### Docker Quick Start
```dockerfile
# backend/Dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY backend/ ./backend/
COPY frontend/dist/ ./frontend/dist/
RUN pip install flask sqlalchemy psycopg2-binary
EXPOSE 8000
CMD ["python3", "backend/app.py", "8000"]
```

```yaml
# docker-compose.yml
version: "3.8"
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: supplieros
      POSTGRES_USER: supplieros
      POSTGRES_PASSWORD: changeme
    volumes: [pgdata:/var/lib/postgresql/data]
  api:
    build: .
    ports: ["8000:8000"]
    environment:
      DATABASE_URL: postgresql://supplieros:changeme@db:5432/supplieros
    depends_on: [db]
volumes:
  pgdata:
```

---

## 📋 Requirements

- **Python 3.10+** with `flask` (stdlib: sqlite3, json, uuid, datetime)
- **Node.js 18+** with `tsx` and `react` globally installed (for rebuilding frontend only)
- No other dependencies required to run

---

*SupplierOS PoC — Built for demo purposes. Revenue figures are synthetic.*
