"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { useFeedback } from "@/components/feedback";
import { generateRemittance } from "@/app/actions/remittance";

export function RemitDate({ date }: { date: string }) {
  const router = useRouter();
  const path = usePathname();
  return (
    <div className="field">
      <label htmlFor="remDate">Date</label>
      <input
        className="input"
        type="date"
        id="remDate"
        value={date}
        onChange={(e) => e.target.value && router.replace(`${path}?date=${e.target.value}`, { scroll: false })}
      />
    </div>
  );
}

export function GenerateButton({ merchantId, date, label = "Generate remittance" }: { merchantId: string; date: string; label?: string }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  return (
    <button
      className="btn primary"
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await generateRemittance(merchantId, date);
          if (!r.ok) toast(r.error);
          router.refresh();
        })
      }
    >
      {pending && <span className="spin" aria-hidden="true" />}
      {label}
    </button>
  );
}
