import { redirect } from "next/navigation";
import { SigninArt } from "@/components/signin-art";
import { createClient } from "@/lib/supabase/server";
import { SetPasswordForm } from "./set-password-form";

export const metadata = { title: "Set your password · Meld Ops" };

export default async function SetPasswordPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/signin?error=link");
  return (
    <div className="signin">
      <SigninArt />
      <SetPasswordForm email={String(data.claims.email ?? "")} />
    </div>
  );
}
