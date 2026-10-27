"use client";

import { useActionState, useState } from "react";
import { sendReset, signIn, type FormState } from "./actions";
import { Icon } from "@/components/icons";

export function SigninForm({ linkError }: { linkError?: string }) {
  const [mode, setMode] = useState<"signin" | "reset">("signin");
  const [state, action, pending] = useActionState<FormState, FormData>(mode === "signin" ? signIn : sendReset, {
    error: linkError,
  });

  return (
    <form action={action} noValidate>
      <div>
        <h2 style={{ fontSize: "1.6rem" }}>{mode === "signin" ? "Sign in" : "Reset your password"}</h2>
        <p className="muted" style={{ marginTop: 4 }}>
          {mode === "signin"
            ? "Meld staff only. Ask your admin for an invite if you don’t have an account."
            : "We’ll email you a link to set a new password."}
        </p>
      </div>
      {state.error && (
        <div className="callout err" role="alert">
          <Icon name="warn" />
          <div>{state.error}</div>
        </div>
      )}
      {state.notice && (
        <div className="callout info" role="status">
          <Icon name="info" />
          <div>{state.notice}</div>
        </div>
      )}
      <div className="field">
        <label htmlFor="siEmail">Work email</label>
        <input className="input" id="siEmail" name="email" type="email" autoComplete="username" defaultValue={state.email} required autoFocus />
      </div>
      {mode === "signin" && (
        <div className="field">
          <div className="lblrow">
            <label htmlFor="siPass" className="lbl">
              Password
            </label>
            <button className="btn link sm" type="button" onClick={() => setMode("reset")}>
              Forgot password?
            </button>
          </div>
          <input className="input" id="siPass" name="password" type="password" autoComplete="current-password" required />
        </div>
      )}
      <button className="btn primary" type="submit" disabled={pending}>
        {pending && <span className="spin" aria-hidden="true" />}
        {mode === "signin" ? "Sign in" : "Send reset link"}
      </button>
      {mode === "reset" && (
        <button className="btn link" type="button" onClick={() => setMode("signin")}>
          Back to sign in
        </button>
      )}
    </form>
  );
}
