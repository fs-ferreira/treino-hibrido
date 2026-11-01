import test from "node:test";
import assert from "node:assert/strict";
import { readConfig } from "../server/config.js";
import { ConfigurationError, unavailable } from "../server/diagnostics.js";
const config = {
  DATABASE_URL: "postgresql://test:secret@localhost/test",
  BETTER_AUTH_SECRET: "a".repeat(64),
  GOOGLE_CLIENT_ID: "test",
  GOOGLE_CLIENT_SECRET: "test",
  BETTER_AUTH_URL: "https://example.test",
  ALLOWED_GOOGLE_EMAILS: "test@example.test",
};
test("configuration diagnostics identify missing fields and short secrets without logging their values", () => {
  const messages = [];
  for (const [change, code, fields] of [
    [
      { GOOGLE_CLIENT_SECRET: "" },
      "SERVER_NOT_CONFIGURED",
      ["GOOGLE_CLIENT_SECRET"],
    ],
    [
      { BETTER_AUTH_SECRET: "PRIVATE_SHORT_SECRET" },
      "AUTH_SECRET_TOO_SHORT",
      ["BETTER_AUTH_SECRET"],
    ],
    [
      { BETTER_AUTH_URL: "PRIVATE_INVALID_URL" },
      "INVALID_SERVER_ORIGIN",
      ["BETTER_AUTH_URL"],
    ],
    [
      { BETTER_AUTH_URL: "https://example.test/wrong-path" },
      "INVALID_SERVER_ORIGIN",
      ["BETTER_AUTH_URL"],
    ],
  ]) {
    let failure;
    try {
      readConfig({ ...config, ...change });
    } catch (error) {
      failure = error;
    }
    assert.ok(failure instanceof ConfigurationError);
    const response = unavailable(failure, (line) => messages.push(line));
    const event = JSON.parse(messages.at(-1));
    assert.equal(event.code, code);
    assert.deepEqual(event.fields, fields);
    assert.equal(event.requestId, response.requestId);
    assert.equal(response.code, "SERVICE_UNAVAILABLE");
    assert.ok(!("fields" in response));
  }
  assert.ok(!messages.join("").includes("PRIVATE_"));
});
test("database failures log only a fixed category and generic failures do not expose messages or stack", () => {
  for (const [code, expected] of [
    ["42P01", "DATABASE_SCHEMA_MISSING"],
    ["28P01", "DATABASE_AUTH_FAILED"],
    ["ENOTFOUND", "DATABASE_HOST_UNREACHABLE"],
    ["PRIVATE_CREDENTIAL", "INTERNAL_ERROR"],
  ]) {
    let logged;
    const error = Object.assign(new Error("password=PRIVATE_CREDENTIAL"), {
      code,
      detail: "PRIVATE_CREDENTIAL",
    });
    const response = unavailable(error, (line) => (logged = line));
    assert.equal(JSON.parse(logged).code, expected);
    assert.ok(
      !(logged + JSON.stringify(response)).includes("PRIVATE_CREDENTIAL"),
    );
  }
});
