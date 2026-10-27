import Link from "next/link";

/** Shown when the signed-in person has no merchants they can work on yet. */
export function NoMerchant({ title, admin }: { title: string; admin?: boolean }) {
  return (
    <>
      <div className="pagehead">
        <h1>{title}</h1>
      </div>
      <section className="panel">
        <div className="empty">
          <h3>No merchants yet</h3>
          <p>
            {admin
              ? "Add your first merchant, with a pickup address, products and a rate card, to start taking orders."
              : "You haven’t been given any merchants. Ask your admin for access."}
          </p>
          {admin && (
            <Link className="btn primary" href="/merchants">
              Add a merchant
            </Link>
          )}
        </div>
      </section>
    </>
  );
}
