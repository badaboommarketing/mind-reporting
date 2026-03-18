import test from "node:test";
import assert from "node:assert/strict";

import { resolveIdentityLink } from "../src/domain/identity.js";
import { createSeedStore } from "../src/app/seed.js";

test("resolves deterministic identity matches by explicit key", () => {
  const store = createSeedStore();
  const match = resolveIdentityLink(store.identityLinks, {
    explicitContactKey: "contact-a",
  });

  assert.equal(match?.id, "link-a");
});

test("resolves deterministic identity matches by unique email hash", () => {
  const store = createSeedStore();
  const match = resolveIdentityLink(store.identityLinks, {
    email: "lead-b@example.com",
  });

  assert.equal(match?.id, "link-b");
});
