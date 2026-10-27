import "server-only";
import { lagosToday, lookupRate, matchProduct, normalisePhone, isValidPhone, toNum } from "./calc";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

function systemPrompt(products: string[], areas: string[]): string {
  return `You are an order extraction assistant for Meld, a last-mile delivery company in Lagos, Nigeria.
Today is ${lagosToday()} (Africa/Lagos).

Extract ONE order from the WhatsApp message and return STRICT JSON only: no prose, no markdown fences.

RULES:
- Use null for any field not present. NEVER invent values.
- phone_number: Nigerian numbers are 11 digits starting 070, 080, 081, 090 or 091. Convert +234 to 0. Otherwise null.
- If an "Address:" line holds an email instead of a street address, set delivery_address to null and copy the email into notes.
- area_zone: the Lagos area. Prefer one of these exact names when it fits: ${JSON.stringify(areas)}. Otherwise the area as written, or null.
- product_name: prefer one of these exact names when it fits: ${JSON.stringify(products)}. Otherwise the product as written, or null.
- order_value: the total naira amount the customer pays for the goods, as a number (20000, not "20,000" or "₦20k").
- qty: integer only.
- delivery_date: YYYY-MM-DD if a date or "tomorrow" is mentioned, else null.
- payment_method: "Already paid" if the message says payment was made (fully paid, transfer done, paid already). Otherwise null.
- notes: ONLY delivery instructions (e.g. "Call before arriving"). Never the product. null if none.
- Ignore emojis, @mentions, lines starting with *, and dispatcher chatter after the order.
- uncertain_fields: names of fields you guessed or were not confident about.

Return exactly this structure:
{"delivery_date":null,"customer_name":null,"phone_number":null,"delivery_address":null,"area_zone":null,"product_name":null,"qty":null,"order_value":null,"payment_method":null,"notes":null,"uncertain_fields":[]}`;
}

export type Draft = {
  delivery_date: string;
  customer: string;
  phone: string;
  address: string;
  area: string;
  product: string;
  qty: number;
  order_value: number | "";
  rider_fee: number | "";
  fee_from_rate_card: boolean;
  payment: "Cash on delivery" | "Already paid";
  notes: string;
  uncertain: string[];
};

export type ExtractResult =
  | { ok: true; draft: Draft }
  | { ok: false; kind: "busy" | "timeout" | "failed" | "config"; message: string };

type Raw = Record<string, unknown>;

export function parseJson(text: string): Raw {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  const obj = JSON.parse(start >= 0 && end > start ? t.slice(start, end + 1) : t);
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new Error("not an object");
  return obj as Raw;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());

/** Turns the model's JSON into a form draft, matched against this merchant's products and rate card. */
export function toDraft(raw: Raw, products: string[], rates: Record<string, number>): Draft {
  const uncertain = new Set(Array.isArray(raw.uncertain_fields) ? raw.uncertain_fields.map(str) : []);
  const fieldMap: Record<string, string> = {
    delivery_date: "delivery_date",
    customer_name: "customer",
    phone_number: "phone",
    delivery_address: "address",
    area_zone: "area",
    product_name: "product",
    qty: "qty",
    order_value: "order_value",
  };
  const flagged = new Set([...uncertain].map((f) => fieldMap[f] ?? f));

  const date = str(raw.delivery_date);
  const phone = normalisePhone(str(raw.phone_number));
  const productRaw = str(raw.product_name);
  const product = matchProduct(productRaw, products);
  if (productRaw && product && product.toLowerCase() !== productRaw.toLowerCase()) flagged.add("product");

  const rate = lookupRate(str(raw.area_zone), rates) ?? lookupRate(str(raw.delivery_address), rates);
  const qty = Math.max(1, Math.round(toNum(raw.qty)) || 1);
  const value = toNum(raw.order_value);

  const draft: Draft = {
    delivery_date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : lagosToday(),
    customer: str(raw.customer_name),
    phone,
    address: str(raw.delivery_address),
    area: rate?.area ?? "",
    product,
    qty,
    order_value: value > 0 ? Math.round(value) : "",
    rider_fee: rate ? rate.fee : "",
    fee_from_rate_card: Boolean(rate),
    payment: /paid/i.test(str(raw.payment_method)) ? "Already paid" : "Cash on delivery",
    notes: str(raw.notes),
    uncertain: [],
  };
  if (!raw.qty) flagged.add("qty");
  if (phone && !isValidPhone(phone)) flagged.add("phone");
  for (const k of ["customer", "phone", "address", "area", "product", "order_value"] as const) {
    if (!draft[k]) flagged.add(k);
  }
  draft.uncertain = [...flagged].filter((k) => k in draft);
  return draft;
}

/** Calls Groq. Retries once on a bad JSON reply or a network timeout; rate limits are returned as "busy". */
export async function extractOrder(message: string, products: string[], rates: Record<string, number>): Promise<ExtractResult> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return { ok: false, kind: "config", message: "GROQ_API_KEY is not set on the server." };
  const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
  const body = JSON.stringify({
    model,
    temperature: 0,
    max_completion_tokens: 2048,
    reasoning_effort: "low",
    messages: [
      { role: "system", content: systemPrompt(products, Object.keys(rates)) },
      { role: "user", content: message },
    ],
  });

  let lastReply = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(GROQ_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      if (attempt === 1) return { ok: false, kind: "timeout", message: "Groq didn’t answer in time." };
      continue;
    }
    if (res.status === 429) return { ok: false, kind: "busy", message: "Groq rate limit reached." };
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, kind: "failed", message: `Groq error ${res.status}: ${detail.slice(0, 200)}` };
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    lastReply = data.choices?.[0]?.message?.content ?? "";
    try {
      return { ok: true, draft: toDraft(parseJson(lastReply), products, rates) };
    } catch {
      continue;
    }
  }
  return { ok: false, kind: "failed", message: `Couldn’t read the reply as an order. ${lastReply.slice(0, 200)}` };
}
