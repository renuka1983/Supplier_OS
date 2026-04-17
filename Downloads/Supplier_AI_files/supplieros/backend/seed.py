"""
SupplierOS Synthetic Data Generator
Generates realistic structured + unstructured data for the PoC demo.
"""
import json
import random
import datetime
import math
from database import get_db, init_db

random.seed(42)

# ─── CONSTANTS ────────────────────────────────────────────────────────────────
RETAILERS = [
    {"id": "walmart",  "name": "Walmart",  "short_name": "WMT", "banner_color": "#0071CE", "store_count": 4700, "region": "National"},
    {"id": "target",   "name": "Target",   "short_name": "TGT", "banner_color": "#CC0000", "store_count": 1900, "region": "National"},
    {"id": "costco",   "name": "Costco",   "short_name": "CST", "banner_color": "#E31837", "store_count": 598,  "region": "National"},
    {"id": "kroger",   "name": "Kroger",   "short_name": "KRG", "banner_color": "#004990", "store_count": 2800, "region": "National"},
]

SKUS = [
    # Protein / Bars
    {"id":"SKU-4421","name":"Protein Bar 12pk","category":"Nutrition","subcategory":"Protein Bars","brand":"NutriPeak","upc":"012345678901","unit_cost":8.40,"everyday_price":14.99,"pack_size":"12ct","weight_oz":19.2},
    {"id":"SKU-4218","name":"Granola Cluster Bar 350g","category":"Nutrition","subcategory":"Granola Bars","brand":"NutriPeak","upc":"012345678902","unit_cost":3.10,"everyday_price":5.49,"pack_size":"350g","weight_oz":12.3},
    {"id":"SKU-2109","name":"Whey Protein Powder 2lb","category":"Nutrition","subcategory":"Protein Powder","brand":"NutriPeak","upc":"012345678903","unit_cost":18.00,"everyday_price":34.99,"pack_size":"2lb","weight_oz":32.0},
    # Energy / Beverages
    {"id":"SKU-1187","name":"Energy Drink 24pk","category":"Beverages","subcategory":"Energy","brand":"VoltFuel","upc":"012345678904","unit_cost":14.40,"everyday_price":24.99,"pack_size":"24ct","weight_oz":576.0},
    {"id":"SKU-5530","name":"Sparkling Water 12pk","category":"Beverages","subcategory":"Water","brand":"AquaSpark","upc":"012345678905","unit_cost":5.20,"everyday_price":9.99,"pack_size":"12ct","weight_oz":144.0},
    {"id":"SKU-3801","name":"Cold Brew Coffee 8pk","category":"Beverages","subcategory":"Coffee","brand":"VoltFuel","upc":"012345678906","unit_cost":9.60,"everyday_price":18.99,"pack_size":"8ct","weight_oz":96.0},
    # Snacks
    {"id":"SKU-2203","name":"Granola 500g","category":"Snacks","subcategory":"Granola","brand":"NutriPeak","upc":"012345678907","unit_cost":3.80,"everyday_price":7.49,"pack_size":"500g","weight_oz":17.6},
    {"id":"SKU-9001","name":"Trail Mix 1.5kg","category":"Snacks","subcategory":"Trail Mix","brand":"NutriPeak","upc":"012345678908","unit_cost":7.20,"everyday_price":13.99,"pack_size":"1.5kg","weight_oz":52.9},
    {"id":"SKU-7712","name":"Nut Butter Almond 400g","category":"Snacks","subcategory":"Nut Butter","brand":"NutriPeak","upc":"012345678909","unit_cost":5.60,"everyday_price":11.49,"pack_size":"400g","weight_oz":14.1},
    # Health / Wellness
    {"id":"SKU-0892","name":"Collagen Powder 300g","category":"Wellness","subcategory":"Supplements","brand":"VitaCore","upc":"012345678910","unit_cost":12.00,"everyday_price":29.99,"pack_size":"300g","weight_oz":10.6},
    {"id":"SKU-6601","name":"Vitamin C Gummies 90ct","category":"Wellness","subcategory":"Vitamins","brand":"VitaCore","upc":"012345678911","unit_cost":6.40,"everyday_price":14.99,"pack_size":"90ct","weight_oz":9.0},
    {"id":"SKU-3120","name":"Probiotic Capsules 60ct","category":"Wellness","subcategory":"Supplements","brand":"VitaCore","upc":"012345678912","unit_cost":9.00,"everyday_price":24.99,"pack_size":"60ct","weight_oz":3.5},
    # Dairy Alt
    {"id":"SKU-3345","name":"Oat Milk 6pk","category":"Dairy Alt","subcategory":"Plant Milk","brand":"AquaSpark","upc":"012345678913","unit_cost":7.80,"everyday_price":13.99,"pack_size":"6ct","weight_oz":192.0},
    {"id":"SKU-1402","name":"Barista Oat Milk 12pk","category":"Dairy Alt","subcategory":"Plant Milk","brand":"AquaSpark","upc":"012345678914","unit_cost":14.40,"everyday_price":24.99,"pack_size":"12ct","weight_oz":384.0},
]

