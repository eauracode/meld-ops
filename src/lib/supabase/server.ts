import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set. Copy .env.example to .env.local and fill it in.`);
  return v;
}

/** Client acting as the signed-in user; row-level security applies. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read-only; the proxy refreshes the session.
        }
      },
    },
  });
}

/** Secret-key client that bypasses row-level security. Only for admin-checked actions (invites). */
export function createAdminClient() {
  return createPlainClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SECRET_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
