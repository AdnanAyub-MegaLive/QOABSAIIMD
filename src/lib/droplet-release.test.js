import { afterEach, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const helper = path.resolve("scripts/prepare-droplet-release.mjs");
const fixtures = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    if (path.dirname(fixture) !== path.resolve(tmpdir()) || !path.basename(fixture).startsWith("portal-release-test-")) throw Error("Unexpected cleanup path");
    rmSync(fixture, { recursive: true, force: true });
  }
});
function setup(overrides = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "portal-release-test-")); fixtures.push(root);
  const repo = path.join(root, "checkout"), release = path.join(root, "release");
  mkdirSync(path.join(repo, "storage", "events"), { recursive: true }); mkdirSync(release);
  symlinkSync(path.join(repo, "storage"), path.join(release, "storage"), process.platform === "win32" ? "junction" : "dir");
  writeFileSync(path.join(repo, ".env.local"), "");
  const old = { pm_exec_path: path.join(repo, "server.js"), pm_cwd: repo, exec_mode: "fork_mode", watch: false, env: { PORT: "3000", GOOGLE_APPLICATION_CREDENTIALS: "secrets/google.json" }, kill_timeout: 5000, ...overrides };
  writeFileSync(path.join(release, "pm2-before.json"), JSON.stringify([{ name: "megalive-portal", pm2_env: old }]));
  return { repo, release, run: () => execFileSync(process.execPath, [helper, repo, release], { encoding: "utf8", env: { ...process.env, EVENTS_STORAGE_ROOT: "storage/events" }, stdio: "pipe" }) };
}
it("retains rollback settings and switches only the new release's script/cwd", () => {
  const { repo, release, run } = setup(); run();
  const previous = JSON.parse(readFileSync(path.join(release, "previous.ecosystem.json"))).apps[0];
  const next = JSON.parse(readFileSync(path.join(release, "release.ecosystem.json"))).apps[0];
  expect(previous.cwd).toBe(repo); expect(previous.script).toBe(path.join(repo, "server.js"));
  expect(next.cwd).toBe(release); expect(next.script).toBe(path.join(release, "server.js"));
  expect(next.pm_cwd).toBe(release); expect(next.pm_exec_path).toBe(next.script);
  expect(previous.pm_cwd).toBe(repo); expect(previous.pm_exec_path).toBe(previous.script);
  expect(next.env.PORT).toBe("3000"); expect(next.kill_timeout).toBe(5000);
  expect(next.env.GOOGLE_APPLICATION_CREDENTIALS).toBe(path.join(repo, "secrets/google.json"));
  expect(previous.env.GOOGLE_APPLICATION_CREDENTIALS).toBe("secrets/google.json");
});
it.each([{ watch: true }, { exec_mode: "cluster_mode" }])("refuses unsafe process configuration %j before activation", overrides => {
  expect(setup(overrides).run).toThrow();
});
