import { SigninForm } from "./signin-form";
import { SigninArt } from "@/components/signin-art";

export const metadata = { title: "Sign in · Meld Ops" };

export default async function SigninPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="signin">
      <SigninArt />
      <SigninForm linkError={error === "link" ? "That link has expired or was already used. Request a new one." : undefined} />
    </div>
  );
}
