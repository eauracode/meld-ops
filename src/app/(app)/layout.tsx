import type { ReactNode } from "react";
import { FeedbackProvider } from "@/components/feedback";
import { Shell } from "@/components/shell";
import { getSession } from "@/lib/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { profile, merchants, merchant } = await getSession();
  return (
    <FeedbackProvider>
      <Shell profile={profile} merchants={merchants} merchantId={merchant?.id ?? null}>
        {children}
      </Shell>
    </FeedbackProvider>
  );
}
