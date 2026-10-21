import { expect, it } from "vitest";
import { resellerDirectoryResponse } from "./reseller-directory-response.js";
it.each(["agents", "resellers"])("adapts the existing directory for %s without losing pagination", async kind => {
  const response = await resellerDirectoryResponse(Response.json({ success: true, data: { page: 2, hasMore: true, items: [{ publicId: "USR-1", country: "PK" }] } }, { headers: { "Cache-Control": "no-store" } }), kind);
  const body = await response.json();
  expect(body.data[kind][0]).toMatchObject({ publicId: "USR-1", country: "PK" });
  expect(body.data.page).toBe(2); expect(body.data.hasMore).toBe(true);
  if (kind === "agents") expect(body.data.agents[0].contact).toEqual({ type: "CHAT", publicId: "USR-1" });
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});
it("passes through session and eligibility errors unchanged", async () => {
  const denied = Response.json({ error: { code: "INVALID_SESSION" } }, { status: 401 });
  expect(await resellerDirectoryResponse(denied, "agents")).toBe(denied);
});
