import { ConfigurationError } from "./diagnostics.js";
export function readConfig(env = process.env) {
  const required = [
    "DATABASE_URL",
    "BETTER_AUTH_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "BETTER_AUTH_URL",
    "ALLOWED_GOOGLE_EMAILS",
  ];
  const missing = required.filter(
    (key) => typeof env[key] !== "string" || !env[key].trim(),
  );
  if (missing.length)
    throw new ConfigurationError("SERVER_NOT_CONFIGURED", missing);
  if (env.BETTER_AUTH_SECRET.length < 32)
    throw new ConfigurationError("AUTH_SECRET_TOO_SHORT", [
      "BETTER_AUTH_SECRET",
    ]);
  let url;
  try {
    url = new URL(env.BETTER_AUTH_URL);
  } catch {
    throw new ConfigurationError("INVALID_SERVER_ORIGIN", ["BETTER_AUTH_URL"]);
  }
  if (
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(
        env.NODE_ENV !== "production" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      ))
  )
    throw new ConfigurationError("INVALID_SERVER_ORIGIN", ["BETTER_AUTH_URL"]);
  const emails = new Set(
    env.ALLOWED_GOOGLE_EMAILS.split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
  if (!emails.size)
    throw new ConfigurationError("EMPTY_ALLOWLIST", ["ALLOWED_GOOGLE_EMAILS"]);
  return {
    origin: url.origin,
    databaseURL: env.DATABASE_URL,
    secret: env.BETTER_AUTH_SECRET,
    googleId: env.GOOGLE_CLIENT_ID,
    googleSecret: env.GOOGLE_CLIENT_SECRET,
    emails,
    production: env.NODE_ENV === "production",
  };
}
export const allowedEmail = (config, email) =>
  typeof email === "string" && config.emails.has(email.trim().toLowerCase());
