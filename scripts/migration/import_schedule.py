#!/usr/bin/env python3
"""
Buildertrend → WCI OS schedule importer.

Reads a Schedule export CSV/XLS (Job, Title, Start Date, Duration / Work Days,
% Complete) and POSTs to /api/v1/migration/schedule-items.

Usage:
  python3 import_schedule.py \\
    --api-base https://app.worldconstructionjax.com/api/v1 \\
    --api-key wci_xxx \\
    --schedule Schedule.xls \\
    [--all-jobs | --job-id ... | --job-query ...] \\
    [--dry-run]
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

import requests

# Reuse helpers from the sibling financial importer when run from this folder.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from import_financials import (  # noqa: E402
    WciClient,
    WARNINGS,
    cell,
    group_rows_by_job,
    normalize_job_name,
    read_rows,
    resolve_job,
    warn,
    xl_to_iso,
)

EXCEL_EPOCH = datetime(1899, 12, 30)


def parse_duration(raw) -> int:
    if raw in ("", None):
        return 1
    if isinstance(raw, (int, float)):
        return max(1, int(raw))
    text = str(raw).strip().lower().replace("days", "").replace("day", "").strip()
    try:
        return max(1, int(float(text)))
    except ValueError:
        return 1


def parse_percent_bps(raw) -> int:
    if raw in ("", None):
        return 0
    if isinstance(raw, float) and 0 <= raw <= 1:
        return int(round(raw * 10_000))
    text = str(raw).strip().replace("%", "")
    try:
        value = float(text)
    except ValueError:
        return 0
    if value <= 1:
        return int(round(value * 10_000))
    return int(round(min(100, max(0, value)) * 100))


def build_items(rows):
    payloads = []
    for row in rows:
        title = str(cell(row, "Title", "Task", "Schedule Item") or "").strip()
        if not title:
            continue
        start = xl_to_iso(cell(row, "Start Date", "Start", "StartDate"))
        duration = parse_duration(cell(row, "Duration", "Work Days", "WorkDays", "Days"))
        payloads.append({
            "title": title,
            "durationDays": duration,
            "manualStartDate": start,
            "percentCompleteBasisPoints": parse_percent_bps(
                cell(row, "% Complete", "Complete", "Percent Complete", "Progress")
            ),
            "externalRef": str(cell(row, "ID #", "ID#", "Id") or "").strip() or None,
        })
    return payloads


def post_items(client, job_id, items, dry_run):
    print(f"  Schedule items: {len(items)}")
    if dry_run:
        print(json.dumps(items[:5], indent=2)[:2000])
        return
    for i in range(0, len(items), 100):
        batch = items[i:i + 100]
        results = client.post(
            "/migration/schedule-items",
            {"scheduleItems": [{**item, "jobId": job_id} for item in batch]},
        )
        for result, payload in zip(results, batch):
            status = result["status"]
            print(
                f'    {payload["title"]}: {status}'
                + (f' ({result.get("error")})' if status == "error" else f' -> {result.get("scheduleItemId")}')
            )


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--api-base", required=True)
    parser.add_argument("--api-key", required=True)
    parser.add_argument("--schedule", required=True)
    parser.add_argument("--job-id")
    parser.add_argument("--job-query")
    parser.add_argument("--all-jobs", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not args.all_jobs and not args.job_id and not args.job_query:
        parser.error("pass --job-id, --job-query, or --all-jobs")

    client = WciClient(args.api_base, args.api_key)
    rows = read_rows(args.schedule)

    if args.all_jobs:
        jobs = client.all_jobs()
        by_name = {normalize_job_name(j["name"]): j for j in jobs}
        for key, group in group_rows_by_job(rows).items():
            if key is None:
                continue
            job = by_name.get(key)
            if not job:
                warn("schedule", key, "No WCI Job.name match — skipped.")
                continue
            print(f'\n{job["name"]} ({job["id"]})')
            post_items(client, job["id"], build_items(group), args.dry_run)
    else:
        job = resolve_job(client, args.job_id, args.job_query)
        grouped = group_rows_by_job(rows)
        if None in grouped:
            selected = grouped[None]
        else:
            selected = grouped.get(normalize_job_name(job["name"]), [])
        print(f'Resolved job: {job["name"]} ({job["id"]})')
        post_items(client, job["id"], build_items(selected), args.dry_run)

    if WARNINGS:
        print(f"\n=== {len(WARNINGS)} warning(s) ===")
        for w in WARNINGS:
            print(f"  {w}")


if __name__ == "__main__":
    main()
