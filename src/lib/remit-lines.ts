import "server-only";
import { autoLineType } from "@/lib/calc";
import type { Session } from "@/lib/session";
import type { RemittanceLine } from "@/lib/types";

/** Order statuses that belong on a remittance. */
export const FINISHED = ["Delivered", "Failed", "Returned"];

type FinishedOrder = {
  id: number;
  customer: string;
  product: string;
  qty: number;
  order_value: number;
  amount_charged: number;
  status: string;
};

export function finishedOrders(supabase: Session["supabase"], merchantId: string, date: string) {
  return supabase
    .from("orders")
    .select("id,customer,product,qty,order_value,amount_charged,status")
    .eq("merchant_id", merchantId)
    .eq("delivery_date", date)
    .in("status", FINISHED)
    .order("created_at");
}

export function orderToLine(remittanceId: string, o: FinishedOrder, position: number) {
  const type = autoLineType(o.status, o.customer);
  return {
    remittance_id: remittanceId,
    order_id: o.id,
    position,
    customer: o.customer,
    product: o.product,
    // Quantity and value only count for lines that collected money.
    qty: type === "Failed" ? 0 : o.qty,
    order_value: type === "Failed" ? 0 : o.order_value,
    amount_charged: o.amount_charged,
    type,
  };
}

/**
 * A draft remittance picks up orders finished after it was generated (delivered later in the day),
 * appended after the existing lines so edits already made are kept.
 */
export async function addMissingOrders(
  supabase: Session["supabase"],
  remit: { id: string; merchant_id: string; remit_date: string },
  lines: RemittanceLine[],
): Promise<RemittanceLine[]> {
  const { data: orders } = await finishedOrders(supabase, remit.merchant_id, remit.remit_date);
  const have = new Set(lines.map((l) => l.order_id));
  const missing = ((orders ?? []) as FinishedOrder[]).filter((o) => !have.has(o.id));
  if (!missing.length) return lines;

  const start = lines.reduce((n, l) => Math.max(n, l.position + 1), 0);
  const { data, error } = await supabase
    .from("remittance_lines")
    .insert(missing.map((o, i) => orderToLine(remit.id, o, start + i)))
    .select("id,order_id,position,customer,product,qty,order_value,amount_charged,type");
  if (error) return lines;
  return [...lines, ...((data ?? []) as RemittanceLine[])];
}
