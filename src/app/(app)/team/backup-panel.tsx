"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFeedback } from "@/components/feedback";
import { backupNow } from "@/app/actions/backup";

export type BackupRun = { ran_at: string; ok: boolean; rows: number; error: string };

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Africa/Lagos", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Nightly Google Sheet backup: last result and "Back up now". */
export function BackupPanel({ configured, last, lastOk, sheetUrl }: { configured: boolean; last: BackupRun | null; lastOk: BackupRun | null; sheetUrl: string | null }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    const r = await backupNow();
    setBusy(false);
    toast(r.ok ? `Backed up ${r.rows.toLocaleString("en-NG")} rows` : r.error);
    router.refresh();
  };

  return (
    <section className="panel" style={{ marginTop: 20 }} aria-labelledby="bk-h">
      <div className="panel-h">
        <h2 id="bk-h">Data backup</h2>
        <span className="spacer" />
        {configured && (
          <button className="btn sm" type="button" onClick={run} disabled={busy}>
            {busy && <span className="spin" aria-hidden="true" />}
            Back up now
          </button>
        )}
      </div>
      <div className="panel-b" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {!configured ? (
          <p className="small muted">
            Not set up yet. Every night the app copies all orders, remittances, stock and more into one Google Sheet once the Google service account details are added in Vercel.
          </p>
        ) : (
          <>
            <p>
              {lastOk ? (
                <>
                  Last backup: <b>{when(lastOk.ran_at)}</b> · {lastOk.rows.toLocaleString("en-NG")} rows
                </>
              ) : (
                "No successful backup yet."
              )}
            </p>
            {last && !last.ok && (
              <p className="err" role="alert">
                Last attempt failed ({when(last.ran_at)}): {last.error}
              </p>
            )}
            <p className="small muted">
              Runs every night around midnight. The sheet is rewritten in full each time; download it from Google Sheets as Excel.
              {sheetUrl && (
                <>
                  {" "}
                  <a href={sheetUrl} target="_blank" rel="noreferrer">
                    Open the backup sheet
                  </a>
                </>
              )}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
