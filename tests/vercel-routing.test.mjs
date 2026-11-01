import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { Readable } from "node:stream";
import { nodeHandler, createApi } from "../server/http.js";
import { ApiError } from "../server/service.js";

test("Vercel explicitly routes all API depths to an existing plain Node function", async () => {
  const config = JSON.parse(
    await readFile(new URL("../vercel.json", import.meta.url), "utf8"),
  );
  assert.equal(config.framework, null);
  const rule = config.rewrites.find((rule) => rule.source === "/api/:path*");
  assert.equal(rule?.destination, "/api/index");
  const files = await readdir(new URL("../api/", import.meta.url));
  assert.deepEqual(files, ["index.js"]);
  const entry = await import("../api/index.js");
  assert.equal(typeof entry.default, "function");
  for (const path of [
    "/api/me",
    "/api/auth/sign-in/social",
    "/api/auth/callback/google",
    "/api/imports/id/parts/0",
  ]) {
    const match = path.match(/^\/api(?:\/(.*))?$/);
    assert.ok(match, path);
    assert.equal(rule.destination + ".js", "/api/" + files[0]);
  }
});

test("Node function adapter preserves original paths, parsed JSON bodies, cookies and query strings", async () => {
  const origin = "https://example.test";
  let authRequest;
  const api = createApi({
    config: { origin },
    auth: {
      handler: async (request) => {
        authRequest = request;
        return Response.json(
          { url: "https://accounts.google.com/o/oauth2/v2/auth" },
          {
            headers: {
              "Set-Cookie": "state=test; HttpOnly; Secure; SameSite=Lax",
            },
          },
        );
      },
      api: {
        getSession: async () => ({ response: null, headers: new Headers() }),
      },
    },
    service: {
      me: async () => {
        throw new ApiError(401, "AUTH_REQUIRED", "Entre novamente.");
      },
    },
  });
  async function invoke(url, method, body) {
    const req = Readable.from([]);
    Object.assign(req, {
      url,
      method,
      body,
      headers: {
        host: "example.test",
        origin,
        "content-type": "application/json",
      },
    });
    const headers = {};
    let output;
    const res = {
      setHeader: (key, value) => (headers[key.toLowerCase()] = value),
      end: (value) => (output = value),
      writeHead(status, values) {
        this.statusCode = status;
        Object.assign(headers, values);
      },
    };
    await nodeHandler(api)(req, res);
    return { status: res.statusCode, headers, output };
  }
  const me = await invoke("/api/me", "GET");
  assert.equal(me.status, 401);
  const signed = await invoke("/api/auth/sign-in/social", "POST", {
    provider: "google",
  });
  assert.equal(signed.status, 200);
  assert.equal(new URL(authRequest.url).pathname, "/api/auth/sign-in/social");
  assert.equal((await authRequest.json()).provider, "google");
  assert.match(signed.headers["set-cookie"][0], /HttpOnly/);
  const callback = await invoke(
    "/api/auth/callback/google?state=test-state&code=test-code",
    "GET",
  );
  assert.equal(callback.status, 200);
  assert.equal(new URL(authRequest.url).pathname, "/api/auth/callback/google");
  assert.equal(
    new URL(authRequest.url).searchParams.get("state"),
    "test-state",
  );
  assert.equal(new URL(authRequest.url).searchParams.get("code"), "test-code");
});
