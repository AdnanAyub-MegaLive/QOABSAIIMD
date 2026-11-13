import { readFileSync, writeFileSync, mkdirSync, existsSync, symlinkSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { config } from "dotenv";

const appName = "megalive-portal";
const readJson = file => JSON.parse(readFileSync(file, "utf8"));
const writeJson = (file, data) => writeFileSync(file, JSON.stringify(data, null, 2), { mode: 0o600 });

if (process.argv[2] === "--health") {
  const release = path.resolve(process.argv[3]);
  const app = readJson(path.join(release, "release.ecosystem.json")).apps[0];
  config({ path: path.join(release, ".env.local"), quiet: true });
  const port = Number(app.env.PORT || process.env.PORT || 3000);
  let healthy = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const processes = JSON.parse(execFileSync("pm2", ["jlist"], { encoding: "utf8", timeout: 10000 }));
      const current = processes.find(p => p.name === appName);
      if (current?.pm2_env?.status !== "online" || path.resolve(current.pm2_env.pm_cwd) !== release) throw Error("Release is not online");
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(3000) });
      if (response.ok && (await response.json()).data?.status === "ready") { healthy = true; break; }
    } catch { /* Give the custom server time to prepare Next and connect to the DB. */ }
    await delay(2000);
  }
  if (!healthy) throw Error("New portal release did not pass its health check.");
  console.log("Portal health check passed.");
} else {
  const repo = path.resolve(process.argv[2]), release = path.resolve(process.argv[3]);
  const matches = readJson(path.join(release, "pm2-before.json")).filter(p => p.name === appName);
  if (matches.length !== 1) throw Error("Expected one existing megalive-portal PM2 process.");
  const old = matches[0].pm2_env;
  if (old.watch || old.exec_mode === "cluster_mode") throw Error("This deployment requires the existing single-process portal with PM2 watch disabled.");
  const previous = {
    name: appName, script: old.pm_exec_path, cwd: old.pm_cwd,
    // PM2 restarts merge resolved fields; script/cwd alone can retain old paths.
    pm_exec_path: old.pm_exec_path, pm_cwd: old.pm_cwd,
    exec_interpreter: old.exec_interpreter || "node",
    interpreter: old.exec_interpreter || "node", exec_mode: "fork", instances: 1,
    env: old.env || {}, watch: false,
  };
  for (const key of ["args", "node_args", "kill_timeout", "restart_delay", "max_memory_restart", "autorestart", "min_uptime", "max_restarts", "uid", "gid", "time", "log_date_format"]) {
    if (old[key] !== undefined) previous[key] = old[key];
  }
  if (old.pm_out_log_path) previous.out_file = old.pm_out_log_path;
  if (old.pm_err_log_path) previous.error_file = old.pm_err_log_path;
  writeJson(path.join(release, "previous.ecosystem.json"), { apps: [previous] });
  config({ path: path.join(repo, ".env.local"), quiet: true });
  const env = { ...previous.env, NODE_ENV: "production" };
  // Relative credential/tool paths were originally relative to the checkout.
  for (const key of ["GOOGLE_APPLICATION_CREDENTIALS", "FFMPEG_PATH", "FFPROBE_PATH"]) {
    const value = env[key] || process.env[key];
    if (value && !path.isAbsolute(value) && (key === "GOOGLE_APPLICATION_CREDENTIALS" || value.includes("/"))) env[key] = path.resolve(repo, value);
  }
  const storage = env.EVENTS_STORAGE_ROOT || process.env.EVENTS_STORAGE_ROOT || "storage/events";
  // Match eventStoragePaths' path.join semantics, including legacy absolute values.
  const destination = path.join(release, storage), source = path.join(repo, storage);
  if (!destination.startsWith(release + path.sep) || !source.startsWith(repo + path.sep)) throw Error("Events storage must stay inside the checkout for release deployment.");
  mkdirSync(source, { recursive: true });
  if (!existsSync(destination)) {
    mkdirSync(path.dirname(destination), { recursive: true });
    symlinkSync(source, destination, "dir");
  } else if (!destination.startsWith(path.join(release, "storage") + path.sep)) {
    throw Error("Custom events storage collides with release files.");
  }
  writeJson(path.join(release, "release.ecosystem.json"), { apps: [{ ...previous, script: path.join(release, "server.js"), pm_exec_path: path.join(release, "server.js"), cwd: release, pm_cwd: release, args: [], env }] });
}
