// Browser bench runner. Started via `yarn bench:browser`.
//
// Flow: boots the static server (server.mjs) on an ephemeral localhost
// port, then for each scenario and each run spawns a fresh headless Chrome
// with its own throwaway profile pointed at
// `http://127.0.0.1:<port>/?scenario=N`. The page (page.mjs) runs the
// scenario — warmup first, then one timed loop — and POSTs the result to
// `/results`. The server hands the result to this runner, which kills
// Chrome, deletes the profile, and moves on. After RUNS_PER_SCENARIO
// page-loads per scenario the medians are printed as a table.
//
// Results are additionally written by the server as JSON files into a
// temp dir outside the repo (never committed).

import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./server.mjs";

const BROWSER_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(BROWSER_DIR, "../..");
const DIST_INDEX = path.join(REPO_ROOT, "dist/esm/index.mjs");

const CHROME_CANDIDATES = [
  process.env.CHROME_BIN,
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
].filter(Boolean);

const RUNS_PER_SCENARIO = 5;
const RESULT_TIMEOUT_MS = 60_000;

const SCENARIO_NAMES = {
  1: "1. create + connect + disconnect",
  2: "2. re-connect cycle (same instance)",
  3: "3. setAttribute churn, no listener",
  4: "4. setAttribute churn, with onChange",
  5: "5. boolean .get() churn (unset attr)",
  6: "6. portal: churn one child among 30 statics",
  7: "7. string attr property get churn",
};

function fail(message) {
  console.error(`bench:browser: ${message}`);
  process.exit(1);
}

function resolveChromeBin() {
  for (const candidate of CHROME_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  fail(
    "no Chrome/Chromium binary found (looked at: "
      + CHROME_CANDIDATES.join(", ")
      + "). Set CHROME_BIN to point at one.",
  );
}

if (!fs.existsSync(DIST_INDEX)) {
  fail("dist/esm/index.mjs not found — build the library first: `yarn build`.");
}

const chromeBin = resolveChromeBin();
const chromeVersion = execFileSync(chromeBin, ["--version"], { encoding: "utf8" }).trim();

const resultsDir = fs.mkdtempSync(path.join(os.tmpdir(), "wc-toolkit-bench-results-"));
const { port, close } = await startServer({
  resultsDir,
  onResult: result => {
    if (pending) {
      const { resolve } = pending;
      pending = null;
      resolve(result);
    }
  },
});

/**
 * @type {null | {
 *   scenario: number,
 *   resolve: (result: any) => void,
 * }}
 */
let pending = null;

function waitForResult(scenario) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending = null;
      reject(new Error(`timed out after ${RESULT_TIMEOUT_MS}ms waiting for scenario ${scenario} result`));
    }, RESULT_TIMEOUT_MS);
    pending = {
      scenario,
      resolve: result => {
        clearTimeout(timer);
        resolve(result);
      },
    };
  });
}

async function runOnce(scenario) {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "wc-toolkit-bench-profile-"));
  const url = `http://127.0.0.1:${port}/?scenario=${scenario}`;
  const child = spawn(
    chromeBin,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${profileDir}`,
      url,
    ],
    { stdio: "ignore" },
  );

  try {
    const result = await waitForResult(scenario);
    if (result.error) {
      throw new Error(`bench page reported an error: ${result.error}`);
    }
    return result.usPerOp;
  } finally {
    child.kill("SIGKILL");
    // chrome may still be flushing to the profile dir for a moment after
    // the kill, so let rm retry a few times before giving up
    await fs.promises.rm(profileDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const measurements = {};

for (const scenario of Object.keys(SCENARIO_NAMES).map(Number)) {
  const runs = [];
  for (let i = 0; i < RUNS_PER_SCENARIO; i++) {
    runs.push(await runOnce(scenario));
    process.stdout.write(
      `  ${SCENARIO_NAMES[scenario]} — run ${i + 1}/${RUNS_PER_SCENARIO}: ${runs.at(-1).toFixed(3)} µs/op\n`,
    );
  }
  measurements[scenario] = runs;
}

await close();
fs.rmSync(resultsDir, { recursive: true, force: true });

console.log(`\nwc_toolkit browser bench — median µs/op over ${RUNS_PER_SCENARIO} fresh page loads per scenario`);
console.log(`chrome: ${chromeVersion}`);
console.log(`os:     ${os.type()} ${os.release()} (${os.platform()} ${os.arch()})`);
console.log("");
const nameWidth = Math.max(...Object.values(SCENARIO_NAMES).map(name => name.length));
for (const [scenario, name] of Object.entries(SCENARIO_NAMES)) {
  const runs = measurements[scenario];
  const runsStr = runs.map(us => us.toFixed(3)).join(", ");
  console.log(
    `${name.padEnd(nameWidth)}  ${median(runs).toFixed(3).padStart(10)} µs/op  [${runsStr}]`,
  );
}
