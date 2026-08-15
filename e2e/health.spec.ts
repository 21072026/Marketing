import { expect, test } from "@playwright/test";

import { E2E_HEALTH_TOKEN } from "../playwright.config";

// /api/health backs uptime monitoring AND the deploy pipeline: the drift gate in
// deploy-prod.yml and the post-swap check in infra/deploy-prod.sh both read `sha`
// from here. It must stay cheap, side-effect free, and honest about which build
// is live.
//
// What it may *say* to an anonymous caller is narrower: version and git sha tell
// an attacker which CVEs apply to this deployment. Those fields are gated on
// HEALTH_TOKEN, which the local webServer sets (playwright.config.ts). Against a
// deployed BASE_URL the token is whatever that env uses, so the gated-shape
// assertions only run locally.
const local = !process.env.BASE_URL;

test("health endpoint reports ok without a DB check", { tag: "@smoke" }, async ({ request }) => {
  const response = await request.get("/api/health", {
    headers: local ? { "X-Health-Token": E2E_HEALTH_TOKEN } : {},
  });

  expect(response.status()).toBe(200);

  const body = await response.json();
  expect(body.status).toBe("ok");
  expect(typeof body.version).toBe("string");
  expect(typeof body.sha).toBe("string");
  expect(body.db).toBe("skipped");
  expect(typeof body.responseMs).toBe("number");
});

test("health endpoint verifies DB connectivity when asked", { tag: "@smoke" }, async ({ request }) => {
  const response = await request.get("/api/health?db=1", {
    headers: local ? { "X-Health-Token": E2E_HEALTH_TOKEN } : {},
  });

  // 200 when the DB is reachable (CI/preview), 503 when it is degraded.
  expect([200, 503]).toContain(response.status());

  const body = await response.json();
  expect(["ok", "error"]).toContain(body.db);
});

test("an anonymous caller sees liveness only, not the version or sha", { tag: "@smoke" }, async ({ request }) => {
  test.skip(!local, "a deployed env may not have HEALTH_TOKEN configured");

  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);

  const body = await response.json();
  // Still everything an uptime monitor acts on…
  expect(body.status).toBe("ok");
  // …and nothing that answers "which CVEs apply here?".
  expect(body.version).toBeUndefined();
  expect(body.sha).toBeUndefined();
  expect(body.uptimeMs).toBeUndefined();

  // A wrong token is no better than none.
  const wrong = await request.get("/api/health", { headers: { "X-Health-Token": "not-the-token" } });
  expect((await wrong.json()).version).toBeUndefined();
});

test("an anonymous caller cannot make the server open a DB connection", { tag: "@smoke" }, async ({ request }) => {
  test.skip(!local, "a deployed env may not have HEALTH_TOKEN configured");

  // `?db=1` is a query parameter. If it decided on its own whether the server
  // opens a database connection, anyone could make this box do work on demand.
  const response = await request.get("/api/health?db=1");
  expect(response.status()).toBe(200);
  expect((await response.json()).db).toBeUndefined();

  // The same request from an operator still does the work.
  const authorized = await request.get("/api/health?db=1", {
    headers: { "X-Health-Token": E2E_HEALTH_TOKEN },
  });
  expect(["ok", "error"]).toContain((await authorized.json()).db);
});

test("the SMTP check is a route of its own and requires authorization", { tag: "@smoke" }, async ({ request }) => {
  test.skip(!local, "a deployed env may not have HEALTH_TOKEN configured");

  // Opening an SMTP session is the most side-effecting thing any probe here
  // does, and its error text describes the mail configuration. An anonymous
  // caller must not be able to trigger it at all — not even to learn that it
  // failed.
  const anonymous = await request.get("/api/health/smtp");
  expect(anonymous.status()).toBe(401);
  const body = await anonymous.json();
  expect(body.smtp).toBeUndefined();
  expect(body.error).toBe("Unauthorized");

  // An operator gets a real answer. CI has no SMTP configured, so "error" is
  // the expected result there — what matters is that the check ran.
  const authorized = await request.get("/api/health/smtp", {
    headers: { "X-Health-Token": E2E_HEALTH_TOKEN },
  });
  expect([200, 503]).toContain(authorized.status());
  expect(["ok", "error"]).toContain((await authorized.json()).smtp);
});
