import { randomUUID } from "node:crypto";
import { ApiError } from "./service.js";
const json = (value, status = 200) =>
  Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export function createApi({ auth, service, config }) {
  return async (request) => {
    let sessionHeaders;
    const reply = (...args) => {
      const response = json(...args);
      if (response.ok)
        for (const cookie of sessionHeaders?.getSetCookie() ?? [])
          response.headers.append("Set-Cookie", cookie);
      return response;
    };
    try {
      const url = new URL(request.url),
        path = url.pathname.replace(/^\/api/, ""),
        method = request.method;
      if (!["GET", "POST", "PUT", "DELETE"].includes(method))
        throw new ApiError(405, "METHOD_NOT_ALLOWED", "Método não permitido.");
      if (
        method !== "GET" &&
        (request.headers.get("origin") !== config.origin ||
          request.headers.get("content-type")?.split(";")[0] !==
            "application/json")
      )
        throw new ApiError(
          403,
          "INVALID_ORIGIN",
          "Solicitação não autorizada.",
        );
      if (path.startsWith("/auth/")) {
        const permitted =
          (method === "POST" &&
            ["/auth/sign-in/social", "/auth/sign-out"].includes(path)) ||
          (method === "GET" &&
            ["/auth/callback/google", "/auth/error"].includes(path));
        if (!permitted)
          return reply({ code: "NOT_FOUND", message: "Não encontrado." }, 404);
        if (path === "/auth/error")
          return Response.redirect(config.origin + "/?authError=1", 303);
        if (path === "/auth/sign-in/social") {
          const body = await request.json();
          if (body?.provider !== "google")
            throw new ApiError(
              400,
              "INVALID_PROVIDER",
              "Use sua conta Google.",
            );
          request = new Request(request.url, {
            method: "POST",
            headers: request.headers,
            body: JSON.stringify({
              provider: "google",
              callbackURL: config.origin + "/",
              errorCallbackURL: config.origin + "/?authError=1",
            }),
          });
        }
        const response = await auth.handler(request);
        const headers = new Headers(response.headers);
        headers.set("Cache-Control", "no-store");
        return new Response(response.body, {
          status: response.status,
          headers,
        });
      }
      const lookup = await auth.api.getSession({
        headers: request.headers,
        query: { disableCookieCache: true },
        returnHeaders: true,
      });
      const session = lookup.response;
      sessionHeaders = lookup.headers;
      const actor = session
        ? { userId: session.user.id, sessionId: session.session.id }
        : null;
      if (method === "GET" && path === "/me")
        return reply(await service.me(actor));
      if (method === "GET" && path === "/diary")
        return reply(await service.read(actor, url.searchParams));
      const body = method === "GET" ? null : await request.json();
      if (
        method === "PUT" &&
        (path === "/settings" || /^\/sessions\/\d{4}-\d{2}-\d{2}$/.test(path))
      )
        return reply(await service.save(actor, path, body));
      if (method === "DELETE" && path === "/diary")
        return reply(await service.clear(actor, body));
      if (method === "POST" && path === "/imports")
        return reply(await service.beginImport(actor, body));
      const part = path.match(/^\/imports\/([0-9a-f-]+)\/parts\/(\d+)$/i);
      if (method === "PUT" && part)
        return reply(
          await service.uploadPart(actor, part[1], Number(part[2]), body),
        );
      const commit = path.match(/^\/imports\/([0-9a-f-]+)\/commit$/i);
      if (method === "POST" && commit)
        return reply(await service.commitImport(actor, commit[1], body));
      return reply({ code: "NOT_FOUND", message: "Não encontrado." }, 404);
    } catch (error) {
      if (error instanceof ApiError)
        return reply(
          { code: error.code, message: error.message },
          error.status,
        );
      if (error instanceof SyntaxError)
        return reply({ code: "INVALID_JSON", message: "JSON inválido." }, 400);
      // Never serialize database/provider exceptions or request bodies.
      return reply(
        {
          code: "SERVICE_UNAVAILABLE",
          message: "Serviço indisponível. Tente novamente.",
          requestId: randomUUID(),
        },
        503,
      );
    }
  };
}
export function nodeHandler(handle) {
  return async (req, res) => {
    try {
      const chunks = [];
      let size = 0;
      if (req.body !== undefined) {
        const body = Buffer.isBuffer(req.body)
          ? req.body
          : Buffer.from(
              typeof req.body === "string"
                ? req.body
                : JSON.stringify(req.body),
            );
        size = body.length;
        chunks.push(body);
      } else
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 2_200_000) {
            res.writeHead(413, { "Cache-Control": "no-store" });
            res.end();
            return;
          }
          chunks.push(chunk);
        }
      if (size > 2_200_000) {
        res.writeHead(413, { "Cache-Control": "no-store" });
        res.end();
        return;
      }
      const headers = new Headers();
      for (const [key, val] of Object.entries(req.headers))
        if (val !== undefined)
          headers.set(key, Array.isArray(val) ? val.join(", ") : val);
      const request = new Request("http://localhost" + req.url, {
        method: req.method,
        headers,
        ...(["GET", "HEAD"].includes(req.method)
          ? {}
          : { body: Buffer.concat(chunks) }),
      });
      const response = await handle(request);
      res.statusCode = response.status;
      for (const [key, val] of response.headers)
        if (key !== "set-cookie") res.setHeader(key, val);
      const cookies = response.headers.getSetCookie();
      if (cookies.length) res.setHeader("Set-Cookie", cookies);
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.writeHead(503, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(
        JSON.stringify({
          code: "SERVICE_UNAVAILABLE",
          message: "Serviço indisponível. Tente novamente.",
        }),
      );
    }
  };
}
