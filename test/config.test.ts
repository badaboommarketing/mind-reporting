import test from "node:test";
import assert from "node:assert/strict";

import { loadConfig } from "../src/config.js";

test("prefers Railway public URLs over stale localhost app URL settings", () => {
  const config = loadConfig({
    DATABASE_URL: "postgres://db",
    SESSION_SECRET: "secret",
    PORT: "3000",
    RAILWAY_PUBLIC_DOMAIN: "mind-reporting-production.up.railway.app",
    APP_BASE_URL: "http://localhost:3000",
    GOOGLE_CALLBACK_URL: "http://localhost:3000/auth/google/callback",
  });

  assert.equal(config.appBaseUrl, "https://mind-reporting-production.up.railway.app");
  assert.equal(
    config.googleCallbackUrl,
    "https://mind-reporting-production.up.railway.app/auth/google/callback",
  );
});

test("parses configured platform admin emails", () => {
  const config = loadConfig({
    PLATFORM_ADMIN_EMAILS: "ops@example.com, Owner@example.com\nteam@example.com",
    SEED_ADMIN_EMAIL: "seed@example.com",
  });

  assert.deepEqual(config.platformAdminEmails.sort(), [
    "ops@example.com",
    "owner@example.com",
    "seed@example.com",
    "team@example.com",
  ]);
});
