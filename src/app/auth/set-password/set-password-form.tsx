"use client";

import { useActionState } from "react";
import { setPassword, type FormState } from "@/app/signin/actions";
import { Icon } from "@/components/icons";

export function SetPasswordForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(setPassword, {});
  return (
    <form action={action} noValidate>
      <div>
        <h2 style={{ fontSize: "1.6rem" }}>Set your password</h2>
        <p className="muted" style={{ marginTop: 4 }}>
          For {email}. Use at least 8 characters.
        </p>
      </div>
      {state.error && (
        <div className="callout err" role="alert">
          <Icon name="warn" />
          <div>{state.error}</div>
        </div>
      )}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      <div className="field">
        <label htmlFor="pw1">New password</label>
        <input className="input" id="pw1" name="password" type="password" autoComplete="new-password" minLength={8} required autoFocus />
      </div>
      <div className="field">
        <label htmlFor="pw2">Type it again</label>
        <input className="input" id="pw2" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <button className="btn primary" type="submit" disabled={pending}>
        {pending && <span className="spin" aria-hidden="true" />}
        Save password and continue
      </button>
    </form>
  );
}
