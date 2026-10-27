"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { useFeedback } from "@/components/feedback";
import { roleLabel, type Merchant, type Profile, type Role } from "@/lib/types";
import { inviteMember, removeMember, resendInvite, setMemberAccess, setMemberRole, setTempPassword } from "@/app/actions/settings";

export type Member = Profile & { merchants: "all" | string[]; status: "active" | "invited" };

/** Easy to read out or type: no 0/O or 1/l/I. */
function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const pick = (n: number) => Array.from(crypto.getRandomValues(new Uint32Array(n)), (x) => chars[x % chars.length]).join("");
  return `Meld-${pick(4)}-${pick(4)}`;
}

function PasswordField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const [shown, setShown] = useState(true);
  return (
    <div className="field">
      <div className="lblrow">
        <label htmlFor={id} className="lbl">
          Temporary password
        </label>
        <button className="btn link sm" type="button" onClick={() => onChange(generatePassword())}>
          Generate
        </button>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          className="input"
          id={id}
          type={shown ? "text" : "password"}
          autoComplete="new-password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={`${id}-hint`}
        />
        <button className="btn sm" type="button" onClick={() => setShown((s) => !s)} aria-pressed={!shown} style={{ minHeight: 44 }}>
          {shown ? "Hide" : "Show"}
        </button>
      </div>
      <span className="hint" id={`${id}-hint`}>
        At least 8 characters. Share it privately; they choose their own password the first time they sign in.
      </span>
    </div>
  );
}

