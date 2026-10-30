import "server-only";
import { createSign } from "node:crypto";
import type { Tab } from "./backup-rows";

// Google Sheets over REST with a service account; no SDK. The sheet must be shared with the
// service account's email as Editor.

const SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://sheets.googleapis.com/v4/spreadsheets";

export function sheetsConfig() {
  const email = process.env.GOOGLE_SA_EMAIL?.trim();
  // Vercel and .env files often store the key with literal "\n".
  const key = process.env.GOOGLE_SA_KEY?.replace(/\\n/g, "\n").trim();
  const sheetId = process.env.BACKUP_SHEET_ID?.trim();
  return email && key && sheetId ? { email, key, sheetId } : null;
}

const b64url = (v: string | Buffer) => Buffer.from(v).toString("base64url");

/** The signed-in-as-service-account JWT claims (exported for tests). */
export function jwtClaims(email: string, nowSeconds: number) {
  return { iss: email, scope: SCOPE, aud: TOKEN_URL, iat: nowSeconds, exp: nowSeconds + 3600 };
}

async function accessToken(email: string, key: string): Promise<string> {
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(jwtClaims(email, Math.floor(Date.now() / 1000))));
  const signer = createSign("RSA-SHA256");
  signer.update(`${head}.${body}`);
  const jwt = `${head}.${body}.${b64url(signer.sign(key))}`;
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const json = (await res.json()) as { access_token?: string; error_description?: string; error?: string };
  if (!res.ok || !json.access_token) throw new Error(`Google sign-in failed: ${json.error_description ?? json.error ?? res.status}`);
  return json.access_token;
}

async function call(token: string, url: string, body?: unknown) {
  const res = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } } & Record<string, unknown>;
  if (!res.ok) throw new Error(`Google Sheets: ${json.error?.message ?? res.status}`);
  return json;
}

const quote = (name: string) => `'${name.replace(/'/g, "''")}'`;

/** Replaces the contents of each tab (creating missing tabs, header row frozen). */
export async function writeTabs(cfg: { email: string; key: string; sheetId: string }, tabs: Tab[]) {
  const token = await accessToken(cfg.email, cfg.key);
  const base = `${API}/${encodeURIComponent(cfg.sheetId)}`;

  type Meta = { sheets?: { properties: { title: string; sheetId: number; gridProperties?: { rowCount?: number; columnCount?: number } } }[] };
  const read = async () => ((await call(token, `${base}?fields=sheets.properties(title,sheetId,gridProperties)`)) as Meta).sheets ?? [];
  let sheets = await read();
  const missing = tabs.filter((t) => !sheets.some((x) => x.properties.title === t.name));
  if (missing.length) {
    await call(token, `${base}:batchUpdate`, {
      requests: missing.map((t) => ({ addSheet: { properties: { title: t.name, gridProperties: { frozenRowCount: 1 } } } })),
    });
    sheets = await read();
  }

  // Writing past a tab's grid is refused, so grow tabs that are too small first.
  const grow = tabs.flatMap((t) => {
    const p = sheets.find((x) => x.properties.title === t.name)?.properties;
    if (!p) return [];
    const rows = t.rows.length + 1;
    const cols = Math.max(...t.rows.map((r) => r.length), 1);
    const g = p.gridProperties ?? {};
    if ((g.rowCount ?? 0) >= rows && (g.columnCount ?? 0) >= cols) return [];
    return [
      {
        updateSheetProperties: {
          properties: { sheetId: p.sheetId, gridProperties: { rowCount: Math.max(g.rowCount ?? 0, rows + 500), columnCount: Math.max(g.columnCount ?? 0, cols) } },
          fields: "gridProperties.rowCount,gridProperties.columnCount",
        },
      },
    ];
  });
  if (grow.length) await call(token, `${base}:batchUpdate`, { requests: grow });

  await call(token, `${base}/values:batchClear`, { ranges: tabs.map((t) => quote(t.name)) });
  await call(token, `${base}/values:batchUpdate`, {
    valueInputOption: "RAW",
    data: tabs.map((t) => ({ range: `${quote(t.name)}!A1`, values: t.rows })),
  });
}
