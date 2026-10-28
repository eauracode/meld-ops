// Line icons from the prototype. All decorative: callers give the control its own label.
const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const paths = {
  dash: (
    <>
      <rect x="3" y="3" width="7.5" height="9" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="5" rx="1.5" />
      <rect x="13.5" y="11" width="7.5" height="10" rx="1.5" />
      <rect x="3" y="15" width="7.5" height="6" rx="1.5" />
    </>
  ),
  order: <path d="M12 5v14M5 12h14" />,
  list: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  report: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  remit: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 10v4M18 10v4" />
    </>
  ),
  store: <path d="M4 9l1.5-5h13L20 9M4 9h16v11H4zM9 20v-6h6v6" />,
  rider: (
    <>
      <circle cx="6" cy="17" r="3" />
      <circle cx="18" cy="17" r="3" />
      <path d="M6 17l4-7h5l3 7M14 6h3l1 4" />
    </>
  ),
  team: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.5a3.5 3.5 0 010 7M18.5 14.8c1.6.8 2.6 2.6 3 5.2" />
    </>
  ),
  warn: <path d="M12 3L2 21h20L12 3zM12 10v5M12 18h.01" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5h.01" />
    </>
  ),
  x: <path d="M6 6l12 12M18 6L6 18" />,
  dl: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  wa: (
    <>
      <path d="M4 20l1.3-3.8A8 8 0 1112 20a8 8 0 01-3.9-1z" />
      <path d="M9 9.5c.3 2.3 2.2 4.2 4.5 4.6l1-1.3 1.8.8-.4 1.6c-3.7.2-7-3.1-6.8-6.8l1.6-.4.8 1.8z" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </>
  ),
} as const;

export type IconName = keyof typeof paths | "flag";

export function Icon({ name }: { name: IconName }) {
  if (name === "flag") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M5 3h2v18H5zM8 4h11l-2.5 4L19 12H8z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" {...P} aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

/** The Meld mark: four routes meeting at one node. Colours come from --m-* tokens. */
export function MeldMark({ size, className }: { size: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <g strokeWidth="4.5" strokeLinecap="round" fill="none">
        <path d="M14 26L50 50" style={{ stroke: "var(--m-s1)" }} />
        <path d="M86 26L50 50" style={{ stroke: "var(--m-s2)" }} />
        <path d="M14 74L50 50" style={{ stroke: "var(--m-s1)" }} />
        <path d="M86 74L50 50" style={{ stroke: "var(--m-s2)" }} />
      </g>
      <g style={{ fill: "var(--m-end)" }}>
        <circle cx="14" cy="26" r="6.5" />
        <circle cx="86" cy="26" r="6.5" />
        <circle cx="14" cy="74" r="6.5" />
        <circle cx="86" cy="74" r="6.5" />
      </g>
      <circle cx="50" cy="50" r="16" style={{ fill: "var(--m-node)" }} />
      <circle cx="50" cy="50" r="7" style={{ fill: "var(--m-core)" }} />
    </svg>
  );
}