# ─── DISTRIBUTION CONFIGS PER RETAILER/SKU ───────────────────────────────────
DIST_CONFIG = {
    ("walmart",  "SKU-4421"): {"auth":2860,"acv":0.61,"oos":0.021,"compliance":0.78,"facings":4},
    ("walmart",  "SKU-1187"): {"auth":4200,"acv":0.89,"oos":0.018,"compliance":0.85,"facings":6},
    ("walmart",  "SKU-2203"): {"auth":3800,"acv":0.81,"oos":0.012,"compliance":0.82,"facings":4},
    ("walmart",  "SKU-7712"): {"auth":4100,"acv":0.87,"oos":0.041,"compliance":0.61,"facings":3},
    ("walmart",  "SKU-3345"): {"auth":4200,"acv":0.89,"oos":0.034,"compliance":0.79,"facings":3},
    ("walmart",  "SKU-5530"): {"auth":4400,"acv":0.94,"oos":0.009,"compliance":0.91,"facings":8},
    ("walmart",  "SKU-9001"): {"auth":3200,"acv":0.68,"oos":0.015,"compliance":0.88,"facings":5},
    ("target",   "SKU-1187"): {"auth":1760,"acv":0.93,"oos":0.082,"compliance":0.87,"facings":6},
    ("target",   "SKU-6601"): {"auth":1650,"acv":0.87,"oos":0.082,"compliance":0.83,"facings":4},
    ("target",   "SKU-2203"): {"auth":1400,"acv":0.74,"oos":0.011,"compliance":0.80,"facings":3},
    ("target",   "SKU-3345"): {"auth":1700,"acv":0.89,"oos":0.034,"compliance":0.76,"facings":3},
    ("target",   "SKU-4421"): {"auth":1500,"acv":0.79,"oos":0.015,"compliance":0.81,"facings":4},
    ("target",   "SKU-1402"): {"auth":420,"acv":0.22,"oos":0.005,"compliance":0.90,"facings":4},
    ("costco",   "SKU-2203"): {"auth":598,"acv":1.0, "oos":0.008,"compliance":0.92,"facings":2},
    ("costco",   "SKU-9001"): {"auth":0,  "acv":0.0, "oos":0.0,  "compliance":0.0, "facings":0},
    ("costco",   "SKU-4421"): {"auth":480,"acv":0.80,"oos":0.010,"compliance":0.88,"facings":3},
    ("kroger",   "SKU-0892"): {"auth":840,"acv":0.30,"oos":0.012,"compliance":0.84,"facings":3},
    ("kroger",   "SKU-3345"): {"auth":2480,"acv":0.89,"oos":0.034,"compliance":0.77,"facings":3},
    ("kroger",   "SKU-6601"): {"auth":2100,"acv":0.75,"oos":0.018,"compliance":0.82,"facings":4},
}

# ─── REVENUE BASE CONFIG ──────────────────────────────────────────────────────
REVENUE_CONFIG = {
    "walmart":  {"base_weekly": 1_050_000, "trend": 0.008, "seasonality": True},
    "target":   {"base_weekly":   640_000, "trend": 0.006, "seasonality": True},
    "costco":   {"base_weekly":   580_000, "trend": 0.007, "seasonality": False},
    "kroger":   {"base_weekly":   520_000, "trend": 0.005, "seasonality": True},
}

SKU_REVENUE_SHARE = {
    "SKU-4421": 0.14, "SKU-1187": 0.13, "SKU-2203": 0.11, "SKU-3345": 0.10,
    "SKU-7712": 0.09, "SKU-5530": 0.08, "SKU-9001": 0.07, "SKU-4218": 0.06,
    "SKU-6601": 0.06, "SKU-0892": 0.05, "SKU-3120": 0.04, "SKU-2109": 0.04,
    "SKU-3801": 0.02, "SKU-1402": 0.01,
}

def week_dates(n_weeks=26):
    """Return list of week-ending dates (Saturdays)."""
    today = datetime.date.today()
    # Go back to last Saturday
    days_back = (today.weekday() + 2) % 7
    last_sat = today - datetime.timedelta(days=days_back)
    return [last_sat - datetime.timedelta(weeks=i) for i in range(n_weeks-1, -1, -1)]

def seasonal_factor(date):
    """Return seasonal multiplier for a date."""
    month = date.month
    factors = {1:0.88, 2:0.90, 3:0.95, 4:0.98, 5:1.02, 6:1.05,
               7:0.97, 8:1.10, 9:1.05, 10:1.08, 11:1.20, 12:1.15}
    return factors.get(month, 1.0)

def generate_weekly_sales(conn, weeks):
    """Generate 26 weeks of weekly POS data for all retailer/SKU combos."""
    print("[DATA] Generating weekly sales...")
    rows = []
    for r in RETAILERS:
        cfg = REVENUE_CONFIG[r["id"]]
        for i, week in enumerate(weeks):
            trend_mult = 1 + (cfg["trend"] * i)
            seas = seasonal_factor(week) if cfg["seasonality"] else 1.0
            # Weekly total with noise
            total_weekly = cfg["base_weekly"] * trend_mult * seas * random.gauss(1.0, 0.03)
            for sku in SKUS:
                share = SKU_REVENUE_SHARE.get(sku["id"], 0.03)
                # Some SKUs not carried at all retailers
                dist_key = (r["id"], sku["id"])
                dist = DIST_CONFIG.get(dist_key)
                if dist is None:
                    if random.random() < 0.3:  # 30% chance of some presence
                        acv = random.uniform(0.1, 0.5)
                    else:
                        continue
                    stores_total = r["store_count"]
                    stores_selling = int(stores_total * acv * random.gauss(1, 0.05))
                else:
                    acv = dist["acv"]
                    stores_total = r["store_count"]
                    stores_selling = int(dist["auth"] * random.gauss(1, 0.03))

                if stores_selling <= 0:
                    continue

                sku_rev = total_weekly * share * random.gauss(1.0, 0.05)
                # Promo flag (20% weeks)
                promo = random.random() < 0.20
                promo_type = None
                if promo:
                    promo_type = random.choice(["TPR", "endcap", "BOGO", "rollback"])
                    sku_rev *= random.uniform(1.15, 1.45)

                avg_price = sku["everyday_price"] * (0.85 if promo else 1.0) * random.gauss(1, 0.01)
                units = int(sku_rev / avg_price)
                velocity = round(units / max(stores_selling, 1), 3)

                rows.append((
                    r["id"], sku["id"], week.isoformat(),
                    units, round(sku_rev, 2), round(avg_price, 2),
                    1 if promo else 0, promo_type,
                    stores_selling, stores_total, velocity
                ))

    conn.executemany("""
        INSERT OR IGNORE INTO weekly_sales
        (retailer_id, sku_id, week_ending, units_sold, revenue, avg_selling_price,
         promo_flag, promo_type, stores_selling, stores_total, velocity_per_store)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
    """, rows)
    print(f"[DATA] Inserted {len(rows)} weekly sales records")

