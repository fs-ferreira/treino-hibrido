export function readConfig(env = process.env) {
  const required = [
    "DATABASE_URL",
    "BETTER_AUTH_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "BETTER_AUTH_URL",
    "ALLOWED_GOOGLE_EMAILS",
  ];
  if (
    required.some((key) => !env[key]?.trim()) ||
    env.BETTER_AUTH_SECRET.length < 32
  )
    throw Error("SERVER_NOT_CONFIGURED");
  const url = new URL(env.BETTER_AUTH_URL);
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
    throw Error("INVALID_SERVER_ORIGIN");
  const emails = new Set(
    env.ALLOWED_GOOGLE_EMAILS.split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
  if (!emails.size) throw Error("EMPTY_ALLOWLIST");
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
