import { randomUUID } from "node:crypto";
const configFields = new Set([
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "BETTER_AUTH_URL",
  "ALLOWED_GOOGLE_EMAILS",
]);
const configCodes = new Set([
  "SERVER_NOT_CONFIGURED",
  "AUTH_SECRET_TOO_SHORT",
  "INVALID_SERVER_ORIGIN",
  "EMPTY_ALLOWLIST",
]);
export class ConfigurationError extends Error {
  constructor(code, fields) {
    super(code);
    this.code = code;
    this.fields = fields;
  }
}
const databaseCodes = {
  "42P01": "DATABASE_SCHEMA_MISSING",
  "28P01": "DATABASE_AUTH_FAILED",
  "3D000": "DATABASE_NOT_FOUND",
  ENOTFOUND: "DATABASE_HOST_UNREACHABLE",
  ECONNREFUSED: "DATABASE_CONNECTION_REFUSED",
  ETIMEDOUT: "DATABASE_TIMEOUT",
  CERT_HAS_EXPIRED: "DATABASE_TLS_ERROR",
  DEPTH_ZERO_SELF_SIGNED_CERT: "DATABASE_TLS_ERROR",
};
// Logs contain only fixed codes and known variable NAMES. Never log error.message,
// stack, request headers/body, cookies, connection strings, or provider responses.
export function unavailable(error, log = (value) => console.error(value)) {
  const requestId = randomUUID();
  const configured =
    error instanceof ConfigurationError && configCodes.has(error.code);
  const event = {
    event: "api_unavailable",
    requestId,
    code: configured
      ? error.code
      : Object.hasOwn(databaseCodes, error?.code)
        ? databaseCodes[error.code]
        : "INTERNAL_ERROR",
    ...(configured
      ? { fields: error.fields.filter((field) => configFields.has(field)) }
      : {}),
  };
  try {
    log(JSON.stringify(event));
  } catch {
    /* Reporting must not break the response. */
  }
  return {
    code: "SERVICE_UNAVAILABLE",
    message: "Serviço indisponível. Tente novamente.",
    requestId,
  };
}
