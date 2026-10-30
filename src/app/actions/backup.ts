"use server";

import { revalidatePath } from "next/cache";
import { runBackup, type BackupResult } from "@/lib/backup";
import { actionSession } from "@/lib/session";

export async function backupNow(): Promise<BackupResult> {
  await actionSession({ admin: true });
  const r = await runBackup();
  revalidatePath("/team");
  revalidatePath("/dashboard");
  return r;
}