def generate_distribution(conn, as_of_date):
    """Generate current distribution snapshot."""
    print("[DATA] Generating distribution data...")
    rows = []
    today = as_of_date.isoformat()
    for r in RETAILERS:
        for sku in SKUS:
            key = (r["id"], sku["id"])
            dist = DIST_CONFIG.get(key)
            if dist is None:
                if random.random() < 0.4:
                    auth = int(r["store_count"] * random.uniform(0.3, 0.7))
                    dist = {
                        "auth": auth, "acv": auth / r["store_count"],
                        "oos": random.uniform(0.01, 0.05),
                        "compliance": random.uniform(0.70, 0.92),
                        "facings": random.randint(2, 6)
                    }
                else:
                    continue
            oos_stores = int(dist["auth"] * dist["oos"])
            rows.append((
                r["id"], sku["id"],
                dist["auth"], r["store_count"],
                round(dist["acv"] * 100, 1),
                round(dist["oos"] * 100, 2),
                oos_stores,
                round(dist["compliance"] * 100, 1),
                dist["facings"],
                today
            ))
    conn.executemany("""
        INSERT OR IGNORE INTO distribution
        (retailer_id, sku_id, authorized_stores, total_stores,
         acv_percentage, oos_rate, oos_stores, planogram_compliance,
         shelf_facings, as_of_date)
        VALUES (?,?,?,?,?,?,?,?,?,?)
    """, rows)
    print(f"[DATA] Inserted {len(rows)} distribution records")

def generate_market_share(conn, weeks):
    """Generate market share data."""
    print("[DATA] Generating market share...")
    rows = []
    base_shares = {
        ("walmart",  "SKU-4421"): (11.2, -0.05),
        ("walmart",  "SKU-1187"): (8.4,   0.02),
        ("walmart",  "SKU-3345"): (6.8,  -0.08),
        ("walmart",  "SKU-7712"): (5.2,  -0.03),
        ("target",   "SKU-1187"): (14.3, -0.12),
        ("target",   "SKU-2203"): (9.1,   0.03),
        ("target",   "SKU-3345"): (7.4,  -0.06),
        ("costco",   "SKU-2203"): (18.4,  0.04),
        ("costco",   "SKU-9001"): (0.0,   0.0),
        ("kroger",   "SKU-0892"): (4.2,   0.08),
        ("kroger",   "SKU-3345"): (6.1,  -0.04),
    }
    for (rid, skid), (base_share, weekly_trend) in base_shares.items():
        sku = next((s for s in SKUS if s["id"] == skid), None)
        if not sku:
            continue
        current_share = base_share
        for i, week in enumerate(weeks):
            noise = random.gauss(0, 0.15)
            current_share = max(0.5, current_share + weekly_trend + noise)
            prior_share = current_share - (weekly_trend + noise)
            rows.append((
                rid, skid, sku["category"],
                week.isoformat(),
                round(current_share, 2),
                round(current_share * 0.94, 2),
                round(current_share - prior_share, 3)
            ))
    conn.executemany("""
        INSERT OR IGNORE INTO market_share
        (retailer_id, sku_id, category, week_ending,
         dollar_share, unit_share, share_change_pp)
        VALUES (?,?,?,?,?,?,?)
    """, rows)
    print(f"[DATA] Inserted {len(rows)} market share records")

def generate_promotions(conn, weeks):
    """Generate promotion history and planned events."""
    print("[DATA] Generating promotions...")
    promos = [
        ("walmart","SKU-4421","rollback",8,14,"planned",18.5,11.2,0.0,3.8,120000,None,None),
        ("walmart","SKU-5530","TPR",6,2,"completed",7.99,20.0,1.34,1.5,42000,1.34,1.6),
        ("walmart","SKU-7712","endcap",4,0,"completed",9.99,13.0,0.92,1.8,28000,0.92,1.1),
        ("target","SKU-1187","TPR",6,4,"completed",19.99,20.0,1.62,2.0,55000,1.62,2.4),
        ("target","SKU-2203","endcap",4,2,"completed",5.99,20.0,1.28,1.6,22000,1.28,1.4),
        ("target","SKU-3345","TPR",4,0,"completed",10.99,21.0,0.88,1.8,18000,0.88,1.0),
        ("costco","SKU-2203","road_show",4,10,"planned",5.99,20.0,0.0,3.2,180000,2.1,3.4),
        ("costco","SKU-9001","road_show",4,10,"planned",11.99,14.0,0.0,4.2,160000,None,None),
        ("kroger","SKU-6601","TPR",4,2,"completed",11.99,20.0,1.44,1.8,32000,1.44,1.6),
        ("kroger","SKU-3345","endcap",4,0,"completed",10.99,21.0,1.10,1.6,15000,1.10,1.3),
    ]
    today = datetime.date.today()
    rows = []
    for p in promos:
        rid, skid, ptype, dur_wks, wks_out, status, price, disc, lift_tgt, roi_tgt, spend, lift_act, roi_act = p
        sku = next((s for s in SKUS if s["id"] == skid), None)
        if not sku:
            continue
        start = today + datetime.timedelta(weeks=wks_out)
        end   = start + datetime.timedelta(weeks=dur_wks)
        incr  = int(spend / sku["everyday_price"] * (lift_act or 0)) if lift_act else None
        rows.append((
            rid, skid, ptype,
            start.isoformat(), end.isoformat(),
            price, disc, lift_act, lift_tgt, roi_act, roi_tgt,
            spend, incr, status
        ))
    conn.executemany("""
        INSERT OR IGNORE INTO promotions
        (retailer_id, sku_id, promo_type, start_date, end_date,
         promo_price, discount_pct, lift_actual, lift_target,
         roi_actual, roi_target, trade_spend, incremental_units, status)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    """, rows)
    print(f"[DATA] Inserted {len(rows)} promotion records")

