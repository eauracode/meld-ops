import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { buildTabs, type BackupData } from "@/lib/backup-rows";
import { sheetsConfig, writeTabs } from "@/lib/google-sheets";

export type BackupResult = { ok: true; rows: number } | { ok: false; error: string };

/**
 * Copies every table into the backup Google Sheet (one tab each, rewritten in full) and logs the run
 * in backup_runs. Runs nightly from Vercel Cron (/api/backup) and from "Back up now".
 */
export async function runBackup(): Promise<BackupResult> {
  const cfg = sheetsConfig();
  if (!cfg) return { ok: false, error: "Backup isn’t set up yet: add GOOGLE_SA_EMAIL, GOOGLE_SA_KEY and BACKUP_SHEET_ID." };
  const db = createAdminClient();

  const all = (table: string, order: string) => fetchAll<Record<string, unknown>>((a, b) => db.from(table).select("*").order(order).range(a, b));
  // Tables added by later migrations are left empty if they aren't there yet.
  const optional = (table: string, order: string) => all(table, order).catch(() => []);

  let result: BackupResult;
  try {
    const [orders, merchants, products, rates, riders, remittances, remittanceLines, riderPayouts, stations, stationStock, stockMoves, profiles] = await Promise.all([
      all("orders", "id"),
      all("merchants", "name"),
      all("products", "name"),
      all("rates", "area"),
      all("riders", "name"),
      all("remittances", "remit_date"),
      all("remittance_lines", "id"),
      optional("rider_payouts", "paid_at"),
      optional("stations", "created_at"),
      optional("station_stock", "product_id"),
      optional("stock_moves", "created_at"),
      all("profiles", "name"),
    ]);
    const data: BackupData = { orders, merchants, products, rates, riders, remittances, remittanceLines, riderPayouts, stations, stationStock, stockMoves, profiles };
    const tabs = buildTabs(data);
    await writeTabs(cfg, tabs);
    result = { ok: true, rows: tabs.reduce((n, t) => n + t.rows.length - 1, 0) };
  } catch (e) {
    result = { ok: false, error: (e as Error).message.slice(0, 500) };
  }

  await db
    .from("backup_runs")
    .insert(result.ok ? { ok: true, rows: result.rows } : { ok: false, error: result.error })
    .then(
      () => undefined,
      () => undefined,
    );
  return result;
}
