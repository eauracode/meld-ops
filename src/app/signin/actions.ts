"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; notice?: string; email?: string };

export async function signIn(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Enter your work email and password.", email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const msg = /confirm/i.test(error.message)
      ? "Your invite hasn’t been accepted yet. Open the invite email to set a password."
      : "That email and password don’t match. Try again or reset your password.";
    return { error: msg, email };
  }
  redirect("/new");
}

export async function sendReset(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter your work email first.", email };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/auth/set-password`,
  });
  // Same answer whether or not the account exists, so the form can't be used to find staff emails.
  return { notice: "If that email has an account, a reset link is on its way.", email };
}

export async function setPassword(_prev: FormState, form: FormData): Promise<FormState> {
  const password = String(form.get("password") ?? "");
  if (password.length < 8) return { error: "Use at least 8 characters." };
  if (password !== String(form.get("confirm") ?? "")) return { error: "The two passwords don’t match." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password, data: { must_change_password: false } });
  if (error) {
    return /different from the old|same/i.test(error.message)
      ? { error: "Choose a password different from the temporary one." }
      : { error: "That link has expired. Ask your admin to resend your invite, or request a new reset link." };
  }
  // The signed-in token still says "must change password" until it is reissued.
  await supabase.auth.refreshSession();
  redirect("/new");
}