def generate_opportunities(conn):
    """Generate AI-identified revenue opportunities."""
    print("[DATA] Generating AI opportunities...")
    opps = [
      {
        "sku_id":"SKU-4421","retailer_id":"walmart",
        "title":"Expand SKU-4421 Distribution — 840-Store Gap",
        "opportunity_type":"Expand","estimated_value":4200000,"confidence_score":92,
        "priority_rank":1,"status":"open",
        "description":"SKU-4421 Protein Bar 12pk is authorized in only 61% of eligible Walmart stores. 840 stores carry comparable competitor SKUs but have never stocked SKU-4421.",
        "action_text":"Pitch SKU-4421 for distribution expansion into 840 Walmart stores in the Southeast and Midwest. Lead with velocity data from 2,860 existing doors as proof of consumer demand. Prepare buyer deck with Luminate velocity index and competitive authorization data.",
        "impact_text":"$4.2M incremental annual revenue modeled at current category velocity for comparable items across the target store set.",
        "root_causes":json.dumps([
          {"icon":"📊","title":"Top-15% velocity where stocked","body":"SKU-4421 ranks in the top 15% of velocity for its category at stores where it is currently active — confirming strong consumer demand where distribution is present."},
          {"icon":"🗺","title":"840 stores never authorized","body":"These Walmart stores carry comparable SKUs from two leading competitors but have never received a sell-in pitch for SKU-4421 — a pure coverage gap, not a performance issue."},
          {"icon":"⚔️","title":"Competitors present in 89–94% of gap stores","body":"The two leading competitors are authorized in 94% and 89% of those 840 stores, confirming category demand is active and the gap is winnable."},
        ]),
        "metrics":json.dumps({"dist":"61%","velocity":"+18% vs cat","oos_rate":"2.1%","comp_presence":"94%"}),
      },
      {
        "sku_id":"SKU-1187","retailer_id":"target",
        "title":"Resolve SKU-1187 OOS — 214 Target Stores",
        "opportunity_type":"Fix","estimated_value":3100000,"confidence_score":88,
        "priority_rank":2,"status":"open",
        "description":"SKU-1187 Energy Drink 24pk has an 8.2% OOS rate across 214 Target stores for 6+ days. Lost 1.4pp market share vs Q2. Estimated $380K/week revenue exposure.",
        "action_text":"Resolve the 8.2% OOS rate at Target immediately — propose a 12-week service level agreement with weekly in-stock reporting to the buyer. Simultaneously pitch a TPR to recover share lost during the competitor promo window.",
        "impact_text":"$3.1M annual revenue recovery. OOS alone is costing $380K per week across 214 stores if left unresolved.",
        "root_causes":json.dumps([
          {"icon":"📉","title":"1.4pp share lost since Q2","body":"SKU-1187 share declined 1.4pp at Target between Q2 and current. Competitor Brand X gained 0.9pp during a 6-week TPR you did not match."},
          {"icon":"🚫","title":"8.2% OOS rate across 214 stores","body":"214 Target stores have been out of stock for 6+ days. At current velocity this is ~$380K in lost revenue per week."},
          {"icon":"💰","title":"Promo gap vs competitor","body":"You are running promos at half the frequency of your primary competitor. Two missed TPR windows gave competitor shelf and basket share."},
        ]),
        "metrics":json.dumps({"dist":"93%","velocity":"-8% WoW","oos_rate":"8.2%","comp_presence":"97%"}),
      },
      {
        "sku_id":"SKU-2203","retailer_id":"costco",
        "title":"Reallocate Costco Trade Spend — SKU-2203 ROI at 2.1×",
        "opportunity_type":"Trade","estimated_value":2800000,"confidence_score":79,
        "priority_rank":3,"status":"open",
        "description":"Costco promo ROI on SKU-2203 is 2.1× vs portfolio average of 3.4×. Wrong promo depth and calendar timing. SKU-9001 Q4 road show slot projected at 4.2×.",
        "action_text":"Shift $180K trade spend from SKU-2203 end-cap promos to SKU-9001 Q4 road show activation. Renegotiate SKU-2203 promo depth from 18% to 22% off to hit category benchmark.",
        "impact_text":"$2.8M improvement in promo efficiency — recovering underperforming trade spend and redeploying to higher-ROI vehicle.",
        "root_causes":json.dumps([
          {"icon":"📊","title":"ROI 2.1× vs 3.4× portfolio average","body":"Current Costco promotional ROI on SKU-2203 is 2.1× — 38% below the portfolio average and below the 3× threshold required."},
          {"icon":"🎯","title":"Wrong promo depth and timing","body":"18% promo depth is below the 22% category norm. Event timing clashed with back-to-school — high-velocity period that reduces incremental lift."},
          {"icon":"🚀","title":"Higher-ROI vehicle available","body":"SKU-9001 Trail Mix 1.5kg has a Q4 road show slot. Comparable items generated 4.2× ROI — redeploying spend has clear upside."},
        ]),
        "metrics":json.dumps({"dist":"100%","velocity":"+3% vs cat","oos_rate":"0.8%","comp_presence":"91%"}),
      },
      {
        "sku_id":"SKU-0892","retailer_id":"kroger",
        "title":"Sell-In SKU-0892 to 620 Kroger Stores",
        "opportunity_type":"Sell-in","estimated_value":2000000,"confidence_score":84,
        "priority_rank":4,"status":"open",
        "description":"SKU-0892 Collagen Powder has zero authorization in 620 Kroger stores. Category growing +31% YoY at Kroger with strong demographic fit. Competitor at only 76% ACV.",
        "action_text":"Schedule sell-in pitch for SKU-0892 across 620 Kroger stores in Midwest and Southeast. Use category velocity data and demographic alignment from shopper card data to build the business case.",
        "impact_text":"$2.0M incremental annual revenue at conservative 60% sell-through of target distribution.",
        "root_causes":json.dumps([
          {"icon":"🗺","title":"620 stores — zero authorization","body":"620 Kroger stores have active category sets with competitor SKUs but have never received an authorization pitch for SKU-0892."},
          {"icon":"👥","title":"Strong demographic fit","body":"Kroger shopper card data shows the collagen supplement category growing +31% YoY in these stores. SKU-0892 is better positioned on price and format."},
          {"icon":"📈","title":"Category tailwind confirmed","body":"Collagen supplement velocity at authorized Kroger locations is +22% YoY, with strong basket attachment to other health supplement SKUs."},
        ]),
        "metrics":json.dumps({"dist":"28%","velocity":"+22% where stocked","oos_rate":"1.2%","comp_presence":"76%"}),
      },
      {
        "sku_id":"SKU-3345","retailer_id":None,
        "title":"Fix SKU-3345 Velocity Decline — All Retailers",
        "opportunity_type":"Fix","estimated_value":1800000,"confidence_score":71,
        "priority_rank":5,"status":"open",
        "description":"SKU-3345 Oat Milk 6pk velocity is -12% vs 8-week prior across all retailers while category grew +6%. Priced 8% above category average. Facing count reduced at Walmart.",
        "action_text":"Investigate planogram placement and facing count across all retailers. Run a competitive price check — data suggests you are 8% above category average. Evaluate a promotional reset.",
        "impact_text":"$1.8M annual revenue recovery if velocity gap is closed to category average.",
        "root_causes":json.dumps([
          {"icon":"📉","title":"Velocity -12% vs 8-week prior","body":"SKU-3345 velocity has declined 12% over 8 weeks while oat milk category grew 6% — an 18-point gap worsening each week."},
          {"icon":"💲","title":"Price 8% above category average","body":"A new entrant launched at 12% below your price 10 weeks ago, which correlates directly with your velocity decline."},
          {"icon":"📐","title":"Facing count reduced at Walmart","body":"At Walmart, facing count was reduced from 4 to 2 during the last modular reset. Competitor maintained 4 facings."},
        ]),
        "metrics":json.dumps({"dist":"89%","velocity":"-12% vs 8wk","oos_rate":"3.4%","comp_presence":"95%"}),
      },
      {
        "sku_id":"SKU-7712","retailer_id":"walmart",
        "title":"Fix Walmart Planogram Compliance — SKU-7712",
        "opportunity_type":"Fix","estimated_value":1900000,"confidence_score":76,
        "priority_rank":6,"status":"open",
        "description":"SKU-7712 Nut Butter planogram compliance is 61% vs competitor 88% at Walmart. Pure execution gap concentrated in Southeast and Mid-Atlantic regions.",
        "action_text":"Deploy broker network to audit and reset planogram compliance in bottom 500 stores. Set weekly compliance reporting target of 85% within 6 weeks.",
        "impact_text":"$1.9M annual revenue recovery — closing compliance gap to competitor level at current velocity.",
        "root_causes":json.dumps([
          {"icon":"📐","title":"61% planogram compliance","body":"Only 61% of Walmart stores have SKU-7712 correctly placed. Competitor achieves 88% compliance, capturing the premium eye-level position."},
          {"icon":"🔍","title":"Broker execution gap identified","body":"Lowest compliance clusters in Southeast and Mid-Atlantic — both managed by the same broker who lacks a dedicated retail execution team."},
        ]),
        "metrics":json.dumps({"dist":"88%","velocity":"+4% vs cat","oos_rate":"4.1%","comp_presence":"92%"}),
      },
      {
        "sku_id":"SKU-9001","retailer_id":"costco",
        "title":"Sell-In SKU-9001 for Costco Q4 Road Show",
        "opportunity_type":"Sell-in","estimated_value":1700000,"confidence_score":82,
        "priority_rank":7,"status":"open",
        "description":"SKU-9001 Trail Mix 1.5kg has no Costco authorization. Q4 road show slot is available. Comparable items generated 4.2× ROI. Buyer pre-qualified the item.",
        "action_text":"Submit SKU-9001 for Costco Q4 road show. Buyer has indicated category interest for the holiday gifting window. Comparable items in this slot generated 4.2× ROI.",
        "impact_text":"$1.7M projected road show revenue with 4.2× projected ROI based on comparable item performance.",
        "root_causes":json.dumps([
          {"icon":"📅","title":"Q4 road show slot available","body":"Costco has an open road show slot in November for trail mix and snacking. Buyer pre-qualified SKU-9001 based on format and price point."},
          {"icon":"📊","title":"4.2× projected ROI","body":"Comparable trail mix items in Q4 Costco road shows averaged 4.2× promotional ROI over 2 years — above your 3.4× portfolio benchmark."},
        ]),
        "metrics":json.dumps({"dist":"0%","velocity":"New item","oos_rate":"N/A","comp_presence":"81%"}),
      },
    ]
    for o in opps:
        conn.execute("""
            INSERT OR IGNORE INTO ai_opportunities
            (sku_id, retailer_id, title, opportunity_type, estimated_value,
             confidence_score, priority_rank, status, description,
             action_text, impact_text, root_causes, metrics)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            o["sku_id"], o.get("retailer_id"), o["title"], o["opportunity_type"],
            o["estimated_value"], o["confidence_score"], o["priority_rank"],
            o["status"], o["description"], o["action_text"], o["impact_text"],
            o["root_causes"], o["metrics"]
        ))
    print(f"[DATA] Inserted {len(opps)} AI opportunities")

def generate_alerts(conn):
    """Generate AI alerts."""
    print("[DATA] Generating AI alerts...")
    alerts = [
      {"sku_id":"SKU-1187","retailer_id":"target","alert_type":"oos","severity":"critical",
       "title":"SKU-1187 Out-of-Stock — 214 Target Stores","estimated_impact":380000,
       "message":"SKU-1187 Energy Drink 24pk is out of stock in 214 Target stores for 6+ days. Estimated revenue exposure is $380K/week if unresolved. Immediate replenishment required."},
      {"sku_id":"SKU-4421","retailer_id":"walmart","alert_type":"share_decline","severity":"warning",
       "title":"SKU-4421 Share Dip at Walmart (-0.9pp WoW)","estimated_impact":180000,
       "message":"SKU-4421 market share declined 0.9pp WoW at Walmart. Competitor running promotional event across 620 stores. Action required to protect distribution position."},
      {"sku_id":"SKU-2203","retailer_id":"costco","alert_type":"promo_underperformance","severity":"warning",
       "title":"Costco Promo ROI Below Threshold — SKU-2203","estimated_impact":90000,
       "message":"Current TPR event on SKU-2203 at Costco is generating 2.1× ROI vs 3.4× benchmark. SupplierOS recommends pulling spend and redirecting to higher-performing vehicle."},
      {"sku_id":"SKU-3345","retailer_id":None,"alert_type":"velocity_decline","severity":"warning",
       "title":"SKU-3345 Velocity -12% vs 8-Week Prior","estimated_impact":150000,
       "message":"SKU-3345 Oat Milk 6pk velocity declining -12% vs 8-week prior across all retailers. Category grew +6% in the same period. Price gap vs new entrant identified."},
      {"sku_id":"SKU-0892","retailer_id":"kroger","alert_type":"whitespace","severity":"info",
       "title":"Whitespace Confirmed — SKU-0892 at Kroger","estimated_impact":2000000,
       "message":"620 Kroger stores identified as eligible for SKU-0892 distribution expansion. Category growing +31% YoY. Buyer pitch deck recommended."},
      {"sku_id":"SKU-6601","retailer_id":"target","alert_type":"oos","severity":"warning",
       "title":"SKU-6601 OOS Rising at Target (8.2%)","estimated_impact":95000,
       "message":"SKU-6601 Vitamin C Gummies OOS rate reached 8.2% at Target — up from 3.1% two weeks ago. Service level review recommended."},
    ]
    for a in alerts:
        conn.execute("""
            INSERT OR IGNORE INTO ai_alerts
            (sku_id, retailer_id, alert_type, severity, title, message, estimated_impact)
            VALUES (?,?,?,?,?,?,?)
        """, (a["sku_id"], a.get("retailer_id"), a["alert_type"], a["severity"],
              a["title"], a["message"], a.get("estimated_impact")))
    print(f"[DATA] Inserted {len(alerts)} AI alerts")

def generate_jbp(conn):
    """Generate JBP targets."""
    print("[DATA] Generating JBP targets...")
    today = datetime.date.today()
    year = today.year
    entries = [
        ("walmart", year, 2, 52000000, 54100000, 20.5, 21.3, 85.0, 87.0, "completed"),
        ("walmart", year, 3, 55000000, 56800000, 21.0, 21.8, 86.0, 88.0, "completed"),
        ("walmart", year, 4, 58000000, None, 21.5, None, 87.0, None, "in_progress"),
        ("target",  year, 2, 29000000, 31800000, 16.5, 16.8, 82.0, 83.0, "completed"),
        ("target",  year, 3, 30000000, 31200000, 16.8, 16.5, 83.0, 82.5, "completed"),
        ("target",  year, 4, 32000000, None, 17.0, None, 84.0, None, "in_progress"),
        ("costco",  year, 2, 26000000, 28600000, 21.8, 22.1, 90.0, 91.0, "completed"),
        ("costco",  year, 4, 30000000, None, 22.5, None, 91.0, None, "in_progress"),
        ("kroger",  year, 2, 25000000, 27800000, 13.0, 13.2, 80.0, 81.0, "completed"),
        ("kroger",  year, 4, 27000000, None, 13.5, None, 81.0, None, "in_progress"),
    ]
    for e in entries:
        conn.execute("""
            INSERT OR IGNORE INTO jbp_targets
            (retailer_id, year, quarter, revenue_target, revenue_actual,
             share_target, share_actual, distribution_target, distribution_actual, status)
            VALUES (?,?,?,?,?,?,?,?,?,?)
        """, e)
    print(f"[DATA] Inserted {len(entries)} JBP records")

def generate_deductions(conn):
    """Generate deduction/chargeback data."""
    print("[DATA] Generating deductions...")
    today = datetime.date.today()
    deductions = [
        ("walmart","WMT-2024-08741","shortage_claim",12450.00,12450.00,"pending",
         today-datetime.timedelta(days=14),today+datetime.timedelta(days=16),
         "Invalid shortage claim — shipment confirmed delivered via BOL #44821"),
        ("walmart","WMT-2024-08690","shortage_claim",8200.00,8200.00,"disputed",
         today-datetime.timedelta(days=28),today+datetime.timedelta(days=2),
         "Partial shortage claim — DC scanning error identified"),
        ("target","TGT-2024-11203","price_discrepancy",3800.00,3800.00,"pending",
         today-datetime.timedelta(days=7),today+datetime.timedelta(days=23),
         "Price discrepancy on SKU-1187 — invoice price vs PO price mismatch"),
        ("target","TGT-2024-11098","defective_allowance",2100.00,None,"resolved",
         today-datetime.timedelta(days=45),None,
         "Defective product claim resolved — credit issued"),
        ("kroger","KRG-2024-05512","shortage_claim",6700.00,6700.00,"pending",
         today-datetime.timedelta(days=5),today+datetime.timedelta(days=25),
         "New shortage claim — investigating with logistics team"),
    ]
    for d in deductions:
        conn.execute("""
            INSERT OR IGNORE INTO deductions
            (retailer_id, claim_number, claim_type, claim_amount, dispute_amount,
             status, claim_date, due_date, description)
            VALUES (?,?,?,?,?,?,?,?,?)
        """, d)
    print(f"[DATA] Inserted {len(deductions)} deductions")

def generate_field_notes(conn):
    """Generate unstructured field notes — store visit reports, audit notes."""
    print("[DATA] Generating field notes (unstructured)...")
    today = datetime.date.today()
    notes = [
      {
        "retailer_id":"walmart","sku_id":"SKU-7712","store_id":"WMT-4821",
        "note_type":"store_audit","author":"Mike Chen, Market Manager",
        "content":"""Store Visit Report — Walmart Store #4821 (Dallas, TX)
Date: {d}
Products audited: SKU-7712 (Nut Butter Almond 400g), SKU-4421 (Protein Bar 12pk)

OBSERVATIONS:
- SKU-7712 was NOT in planogram position. Found product stocked on bottom shelf, position 4 from left. Should be shelf 2, position 1 (eye level). Competitor 'NatureCraft Almond Butter' was in our planogram slot.
- SKU-4421 out of stock in main aisle. Single facing visible in endcap overflow area. Asked department manager — said product came off replenishment truck but hasn't been worked yet.
- Store layout changed slightly — health section expanded by 8 feet.

PHOTOS TAKEN: Shelf audit photos 1-6 attached.

ACTION ITEMS:
1. Reset SKU-7712 to correct planogram position (immediate)
2. Escalate SKU-4421 OOS to DM — replenishment timing issue
3. Flag shelf expansion opportunity to HQ — potential for additional facing negotiation

MANAGER FEEDBACK:
Store manager (Linda Park) said our rep hasn't visited in 6 weeks. Competitor rep visits weekly. She seems receptive to endcap conversation if we can present the category data.""".format(d=(today-datetime.timedelta(days=3)).isoformat()),
        "extracted_data":json.dumps({"compliance_issue":True,"oos_skus":["SKU-4421"],"planogram_violation":"SKU-7712","competitor_in_slot":"NatureCraft Almond Butter","store_manager":"Linda Park","opportunity":"shelf_expansion"}),
        "sentiment":"negative","action_items":json.dumps(["Reset SKU-7712 planogram","Escalate SKU-4421 OOS","Pursue shelf expansion"]),"visit_date":(today-datetime.timedelta(days=3)).isoformat()
      },
      {
        "retailer_id":"target","sku_id":"SKU-1187","store_id":"TGT-0281",
        "note_type":"store_audit","author":"Sarah Kim, Regional Account Manager",
        "content":"""Target Store #0281 Audit — San Francisco, CA
Visit Date: {d}

ENERGY DRINK AISLE:
Critical OOS situation on SKU-1187. Shelf completely empty — 6 facings all missing. Checked backroom with team lead — product not in store. Last delivery was Tuesday (4 days ago) and SKU-1187 was NOT on the truck manifest.

COMPETITIVE CONTEXT:
Competitor 'VoltMax Energy' has a TPR tag on their 24pk — looks like $2 off. Their shelf is fully stocked. This explains some of our recent share decline in this category.

VITAMIN/SUPPLEMENT SECTION:
SKU-6601 Vitamin C Gummies — low stock, maybe 8 units left. Flagged for immediate replenishment order.

OVERALL STORE HEALTH:
Target team was helpful but understaffed. They mentioned they are not always able to work the freight quickly when understaffed.

RECOMMENDED NEXT STEPS:
- Emergency replenishment order for SKU-1187 — cannot wait for regular cycle
- Investigate if this is a system ordering issue (store might have SKU-1187 on 'low velocity' status incorrectly)
- Consider if we need to discuss an in-stock guarantee with the Target buyer""".format(d=(today-datetime.timedelta(days=1)).isoformat()),
        "extracted_data":json.dumps({"oos_skus":["SKU-1187","SKU-6601"],"competitor_promo":"VoltMax Energy TPR $2 off","root_cause":"delivery_omission","urgency":"critical"}),
        "sentiment":"negative","action_items":json.dumps(["Emergency replenishment for SKU-1187","Replenish SKU-6601","Investigate ordering system status","Discuss in-stock guarantee with buyer"]),"visit_date":(today-datetime.timedelta(days=1)).isoformat()
      },
      {
        "retailer_id":"costco","sku_id":"SKU-2203","store_id":"CST-0144",
        "note_type":"buyer_meeting","author":"James Rodriguez, VP Sales",
        "content":"""Costco Buyer Meeting Notes — Issaquah HQ
Meeting with: David Lin (Category Manager, Health & Wellness)
Date: {d}
Duration: 45 minutes

AGENDA COVERED:
1. Q3 performance review — Granola category
2. SKU-2203 road show feedback
3. SKU-9001 Trail Mix Q4 opportunity

KEY FEEDBACK FROM BUYER:
David mentioned that our SKU-2203 road show in Q3 'underperformed expectations.' He noted that the promo depth (18% off) 'didn't excite members the way we see with competing brands.' He confirmed that NutriMax ran 22% off on their comparable granola item and saw much stronger pull-through.

On SKU-9001 Trail Mix — David was POSITIVE. He said the 1.5kg format is 'exactly what Costco members want' for trail mix, and the price point at $13.99 works for their margin requirements. He suggested the November road show window and said he would provisionally hold the slot pending our formal submission.

RELATIONSHIP STATUS: GOOD. David is a long-term relationship — 4 years. He gave us candid feedback which means he values the partnership.

MY ASSESSMENT: We should absolutely pursue the SKU-9001 road show and NOT run another SKU-2203 event until we renegotiate the promo depth to 22%+ minimum.""".format(d=(today-datetime.timedelta(days=10)).isoformat()),
        "extracted_data":json.dumps({"buyer_name":"David Lin","buyer_sentiment":"positive_on_9001","sku_2203_feedback":"underperformed_depth_issue","sku_9001_status":"slot_provisionally_held","recommended_promo_depth":0.22,"road_show_window":"November"}),
        "sentiment":"mixed","action_items":json.dumps(["Submit SKU-9001 Q4 road show formally","Renegotiate SKU-2203 promo depth to 22%+","Do not book SKU-2203 road show at current depth"]),"visit_date":(today-datetime.timedelta(days=10)).isoformat()
      },
      {
        "retailer_id":"kroger","sku_id":"SKU-0892","store_id":"KRG-2105",
        "note_type":"store_audit","author":"Alice Thompson, Broker Rep",
        "content":"""Kroger Audit Report — Cincinnati Region Stores
Stores visited: KRG-2105, KRG-2108, KRG-2112
Date: {d}

SUPPLEMENT SECTION REVIEW:
All three stores visited DO NOT carry SKU-0892 (Collagen Powder 300g). The supplement section is well-stocked with competitor collagen products from two brands:
- 'VitaColl' Collagen 300g — $27.99 (prominent placement, eye level)
- 'HealthFirst' Collagen 250g — $24.99 (shelf level)

SHOPPER OBSERVATION:
Spent 20 minutes in supplement section. Observed 8 shoppers picking up collagen products. VitaColl was the most selected. Our product is not present to compete.

CATEGORY GROWTH SIGNALS:
Section has been recently expanded — fresh shelf labels and new pegboard. Store manager said the supplement category 'has been growing fast' and they recently reset to add more linear footage.

OPPORTUNITY ASSESSMENT:
Clear whitespace opportunity. These stores want our product if we can make the pitch. The category set looks like it could accommodate 1-2 new collagen SKUs without requiring a planogram change.""".format(d=(today-datetime.timedelta(days=5)).isoformat()),
        "extracted_data":json.dumps({"sku_present":False,"competitor_skus":["VitaColl","HealthFirst"],"section_recently_expanded":True,"category_growth":"strong","whitespace_stores":["KRG-2105","KRG-2108","KRG-2112"]}),
        "sentiment":"positive","action_items":json.dumps(["Initiate Kroger sell-in pitch for SKU-0892","Prepare category growth data for buyer","Visit 15 more Cincinnati region stores for wider data"]),"visit_date":(today-datetime.timedelta(days=5)).isoformat()
      },
    ]
    for n in notes:
        conn.execute("""
            INSERT OR IGNORE INTO field_notes
            (retailer_id, sku_id, store_id, note_type, author, content,
             extracted_data, sentiment, action_items, visit_date)
            VALUES (?,?,?,?,?,?,?,?,?,?)
        """, (n["retailer_id"], n.get("sku_id"), n.get("store_id"), n["note_type"],
              n["author"], n["content"], n.get("extracted_data"),
              n.get("sentiment"), n.get("action_items"), n["visit_date"]))
    print(f"[DATA] Inserted {len(notes)} field notes")

