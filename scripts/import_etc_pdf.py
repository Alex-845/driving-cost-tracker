#!/usr/bin/env python3

import argparse
import json
import re
from pathlib import Path

from pypdf import PdfReader


PASSAGE_PATTERN = re.compile(
    r"(?s)^(?P<source_no>\d+)\s+"
    r"(?P<business_id_1>[A-Z0-9]+)\n"
    r"(?P<business_id_2>[A-Z0-9]+)"
    r"(?P<plate>云[A-Z0-9]+)\s+蓝色\s+"
    r"(?P<card_number>\d+)记账卡\s+通行服务\s+"
    r"(?P<amount>\d+(?:\.\d+)?)\s+"
    r"(?P<receivable>\d+(?:\.\d+)?)\s+/\s+/\s+"
    r"(?P<entry_station>.*?)\s+"
    r"(?P<entry_time>\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})"
    r"(?P<exit_station>.*?)\s+"
    r"(?P<exit_time>\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})"
    r"(?P<status>已请款|已扣款)"
)
ROW_START_PATTERN = re.compile(
    r"(?m)^(\d+)\s+(?=(?:[A-Z][A-Z0-9]{10,}|\d{10,}))"
)


def parse_pdf(pdf_path):
    records = []
    raw_count = 0
    excluded_count = 0

    for page_number, page in enumerate(PdfReader(pdf_path).pages, start=1):
        text = page.extract_text() or ""
        starts = list(ROW_START_PATTERN.finditer(text))
        for index, start in enumerate(starts):
            end = starts[index + 1].start() if index + 1 < len(starts) else len(text)
            row = text[start.start():end].strip()
            raw_count += 1

            if "通行服务" not in row:
                excluded_count += 1
                continue

            match = PASSAGE_PATTERN.match(row)
            if not match:
                source_no = start.group(1)
                raise ValueError(
                    f"Could not parse passage row {source_no} on page {page_number}"
                )

            values = match.groupdict()
            records.append({
                "sourceNo": values["source_no"],
                "businessId": values["business_id_1"] + values["business_id_2"],
                "amount": float(values["amount"]),
                "entryStation": values["entry_station"].strip(),
                "entryTime": values["entry_time"],
                "exitStation": values["exit_station"].strip(),
                "exitTime": values["exit_time"],
                "status": values["status"],
            })

    return records, raw_count, excluded_count


def extract_json_object(source, export_name):
    match = re.search(
        rf"export const {re.escape(export_name)}\s*=\s*(\{{.*?\}}|\[.*\]);",
        source,
        re.S,
    )
    if not match:
        raise ValueError(f"Could not find {export_name}")
    return json.loads(match.group(1))


def record_key(record):
    return (
        round(float(record["amount"]), 2),
        record["entryStation"].strip(),
        record["entryTime"],
        record["exitStation"].strip(),
        record["exitTime"],
    )


def deduplicate(records):
    unique = []
    business_ids = set()
    passage_keys = set()
    duplicate_count = 0

    for record in records:
        business_id = record.get("businessId", "").strip()
        passage_key = record_key(record)
        if (
            (business_id and business_id in business_ids)
            or passage_key in passage_keys
        ):
            duplicate_count += 1
            continue

        unique.append(record)
        if business_id:
            business_ids.add(business_id)
        passage_keys.add(passage_key)

    return unique, duplicate_count


def write_data_file(output_path, stats, records):
    stats_json = json.dumps(stats, ensure_ascii=False, indent=2)
    records_json = json.dumps(records, ensure_ascii=False, indent=2)
    content = (
        "// Generated from merged Yunnan ETC consumption PDFs. "
        "Duplicate passage rows have been removed.\n"
        f"export const ETC_SOURCE_STATS = {stats_json};\n\n"
        f"export const ETC_RECORDS = {records_json};\n"
    )
    output_path.write_text(content, encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(
        description="Merge a Yunnan ETC consumption PDF into the app data."
    )
    parser.add_argument("pdf", type=Path)
    parser.add_argument(
        "--data-file",
        type=Path,
        default=Path("src/data/etcRecords.js"),
    )
    args = parser.parse_args()

    source = args.data_file.read_text(encoding="utf-8")
    current_stats = extract_json_object(source, "ETC_SOURCE_STATS")
    current_records = extract_json_object(source, "ETC_RECORDS")
    incoming_records, incoming_raw_count, incoming_excluded_count = parse_pdf(args.pdf)

    merged_records, removed_duplicates = deduplicate(
        current_records + incoming_records
    )
    merged_records.sort(
        key=lambda record: (
            record["entryTime"],
            record["exitTime"],
            record.get("businessId", ""),
        )
    )

    raw_count = current_stats.get("rawCount", len(current_records)) + incoming_raw_count
    excluded_count = (
        current_stats.get("excludedCount", 0) + incoming_excluded_count
    )
    stats = {
        "rawCount": raw_count,
        "uniqueCount": len(merged_records),
        "duplicateCount": raw_count - excluded_count - len(merged_records),
        "excludedCount": excluded_count,
    }
    write_data_file(args.data_file, stats, merged_records)

    added_count = len(merged_records) - len(current_records)
    print(
        json.dumps(
            {
                "pdfRows": incoming_raw_count,
                "passageRows": len(incoming_records),
                "excludedRows": incoming_excluded_count,
                "removedDuplicates": removed_duplicates,
                "addedRows": added_count,
                "totalRows": len(merged_records),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
