"use client";

import { Icon } from "@/components/icons";

export type CsvRow = Record<string, string | number>;

const cell = (v: string | number) => `"${String(v ?? "").replace(/"/g, '""')}"`;

/** Builds the CSV in the browser from rows the server already filtered. */
export function ExportCsv({ rows, filename }: { rows: CsvRow[]; filename: string }) {
  const download = () => {
    const headers = Object.keys(rows[0] ?? {});
    const text = [headers.map(cell).join(","), ...rows.map((r) => headers.map((h) => cell(r[h])).join(","))].join("\r\n");
    // BOM so Excel opens the ₦ sign and accents correctly.
    const url = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: filename });
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <button className="btn" type="button" onClick={download}>
      <Icon name="dl" />
      Export CSV
    </button>
  );
}
