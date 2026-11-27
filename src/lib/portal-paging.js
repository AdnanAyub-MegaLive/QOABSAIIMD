export const SERVER_PAGE_SIZE = 50;

/** Read `page` and `q` from a portal page's searchParams. */
export function readPaging(params = {}, { pageSize = SERVER_PAGE_SIZE, maxQuery = 100 } = {}) {
  const page = Math.max(1, Math.min(10000, Number.parseInt(params?.page, 10) || 1));
  const q = String(params?.q ?? "").trim().slice(0, maxQuery);
  return { page, q, skip: (page - 1) * pageSize, take: pageSize, pageSize };
}

/** Fetch one extra row to learn whether a next page exists without counting. */
export function splitPage(rows, take) {
  return { items: rows.slice(0, take), hasNext: rows.length > take };
}
