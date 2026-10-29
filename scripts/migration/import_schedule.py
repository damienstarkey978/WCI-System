#!/usr/bin/env python3
"""
Buildertrend → WCI OS schedule importer.

Reads a Schedule export CSV/XLS (Job, Title, Start Date, Duration / Work Days,
% Complete) and POSTs to /api/v1/migration/schedule-items.

Optional --offline-json (BT Schedule grid JSON with jobs[].calendarOffline)
sets Schedule.isOnline = !calendarOffline via scheduleIsOnline on each item
batch and via POST /migration/schedule-flags for jobs with zero items.

Usage:
  python3 import_schedule.py \\
    --api-base https://app.worldconstructionjax.com/api/v1 \\
    --api-key wci_xxx \\
    --schedule Schedule.xls \\
    [--offline-json Schedule_AllOpenJobs.json] \\
    [--all-jobs | --job-id ... | --job-query ...] \\
    [--dry-run]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

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
    if isinstance(raw, bool):
        return 10_000 if raw else 0
    if isinstance(raw, float) and 0 <= raw <= 1:
        return int(round(raw * 10_000))
    text = str(raw).strip().replace("%", "")
    # Grid CSV exports a Completed True/False column instead of % Complete.
    lowered = text.casefold()
    if lowered in ("true", "yes", "y", "complete", "completed"):
        return 10_000
    if lowered in ("false", "no", "n", "incomplete"):
        return 0
    try:
        value = float(text)
    except ValueError:
        return 0
    if value <= 1:
        return int(round(value * 10_000))
    return int(round(min(100, max(0, value)) * 100))


def load_offline_map(path: str | None) -> dict[str, bool]:
    """job name → calendarOffline from BT Schedule grid JSON."""
    if not path:
        return {}
    data = json.loads(Path(path).read_text())
    out: dict[str, bool] = {}
    for job in data.get("jobs") or []:
        name = (job.get("name") or "").strip()
        if not name:
            continue
        out[normalize_job_name(name)] = bool(job.get("calendarOffline"))
        # Also index raw trimmed name for resolve_job / WCI Job.name equality.
        out[name] = bool(job.get("calendarOffline"))
    return out


def offline_for_job(offline_map: dict[str, bool], job_name: str) -> bool | None:
    if not offline_map:
        return None
    if job_name in offline_map:
        return offline_map[job_name]
    key = normalize_job_name(job_name)
    if key in offline_map:
        return offline_map[key]
    for k, v in offline_map.items():
        if normalize_job_name(k) == key or k.strip() == job_name.strip():
            return v
    return None


def build_items(rows, schedule_is_online: bool | None):
    payloads = []
    for row in rows:
        title = str(cell(row, "Title", "Task", "Schedule Item") or "").strip()
        if not title:
            continue
        start = xl_to_iso(cell(row, "Start Date", "Start", "StartDate"))
        if isinstance(start, str) and start and not start.endswith("Z") and "T" in start:
            # Grid ISO datetimes without Z still coerce; normalize for consistency.
            start = start + "Z" if "+" not in start[-6:] else start
        duration = parse_duration(cell(row, "Duration", "Work Days", "WorkDays", "Days"))
        percent_raw = cell(
            row,
            "% Complete",
            "Percent Complete",
            "Progress",
            "Completed",
            "Complete",
        )
        payload = {
            "title": title,
            "durationDays": duration,
            "manualStartDate": start,
            "percentCompleteBasisPoints": parse_percent_bps(percent_raw),
            "externalRef": str(
                cell(row, "ScheduleItemId", "ID #", "ID#", "Id") or ""
            ).strip()
            or None,
        }
        if schedule_is_online is not None:
            payload["scheduleIsOnline"] = schedule_is_online
        payloads.append(payload)
    return payloads


def post_flags(client, job_id, is_online, dry_run):
    print(f"  Schedule flags: isOnline={is_online}")
    if dry_run:
        return
    results = client.post(
        "/migration/schedule-flags",
        {"schedules": [{"jobId": job_id, "isOnline": is_online}]},
    )
    for result in results:
        status = result["status"]
        print(
            f"    flags: {status}"
            + (
                f' ({result.get("error")})'
                if status == "error"
                else f' -> {result.get("scheduleId")}'
            )
        )


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
                + (
                    f' ({result.get("error")})'
                    if status == "error"
                    else f' -> {result.get("scheduleItemId")}'
                )
            )


def import_job(client, job, rows, offline_map, dry_run):
    bt_offline = offline_for_job(offline_map, job["name"])
    schedule_is_online = None if bt_offline is None else (not bt_offline)
    items = build_items(rows, schedule_is_online)
    print(f'\n{job["name"]} ({job["id"]})')
    if schedule_is_online is not None:
        # Always set flags so empty offline calendars still match BT Online toggle.
        post_flags(client, job["id"], schedule_is_online, dry_run)
    if items:
        post_items(client, job["id"], items, dry_run)
    elif schedule_is_online is None:
        print("  (no items and no offline flag — skipped)")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--api-base", required=True)
    parser.add_argument("--api-key", required=True)
    parser.add_argument("--schedule", required=True)
    parser.add_argument(
        "--offline-json",
        help="BT Schedule grid JSON with jobs[].calendarOffline (sets Schedule.isOnline)",
    )
    parser.add_argument("--job-id")
    parser.add_argument("--job-query")
    parser.add_argument("--all-jobs", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not args.all_jobs and not args.job_id and not args.job_query:
        parser.error("pass --job-id, --job-query, or --all-jobs")

    client = WciClient(args.api_base, args.api_key)
    rows = read_rows(args.schedule)
    offline_map = load_offline_map(args.offline_json)

    if args.all_jobs:
        jobs = client.all_jobs()
        by_name = {normalize_job_name(j["name"]): j for j in jobs}
        seen_job_ids: set[str] = set()
        for key, group in group_rows_by_job(rows).items():
            if key is None:
                continue
            job = by_name.get(key)
            if not job:
                warn("schedule", key, "No WCI Job.name match — skipped.")
                continue
            import_job(client, job, group, offline_map, args.dry_run)
            seen_job_ids.add(job["id"])
        # Jobs with offline flags but zero CSV items still need the Online toggle.
        for job in jobs:
            if job["id"] in seen_job_ids:
                continue
            if offline_for_job(offline_map, job["name"]) is None:
                continue
            import_job(client, job, [], offline_map, args.dry_run)
    else:
        job = resolve_job(client, args.job_id, args.job_query)
        grouped = group_rows_by_job(rows)
        if None in grouped:
            selected = grouped[None]
        else:
            selected = grouped.get(normalize_job_name(job["name"]), [])
        import_job(client, job, selected, offline_map, args.dry_run)

    if WARNINGS:
        print(f"\n=== {len(WARNINGS)} warning(s) ===")
        for w in WARNINGS:
            print(f"  {w}")


if __name__ == "__main__":
    main()
