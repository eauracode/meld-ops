import { NextResponse, type NextRequest } from "next/server";
import { runBackup } from "@/lib/backup";

// Called nightly by Vercel Cron (vercel.json). Vercel sends "Authorization: Bearer $CRON_SECRET".
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const r = await runBackup();
  return NextResponse.json(r, { status: r.ok ? 200 : 500 });
}
