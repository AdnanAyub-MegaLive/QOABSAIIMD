import { expect, it } from "vitest";
import { reviewPage } from "./review-pagination.js";
it("uses timestamp and ID for stable ties without needing the cursor row", () => {
  const date = new Date("2026-10-22T00:00:00Z");
  const page = reviewPage(new URLSearchParams("limit=1"), "queue");
  const result = page.result([{ id: "b", createdAt: date }, { id: "a", createdAt: date }]);
  expect(result.items).toHaveLength(1);
  expect(reviewPage(new URLSearchParams({ cursor: result.nextCursor }), "queue").after).toEqual({ OR: [{ createdAt: { lt: date } }, { createdAt: date, id: { lt: "b" } }] });
  expect(() => reviewPage(new URLSearchParams({ cursor: result.nextCursor }), "other")).toThrow();
});
it("bounds pages and rejects malformed cursors", () => {
  for (const query of ["limit=0", "limit=101", "limit=NaN", "cursor=bad!", "cursor=e30"]) expect(() => reviewPage(new URLSearchParams(query), "queue")).toThrow();
  expect(reviewPage(new URLSearchParams(), "queue").result([])).toEqual({ items: [], nextCursor: null });
});
