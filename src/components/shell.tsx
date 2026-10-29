"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { Icon, MeldMark, type IconName } from "./icons";
import { useFeedback } from "./feedback";
import { setMerchant, signOut } from "@/app/actions/session";
import { roleLabel, type Merchant, type Profile } from "@/lib/types";

type View = { href: string; label: string; short: string; icon: IconName; admin?: boolean; group?: string };

const VIEWS: View[] = [
  { href: "/dashboard", label: "Overview", short: "Overview", icon: "dash", admin: true },
  { href: "/new", label: "New order", short: "New", icon: "order" },
  { href: "/orders", label: "Orders", short: "Orders", icon: "list" },
  { href: "/report", label: "Delivery report", short: "Report", icon: "report", admin: true, group: "Finance" },
  { href: "/remittance", label: "Remittance", short: "Remit", icon: "remit", admin: true },
  { href: "/rider-pay", label: "Rider pay", short: "Pay", icon: "rider", admin: true },
  { href: "/merchants", label: "Merchant settings", short: "Merchant", icon: "store", admin: true, group: "Setup" },
  { href: "/riders", label: "Riders", short: "Riders", icon: "rider" },
  { href: "/team", label: "Team and access", short: "Team", icon: "team", admin: true },
];
const MOBILE = ["/dashboard", "/new", "/orders", "/report", "/remittance"];

type Theme = "system" | "light" | "dark";

// The theme lives on <html data-theme> (set before paint by the root layout's script); read it from there.
const themeListeners = new Set<() => void>();
const readTheme = (): Theme => {
  const t = document.documentElement.getAttribute("data-theme");
  return t === "light" || t === "dark" ? t : "system";
};

function useTheme(): [Theme, () => void] {
  const theme = useSyncExternalStore(
    (cb) => {
      themeListeners.add(cb);
      return () => themeListeners.delete(cb);
    },
    readTheme,
    () => "system" as Theme,
  );
  const cycle = () => {
    const next: Theme = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
    const root = document.documentElement;
    if (next === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", next);
    try {
      if (next === "system") localStorage.removeItem("meld-theme");
      else localStorage.setItem("meld-theme", next);
    } catch {}
    themeListeners.forEach((l) => l());
  };
  return [theme, cycle];
}

export function Shell({
  profile,
  merchants,
  merchantId,
  children,
}: {
  profile: Profile;
  merchants: Merchant[];
  merchantId: string | null;
  children: ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();
  const { toast } = useFeedback();
  const [theme, cycleTheme] = useTheme();
  const [, startTransition] = useTransition();
  const menu = useRef<HTMLDialogElement>(null);
  const isAdmin = profile.role === "admin";
  const views = VIEWS.filter((v) => isAdmin || !v.admin);
  const mobile = views.length > 5 ? views.filter((v) => MOBILE.includes(v.href)) : views;
  const current = (href: string) => (path === href || path.startsWith(href + "/") ? "page" : undefined);
  // A group heading shows above the first link of each group; later links stay in it.
  const headed = views.map((v, i) => ({ v, heading: v.group && !views.slice(0, i).some((x) => x.group === v.group) ? v.group : null }));

  return (
    <div className="app">
      <aside className="side" aria-label="Main">
        <div className="brand">
          <MeldMark size={38} className="mark-dark" />
          <div>
            <b>MELD</b>
            <br />
            <span>Operations</span>
          </div>
        </div>
        <nav className="nav" aria-label="Main">
          {headed.map(({ v, heading }) => (
            <div key={v.href} style={{ display: "contents" }}>
              {heading && <div className="group">{heading}</div>}
              <Link href={v.href} aria-current={current(v.href)}>
                <Icon name={v.icon} />
                <span>{v.label}</span>
              </Link>
            </div>
          ))}
        </nav>
        <div className="side-foot">
          <div className="who">
            <b>{profile.name || profile.email}</b>
            <span>
              {profile.title && profile.title !== "Admin" ? `${profile.title} · ` : ""}
              {roleLabel(profile.role)}
            </span>
          </div>
          <button className="ghost-d" type="button" onClick={cycleTheme}>
            Theme: {theme}
          </button>
          <form action={signOut}>
            <button className="ghost-d" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="mainwrap">
        <header className="top">
          <span className="mob-brand">
            <MeldMark size={28} />
            MELD
          </span>
          <div className="switcher">
            <label htmlFor="merchantSel">Merchant</label>
            <select
              id="merchantSel"
              className="input"
              value={merchantId ?? ""}
              disabled={!merchants.length}
              onChange={(e) => {
                const id = e.target.value;
                startTransition(async () => {
                  try {
                    await setMerchant(id);
                    router.refresh();
                  } catch (err) {
                    toast(err instanceof Error ? err.message : "Couldn’t switch merchant.");
                  }
                });
              }}
            >
              {!merchants.length && <option value="">No merchants yet</option>}
              {merchants.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <span className="spacer" />
          <span className="rolechip">
            {profile.name || profile.email}, {roleLabel(profile.role)}
          </span>
          <button className="btn sm hide-desk" type="button" onClick={() => menu.current?.showModal()}>
            Account
          </button>
        </header>
        <main id="main" tabIndex={-1}>
          {children}
        </main>
      </div>

      <nav className="bottom" aria-label="Main" style={{ ["--n" as string]: mobile.length }}>
        {mobile.map((v) => (
          <Link key={v.href} href={v.href} aria-current={current(v.href)}>
            <Icon name={v.icon} />
            <span>{v.short}</span>
          </Link>
        ))}
      </nav>

      <dialog ref={menu} aria-labelledby="acct-title">
        <div className="dlg-h">
          <h2 id="acct-title">{profile.name || profile.email}</h2>
          <p className="small muted">
            {profile.title} · {roleLabel(profile.role)}
          </p>
        </div>
        <div className="dlg-b" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {views
            .filter((v) => !mobile.includes(v))
            .map((v) => (
              <Link key={v.href} className="btn" href={v.href} onClick={() => menu.current?.close()}>
                {v.label}
              </Link>
            ))}
          <button className="btn" type="button" onClick={cycleTheme}>
            Theme: {theme}
          </button>
          <form action={signOut} style={{ display: "contents" }}>
            <button className="btn danger" type="submit">
              Sign out
            </button>
          </form>
        </div>
        <div className="dlg-f">
          <button className="btn" type="button" onClick={() => menu.current?.close()}>
            Close
          </button>
        </div>
      </dialog>
    </div>
  );
}
