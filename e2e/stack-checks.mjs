// Assertions for the Docker Compose end-to-end job (.github/workflows/e2e.yml).
//
//   node e2e/stack-checks.mjs <check>
//
// Each check is one workflow step, so a failure names the broken promise and
// the job log shows per-step timings. Checks share state (the session cookie
// and run ID) through a JSON file in $RUNNER_TEMP. They talk to the stack the
// way a user does: the setup service's printed sign-in details, the published
// web port, and the public API. Only `docker compose logs` is read directly.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const APP_URL = process.env.E2E_APP_URL ?? "http://localhost:3000";
const STATE_PATH = join(process.env.RUNNER_TEMP ?? "/tmp", "bestdecks-e2e-state.json");
const FIXTURE_TARGET = "https://northwind.example.com/";
const TERMINAL_STATES = new Set(["delivered", "failed", "partially_completed", "cancelled"]);

function loadState() {
  return existsSync(STATE_PATH) ? JSON.parse(readFileSync(STATE_PATH, "utf8")) : {};
}

function saveState(patch) {
  writeFileSync(STATE_PATH, JSON.stringify({ ...loadState(), ...patch }), { mode: 0o600 });
}

function compose(...args) {
  const result = spawnSync("docker", ["compose", ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, `docker compose ${args.join(" ")} failed:\n${result.stderr}`);
  return result.stdout;
}

async function request(path, { method = "GET", body, headers = {}, cookie } = {}) {
  const response = await fetch(`${APP_URL}${path}`, {
    method,
    redirect: "manual",
    headers: {
      // Browsers send Origin on every mutation; the app rejects any other origin.
      ...(method === "GET" ? {} : { Origin: APP_URL }),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { response, text, json };
}

const checks = {
  /** The setup service printed how to sign in, and nothing needed editing. */
  credentials() {
    const logs = compose("logs", "--no-color", "--no-log-prefix", "setup");
    console.log(logs.replace(/^( {2}password: )\S+/mu, "$1<redacted>"));
    const email = logs.match(/^ {2}email: +(\S+)$/mu)?.[1];
    const password = logs.match(/^ {2}password: (\S+) {3}\(generated now/mu)?.[1];
    assert.ok(email, "setup did not print the admin email");
    assert.ok(password, "setup did not print a generated admin password");
    console.log(`::add-mask::${password}`);
    assert.match(logs, /First run: generated \d+ local secret\(s\)/u);
    assert.match(logs, /^ {2}\[ok\] Research: first-party site research/mu);
    assert.match(logs, new RegExp(`Bestdecks will be at ${APP_URL} once the app is healthy`, "u"));
    saveState({ email, password });
  },

  /** The printed URL serves the sign-in page and the printed account works. */
  async "api-sign-in"() {
    const { email, password } = loadState();
    const login = await request("/login");
    assert.equal(login.response.status, 200, "GET /login");
    assert.match(login.text, /Sign in/u);

    const signIn = await request("/api/auth/sign-in/email", {
      method: "POST",
      body: { email, password },
    });
    assert.equal(signIn.response.status, 200, `sign-in: ${signIn.text.slice(0, 300)}`);
    const cookie = signIn.response.headers.getSetCookie()
      .map((header) => header.split(";")[0])
      .join("; ");
    assert.ok(cookie, "sign-in set no session cookie");

    const session = await request("/api/auth/get-session", { cookie });
    assert.equal(session.json?.user?.email, email);
    assert.equal(session.json?.user?.role, "admin");
    saveState({ cookie });
    console.log(`Signed in as ${email} (role: ${session.json.user.role}).`);
  },

  /** A real browser renders the sign-in page and lands on the console. */
  async "browser-sign-in"() {
    const { email, password } = loadState();
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      const blocked = [];
      page.on("console", (message) => {
        if (message.type() === "error") blocked.push(message.text());
      });
      await page.goto(`${APP_URL}/login`, { waitUntil: "networkidle" });
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill(password);
      await page.getByRole("button", { name: "Sign in" }).click();
      await page.waitForURL(`${APP_URL}/console`, { timeout: 30_000 });
      assert.deepEqual(blocked, [], "browser console errors");
      console.log(`Browser sign-in reached ${page.url()}.`);
    } finally {
      await browser.close();
    }
  },

  /** A run is accepted through the API and queued for the worker. */
  async "create-run"() {
    const { cookie } = loadState();
    const example = JSON.parse(readFileSync("examples/run-input.example.json", "utf8"));
    const created = await request("/api/runs", {
      method: "POST",
      cookie,
      headers: { "Idempotency-Key": `e2e-${randomUUID()}` },
      body: {
        run: {
          ...example,
          targets: [{ websiteUrl: FIXTURE_TARGET, companyName: "Northwind Freight" }],
        },
      },
    });
    assert.equal(created.response.status, 202, `create run: ${created.text.slice(0, 500)}`);
    assert.equal(created.json?.state, "queued");
    saveState({ runId: created.json.runId });
    console.log(`Run ${created.json.runId} queued.`);
  },

  /**
   * The worker crawls the fixture site with the built-in crawler, then stops
   * at research because the Gemini key is a placeholder, and says so.
   */
  async pipeline() {
    const { cookie, runId } = loadState();
    const deadline = Date.now() + 5 * 60_000;
    let detail;
    for (;;) {
      const result = await request(`/api/runs/${runId}`, { cookie });
      assert.equal(result.response.status, 200, `run detail: ${result.text.slice(0, 300)}`);
      detail = result.json;
      if (TERMINAL_STATES.has(detail.status)) break;
      assert.ok(Date.now() < deadline, `run still ${detail.status} after 5 minutes`);
      await new Promise((resolve) => setTimeout(resolve, 3_000));
    }
    const events = detail.events.map(({ stage, level, message }) => `${stage} ${level}: ${message}`);
    console.log(`Run ${runId}: ${detail.status}\n  ${events.join("\n  ")}`);
    console.log(`lastError: ${detail.lastError ?? "(none)"}`);

    assert.equal(detail.status, "failed");
    const crawled = events.find((event) => event.startsWith("crawling info: Crawl retained"));
    assert.ok(crawled, "no crawl success event");
    assert.ok(Number(crawled.match(/retained (\d+) page/u)?.[1]) >= 3, crawled);
    const guidance = events.find((event) => event.startsWith(
      "enriching error: Gemini rejected the configured credentials. Set GEMINI_API_KEY in .env",
    ));
    assert.ok(guidance, "research did not fail with Gemini key guidance");
    assert.match(guidance, /\(ProviderAdapterError:authentication\)$/u);
    assert.match(detail.lastError ?? "", /GEMINI_API_KEY/u);

    const fixtureLog = compose("logs", "--no-color", "--no-log-prefix", "fixture-site");
    assert.match(fixtureLog, /^GET \/robots\.txt 200$/mu, "crawler skipped robots.txt");
    assert.doesNotMatch(fixtureLog, /^GET \/internal\//mu, "crawler ignored robots.txt");
  },
};

const name = process.argv[2];
if (!checks[name]) {
  console.error(`Usage: node e2e/stack-checks.mjs <${Object.keys(checks).join("|")}>`);
  process.exit(2);
}
await checks[name]();
