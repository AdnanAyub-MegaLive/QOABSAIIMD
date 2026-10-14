import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const config = require("../../next.config.js");
const { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER } = require("next/constants");

describe("Server Action upload configuration", () => {
  it.each([PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER])(
    "allows media and poster overhead without relaxing origin checks in %s",
    (phase) => {
      const actions = config(phase).experimental.serverActions;
      expect(actions.bodySizeLimit).toBe("56mb");
      expect(actions.allowedOrigins).toBeUndefined();
    },
  );
  it("keeps development output separate from production builds", () => {
    expect(config(PHASE_DEVELOPMENT_SERVER).distDir).toBe(".next-development");
    expect(config(PHASE_PRODUCTION_BUILD).distDir).toBe(".next");
  });
});