function AccessPicker({ merchants, value, onChange }: { merchants: Merchant[]; value: "all" | string[]; onChange: (v: "all" | string[]) => void }) {
  const all = value === "all";
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="lbl" style={{ marginBottom: 6 }}>
        Merchant access
      </legend>
      <label style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 40 }}>
        <input type="checkbox" checked={all} onChange={(e) => onChange(e.target.checked ? "all" : [])} /> All merchants, including new ones
      </label>
      <div className="checklist" style={all ? { opacity: 0.5 } : undefined}>
        {merchants.map((m) => (
          <label key={m.id}>
            <input
              type="checkbox"
              disabled={all}
              checked={all || (value as string[]).includes(m.id)}
              onChange={(e) => {
                const cur = all ? [] : (value as string[]);
                onChange(e.target.checked ? [...cur, m.id] : cur.filter((x) => x !== m.id));
              }}
            />{" "}
            {m.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Team({ members, merchants, selfId }: { members: Member[]; merchants: Merchant[]; selfId: string }) {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const inviteDlg = useRef<HTMLDialogElement>(null);
  const accessDlg = useRef<HTMLDialogElement>(null);
  const pwDlg = useRef<HTMLDialogElement>(null);
  const blankInvite = () => ({
    name: "",
    email: "",
    title: "Dispatcher",
    role: "ops" as Role,
    merchants: [] as "all" | string[],
    method: "password" as "password" | "email",
    // Filled when the dialog opens: generating during render would differ between server and browser.
    password: "",
  });
  const [invite, setInvite] = useState(blankInvite);
  const [inviteErr, setInviteErr] = useState("");
  const [pwFor, setPwFor] = useState<Member | null>(null);
  const [newPw, setNewPw] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [editing, setEditing] = useState<Member | null>(null);
  const [editAccess, setEditAccess] = useState<"all" | string[]>([]);
  const [accessErr, setAccessErr] = useState("");
  const [busy, setBusy] = useState(false);

  const sendInvite = async () => {
    setBusy(true);
    const { method, password, ...person } = invite;
    const r = await inviteMember({ ...person, tempPassword: method === "password" ? password : undefined });
    setBusy(false);
    if (!r.ok) return setInviteErr(r.error);
    inviteDlg.current?.close();
    toast(
      method === "password" ? (
        <>
          <b>{person.name.trim()}</b> can sign in now with their temporary password
        </>
      ) : (
        <>
          Invite sent to <b>{person.email.trim()}</b>
        </>
      ),
    );
    setInvite(blankInvite());
    router.refresh();
  };

  const savePassword = async () => {
    if (!pwFor) return;
    setBusy(true);
    const r = await setTempPassword(pwFor.id, newPw);
    setBusy(false);
    if (!r.ok) return setPwErr(r.error);
    pwDlg.current?.close();
    toast(
      <>
        New temporary password set for <b>{pwFor.name || pwFor.email}</b>
      </>,
    );
    router.refresh();
  };

  const changeRole = async (m: Member, role: Role) => {
    const r = await setMemberRole(m.id, role);
    if (!r.ok) return toast(r.error);
    router.refresh();
    toast(
      <>
        {m.name} is now <b>{roleLabel(role)}</b>
      </>,
      async () => {
        await setMemberRole(m.id, m.role);
        router.refresh();
      },
    );
  };

  const saveAccess = async () => {
    if (!editing) return;
    const r = await setMemberAccess(editing.id, editAccess);
    if (!r.ok) return setAccessErr(r.error);
    accessDlg.current?.close();
    toast(`Access updated for ${editing.name}`);
    router.refresh();
  };

  const remove = async (m: Member) => {
    const ok = await confirm({ title: `Remove ${m.name}?`, body: `${m.name} will lose access straight away. Orders they created stay.`, ok: "Remove access", danger: true });
    if (!ok) return;
    const r = await removeMember(m.id);
    if (!r.ok) return toast(r.error);
    toast(`${m.name} removed`);
    router.refresh();
  };

  const chips = (m: Member) =>
    m.merchants === "all" ? (
      <span className="chip">All merchants</span>
    ) : m.merchants.length ? (
      m.merchants.map((id) => (
        <span className="chip" key={id}>
          {merchants.find((x) => x.id === id)?.name ?? "Removed"}
        </span>
      ))
    ) : (
      <span className="muted small">No merchants</span>
    );

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Team and access</h1>
          <p>Customer care and dispatchers get Ops / dispatcher. Admins get Admin / finance and manage this page.</p>
        </div>
        <span className="spacer" />
        <button
          className="btn primary"
          type="button"
          onClick={() => {
            setInviteErr("");
            setInvite((i) => (i.password ? i : { ...i, password: generatePassword() }));
            inviteDlg.current?.showModal();
          }}
        >
          Add person
        </button>
      </div>
      <div className="grid2" style={{ marginBottom: 20 }}>
        <div className="callout info">
          <Icon name="info" />
          <div>
            <b>Ops / dispatcher</b>
            <br />
            <span className="small">New orders, orders list, riders. Sees only the merchants you give them.</span>
          </div>
        </div>
        <div className="callout info">
          <Icon name="info" />
          <div>
            <b>Admin / finance</b>
            <br />
            <span className="small">Everything, plus delivery report, remittance, merchant settings and this page.</span>
          </div>
        </div>
      </div>
      <section className="panel">
        <div className="tablewrap">
          <table className="cards">
            <thead>
              <tr>
                <th>Person</th>
                <th>Job</th>
                <th>Role</th>
                <th>Merchant access</th>
                <th>Status</th>
                <th>
                  <span className="sr">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const self = m.id === selfId;
                return (
                  <tr key={m.id}>
                    <td className="first" data-l="Person">
                      <span>
                        {m.name || m.email}
                        {self && <span className="tag">You</span>}
                        <div className="small muted" style={{ fontWeight: 400 }}>
                          {m.email}
                        </div>
                      </span>
                    </td>
                    <td data-l="Job">{m.title}</td>
                    <td data-l="Role">
                      <select
                        className="input"
                        aria-label={`Role for ${m.name}`}
                        value={m.role}
                        disabled={self}
                        title={self ? "You can’t change your own role" : undefined}
                        onChange={(e) => changeRole(m, e.target.value as Role)}
                      >
                        <option value="ops">Ops / dispatcher</option>
                        <option value="admin">Admin / finance</option>
                      </select>
                    </td>
                    <td data-l="Access">
                      <div className="chips">{chips(m)}</div>
                    </td>
                    <td data-l="Status">
                      <span className={`pill ${m.status === "active" ? "st-Delivered" : "st-Rescheduled"}`}>{m.status === "active" ? "Active" : "Invite sent"}</span>
                    </td>
                    <td data-l="Actions">
                      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", flexWrap: "wrap" }}>
                        {m.role === "ops" && (
                          <button
                            className="btn sm"
                            type="button"
                            onClick={() => {
                              setEditing(m);
                              setEditAccess(m.merchants);
                              setAccessErr("");
                              accessDlg.current?.showModal();
                            }}
                          >
                            Edit access
                          </button>
                        )}
                        {!self && (
                          <button
                            className="btn sm"
                            type="button"
                            onClick={() => {
                              setPwFor(m);
                              setNewPw(generatePassword());
                              setPwErr("");
                              pwDlg.current?.showModal();
                            }}
                          >
                            Set password
                          </button>
                        )}
                        {m.status === "invited" && (
                          <button
                            className="btn sm link"
                            type="button"
                            onClick={async () => {
                              const r = await resendInvite(m.email);
                              toast(r.ok ? <>Invite resent to <b>{m.email}</b></> : r.error);
                            }}
                          >
                            Resend
                          </button>
                        )}
                        {!self && (
                          <button className="btn sm danger" type="button" onClick={() => remove(m)}>
                            Remove
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <dialog ref={inviteDlg} aria-labelledby="inv-title">
        <div className="dlg-h">
          <h2 id="inv-title">Add person</h2>
          <p className="small muted" style={{ marginTop: 4 }}>
            {invite.method === "password"
              ? "Their account works straight away with the temporary password you give them."
              : "They get an email with a link to set their password."}
          </p>
        </div>
        <div className="dlg-b" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="field">
            <label htmlFor="iName">Full name</label>
            <input className="input" id="iName" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} autoFocus />
          </div>
          <div className="field">
            <label htmlFor="iEmail">Work email</label>
            <input className="input" id="iEmail" type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
          </div>
          <div className="grid2">
            <div className="field">
              <label htmlFor="iTitle">Job</label>
              <select
                className="input"
                id="iTitle"
                value={invite.title}
                onChange={(e) => setInvite({ ...invite, title: e.target.value, role: e.target.value === "Admin" ? "admin" : "ops" })}
              >
                <option>Customer care</option>
                <option>Dispatcher</option>
                <option>Admin</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="iRole">Role</label>
              <select className="input" id="iRole" value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value as Role })}>
                <option value="ops">Ops / dispatcher</option>
                <option value="admin">Admin / finance</option>
              </select>
            </div>
          </div>
          {invite.role === "ops" && <AccessPicker merchants={merchants} value={invite.merchants} onChange={(v) => setInvite({ ...invite, merchants: v })} />}
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="lbl" style={{ marginBottom: 6 }}>
              How they sign in
            </legend>
            <label style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 40 }}>
              <input type="radio" name="iMethod" checked={invite.method === "password"} onChange={() => setInvite({ ...invite, method: "password" })} />
              Set a temporary password
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 40 }}>
              <input type="radio" name="iMethod" checked={invite.method === "email"} onChange={() => setInvite({ ...invite, method: "email" })} />
              Email them an invite link
            </label>
          </fieldset>
          {invite.method === "password" && <PasswordField id="iPass" value={invite.password} onChange={(v) => setInvite({ ...invite, password: v })} />}
          {inviteErr && (
            <p className="err" role="alert">
              {inviteErr}
            </p>
          )}
        </div>
        <div className="dlg-f">
          <button className="btn" type="button" onClick={() => inviteDlg.current?.close()}>
            Cancel
          </button>
          <button className="btn primary" type="button" onClick={sendInvite} disabled={busy}>
            {busy && <span className="spin" aria-hidden="true" />}
            {invite.method === "password" ? "Add person" : "Send invite"}
          </button>
        </div>
      </dialog>

      <dialog ref={pwDlg} aria-labelledby="pw-title">
        <div className="dlg-h">
          <h2 id="pw-title">Set a new password</h2>
          <p className="small muted" style={{ marginTop: 4 }}>
            For {pwFor?.name || pwFor?.email}. Their old password stops working, and they choose their own after signing in.
          </p>
        </div>
        <div className="dlg-b">
          <PasswordField id="pwNew" value={newPw} onChange={setNewPw} />
          {pwErr && (
            <p className="err" role="alert" style={{ marginTop: 8 }}>
              {pwErr}
            </p>
          )}
        </div>
        <div className="dlg-f">
          <button className="btn" type="button" onClick={() => pwDlg.current?.close()}>
            Cancel
          </button>
          <button className="btn primary" type="button" onClick={savePassword} disabled={busy}>
            {busy && <span className="spin" aria-hidden="true" />}
            Set password
          </button>
        </div>
      </dialog>

      <dialog ref={accessDlg} aria-labelledby="acc-title">
        <div className="dlg-h">
          <h2 id="acc-title">Merchant access</h2>
          <p className="small muted" style={{ marginTop: 4 }}>
            {editing?.name} only sees orders for these merchants.
          </p>
        </div>
        <div className="dlg-b">
          <AccessPicker merchants={merchants} value={editAccess} onChange={setEditAccess} />
          {accessErr && (
            <p className="err" role="alert" style={{ marginTop: 8 }}>
              {accessErr}
            </p>
          )}
        </div>
        <div className="dlg-f">
          <button className="btn" type="button" onClick={() => accessDlg.current?.close()}>
            Cancel
          </button>
          <button className="btn primary" type="button" onClick={saveAccess}>
            Save access
          </button>
        </div>
      </dialog>
    </>
  );
}
