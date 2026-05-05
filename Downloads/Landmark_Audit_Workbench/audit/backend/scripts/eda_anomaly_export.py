"""
Exploratory summaries for a Landmark audit Excel export (after UI Export).

Expects sheets: GL_with_Anomaly (preferred) or Anomaly_Labels.

Usage:
  pip install pandas matplotlib openpyxl
  python scripts/eda_anomaly_export.py --xlsx ../Landmark_Audit_v11_2026-05-05.xlsx --out eda_out
"""
from __future__ import annotations

import argparse
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd


def _load_main(path: Path) -> pd.DataFrame:
    xl = pd.ExcelFile(path)
    if "GL_with_Anomaly" in xl.sheet_names:
        return pd.read_excel(path, sheet_name="GL_with_Anomaly")
    if "Anomaly_Labels" in xl.sheet_names:
        return pd.read_excel(path, sheet_name="Anomaly_Labels")
    raise SystemExit(f"No GL_with_Anomaly or Anomaly_Labels in {path}. Sheets: {xl.sheet_names}")


def main() -> None:
    parser = argparse.ArgumentParser(description="EDA tables + plots for exported audit workbook.")
    parser.add_argument("--xlsx", required=True, type=Path, help="Path to exported .xlsx")
    parser.add_argument("--out", default="eda_out", type=Path, help="Output directory")
    parser.add_argument("--top-n", dest="top_n", type=int, default=15)
    args = parser.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    df = _load_main(args.xlsx)

    flag_col = "is_anomaly" if "is_anomaly" in df.columns else None
    if not flag_col:
        raise SystemExit("Column is_anomaly not found.")

    y = df[flag_col].astype(str).str.upper().isin(["Y", "TRUE", "1"])
    df = df.assign(_flag=y)
    _flag = df["_flag"]

    lines = []
    lines.append(f"rows={len(df)} anomalies={int(_flag.sum())} rate={float(_flag.mean()):.4f}\n")

    def top_cat(col: str) -> None:
        if col not in df.columns:
            return
        g = df.groupby(col, dropna=False)["_flag"].agg(["sum", "count", "mean"])
        g = g.sort_values("sum", ascending=False).head(args.top_n)
        lines.append(f"\n## By {col} (top {args.top_n} by anomaly count)\n")
        lines.append(g.to_string())
        lines.append("\n")

    for col in ("SOURCE", "USERS", "GL ACCOUNT CODE"):
        top_cat(col)

    rule_cols = [c for c in df.columns if str(c).startswith("flag_")]
    if rule_cols:
        any_rule = df[rule_cols].apply(pd.to_numeric, errors="coerce").fillna(0).max(axis=1) > 0
        both = _flag & any_rule
        ml_only = _flag & ~any_rule
        lines.append("\n## Rule overlap (flag_* columns)\n")
        lines.append(f"anomaly & any rule flag: {int(both.sum())}\n")
        lines.append(f"anomaly & no rule flag: {int(ml_only.sum())}\n")

    (args.out / "summary.txt").write_text("\n".join(lines), encoding="utf-8")

    if "ensemble_score" in df.columns:
        plt.figure(figsize=(8, 4))
        plt.hist(df["ensemble_score"].dropna(), bins=30, color="#E8630A", alpha=0.85)
        plt.title("Ensemble score (all rows)")
        plt.tight_layout()
        plt.savefig(args.out / "hist_ensemble_score.png", dpi=120)
        plt.close()

    vote_cols = [c for c in df.columns if str(c).startswith("vote_")]
    if len(vote_cols) > 1:
        sub = df.loc[_flag, vote_cols].apply(pd.to_numeric, errors="coerce").fillna(0)
        if len(sub):
            corr = sub.corr()
            plt.figure(figsize=(6, 5))
            plt.imshow(corr, cmap="Blues", vmin=0, vmax=1)
            plt.colorbar()
            plt.xticks(range(len(corr.columns)), corr.columns, rotation=45, ha="right")
            plt.yticks(range(len(corr.columns)), corr.columns)
            plt.title("Vote correlation (anomaly rows)")
            plt.tight_layout()
            plt.savefig(args.out / "vote_corr.png", dpi=120)
            plt.close()

    print(f"Wrote {args.out / 'summary.txt'} and plots (if applicable).")


if __name__ == "__main__":
    main()
