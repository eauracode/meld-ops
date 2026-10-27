"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type Toast = { id: number; body: ReactNode; undo?: () => void };
type Confirm = { title: string; body: ReactNode; ok: string; danger?: boolean; resolve: (ok: boolean) => void };

type Feedback = {
  toast: (body: ReactNode, undo?: () => void) => void;
  confirm: (opts: { title: string; body: ReactNode; ok: string; danger?: boolean }) => Promise<boolean>;
};

const Ctx = createContext<Feedback | null>(null);

export function useFeedback(): Feedback {
  const v = useContext(Ctx);
  if (!v) throw new Error("useFeedback needs <FeedbackProvider>");
  return v;
}

/** Toasts (with optional Undo) and a single confirm dialog for the whole app. */
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pending, setPending] = useState<Confirm | null>(null);
  const seq = useRef(0);
  const dlg = useRef<HTMLDialogElement>(null);

  const toast = useCallback((body: ReactNode, undo?: () => void) => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, body, undo }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), undo ? 7000 : 3500);
  }, []);

  const confirm = useCallback<Feedback["confirm"]>(
    (opts) => new Promise<boolean>((resolve) => setPending({ ...opts, resolve })),
    [],
  );

  useEffect(() => {
    if (pending && dlg.current && !dlg.current.open) dlg.current.showModal();
  }, [pending]);

  const close = (ok: boolean) => {
    pending?.resolve(ok);
    dlg.current?.close();
    setPending(null);
  };

  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}
      <dialog ref={dlg} aria-labelledby="confirm-title" onCancel={() => close(false)}>
        {pending && (
          <>
            <div className="dlg-h">
              <h2 id="confirm-title">{pending.title}</h2>
            </div>
            <div className="dlg-b">
              <p>{pending.body}</p>
            </div>
            <div className="dlg-f">
              <button className="btn" type="button" onClick={() => close(false)}>
                Cancel
              </button>
              <button className={`btn ${pending.danger ? "danger" : "primary"}`} type="button" onClick={() => close(true)} autoFocus>
                {pending.ok}
              </button>
            </div>
          </>
        )}
      </dialog>
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div className="toast" key={t.id}>
            <span>{t.body}</span>
            {t.undo && (
              <button
                type="button"
                onClick={() => {
                  t.undo?.();
                  setToasts((all) => all.filter((x) => x.id !== t.id));
                }}
              >
                Undo
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
