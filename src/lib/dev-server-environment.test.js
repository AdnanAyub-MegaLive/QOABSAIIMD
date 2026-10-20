import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

it("preserves Next's dev manifest flag across forced environment reloads", () => {
  const server = readFileSync("server.js", "utf8");
  const bootstrap = server.slice(0, server.indexOf('const { createServer }'));
  const output = execFileSync(process.execPath, ["-e", `
    process.argv.push("--dev");
    ${bootstrap}
    const env = require("@next/env");
    env.loadEnvConfig(process.cwd(), true);
    env.loadEnvConfig(process.cwd(), true, console, true);
    process.stdout.write(process.env.__NEXT_DEV_SERVER || "MISSING");
  `], { encoding: "utf8" });
  expect(output).toBe("1");
});

it("does not inherit development manifest mode in production", () => {
  const server = readFileSync("server.js", "utf8");
  const bootstrap = server.slice(0, server.indexOf('const { createServer }'));
  const output = execFileSync(process.execPath, ["-e", `
    process.env.__NEXT_DEV_SERVER = "1";
    ${bootstrap}
    process.stdout.write(process.env.__NEXT_DEV_SERVER || "CLEARED");
  `], { encoding: "utf8" });
  expect(output).toBe("CLEARED");
});
