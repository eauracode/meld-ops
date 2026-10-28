import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

// Admins start on the overview; dispatchers start on order entry.
export default async function Home() {
  const { profile } = await getSession();
  redirect(profile.role === "admin" ? "/dashboard" : "/new");
}
