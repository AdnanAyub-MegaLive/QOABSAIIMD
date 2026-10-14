import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import { expect, it } from "vitest";

it("keeps the custom server compatible with its CommonJS entrypoint", () => {
  // Next build does not compile server.js. Static ESM imports here would
  // reclassify it as ESM and make its existing require calls crash at startup.
  const source = readFileSync(new URL("../../server.js", import.meta.url), "utf8");
  expect(() => new Script(source, { filename: "server.js" })).not.toThrow();
});
