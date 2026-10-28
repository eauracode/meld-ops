import "server-only";

// Supabase returns at most 1,000 rows per request, silently. Reports and the dashboard need every
// row in the period, so they read in pages.
const PAGE = 1000;
const MAX_ROWS = 50_000;

type Page = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;

/** `page(from, to)` must return the same ordered query with `.range(from, to)` applied. `T` is the row shape selected. */
export async function fetchAll<T>(page: (from: number, to: number) => Page): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}
