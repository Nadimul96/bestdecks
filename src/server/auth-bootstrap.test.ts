import test from "node:test";
import assert from "node:assert/strict";

import { decideAdminBootstrap } from "./auth-bootstrap";

test("admin bootstrap creates only in an empty user database", () => {
  assert.deepEqual(decideAdminBootstrap(undefined, 0), { action: "create" });
  assert.throws(
    () => decideAdminBootstrap(undefined, 1),
    /requires a fresh user database/,
  );
});

test("admin bootstrap reuses an admin but never promotes an existing user", () => {
  assert.deepEqual(
    decideAdminBootstrap({ id: "admin-1", role: "admin" }, 1),
    { action: "reuse", userId: "admin-1" },
  );
  assert.throws(
    () => decideAdminBootstrap({ id: "user-1", role: "user" }, 1),
    /refused to promote/,
  );
});
