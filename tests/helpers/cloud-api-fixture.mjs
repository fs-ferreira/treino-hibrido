import { defaults } from "../../lib/core.js";
export async function mockCloud(page, initial = defaults()) {
  let data = structuredClone(initial),
    generation = "test-generation";
  const operations = new Set();
  const state = {
    get data() {
      return data;
    },
    fail: false,
    revoked: false,
    writes: 0,
  };
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname.slice(4),
      method = request.method();
    const send = (json, status = 200) =>
      route.fulfill({ status, json, headers: { "Cache-Control": "no-store" } });
    if (state.revoked)
      return send(
        {
          code: "SESSION_REVOKED",
          message: "Sua sessão terminou. Entre novamente.",
        },
        401,
      );
    if (state.fail)
      return send(
        { code: "SERVICE_UNAVAILABLE", message: "Serviço indisponível." },
        503,
      );
    if (path === "/me")
      return send({
        user: {
          id: "fixture-user",
          name: "Pessoa teste",
          email: "teste@example.test",
        },
        sessionId: "fixture-session",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        generation,
      });
    if (path === "/diary" && method === "GET")
      return send({
        ...data,
        generation,
        revision: state.writes,
        nextCursor: null,
      });
    const body = request.postDataJSON();
    if (method === "PUT") {
      if (!operations.has(body.operationId)) {
        operations.add(body.operationId);
        state.writes++;
        if (path === "/settings") data.settings = body.value;
        else data.sessions[path.split("/")[2]] = body.value;
      }
      return send({ generation, revision: state.writes });
    }
    if (path === "/auth/sign-out") return send({ success: true });
    if (path === "/diary" && method === "DELETE") {
      data = defaults();
      generation += "-reset";
      return send({ generation });
    }
    return send({ code: "NOT_FOUND" }, 404);
  });
  return state;
}
