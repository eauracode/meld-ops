export function StatusPill({ status }: { status: string }) {
  return <span className={`pill st-${(status || "Pending").split(" ")[0]}`}>{status || "Pending"}</span>;
}