def seed_all():
    """Run full data seeding."""
    print("[SEED] Starting full data seed...")
    init_db()
    weeks = week_dates(26)
    with get_db() as conn:
        # Clear existing data
        for table in ["chat_messages","chat_sessions","field_notes","deductions",
                      "jbp_targets","ai_alerts","ai_opportunities","promotions",
                      "market_share","distribution","weekly_sales","skus","retailers"]:
            conn.execute(f"DELETE FROM {table}")
        # Insert master data
        conn.executemany(
            "INSERT INTO retailers (id,name,short_name,banner_color,store_count,region) VALUES (?,?,?,?,?,?)",
            [(r["id"],r["name"],r["short_name"],r["banner_color"],r["store_count"],r["region"]) for r in RETAILERS]
        )
        conn.executemany(
            "INSERT INTO skus (id,name,category,subcategory,brand,upc,unit_cost,everyday_price,pack_size,weight_oz) VALUES (?,?,?,?,?,?,?,?,?,?)",
            [(s["id"],s["name"],s["category"],s["subcategory"],s["brand"],s["upc"],s["unit_cost"],s["everyday_price"],s["pack_size"],s["weight_oz"]) for s in SKUS]
        )
        generate_weekly_sales(conn, weeks)
        generate_distribution(conn, datetime.date.today())
        generate_market_share(conn, weeks)
        generate_promotions(conn, weeks)
        generate_opportunities(conn)
        generate_alerts(conn)
        generate_jbp(conn)
        generate_deductions(conn)
        generate_field_notes(conn)
    print("[SEED] ✅ All data seeded successfully!")

if __name__ == "__main__":
    seed_all()
