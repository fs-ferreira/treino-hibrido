import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { allowedEmail } from "./config.js";
export function createAuth(pool, config) {
  const assertAllowed = (user) => {
    if (!user?.emailVerified || !allowedEmail(config, user.email))
      throw new APIError("FORBIDDEN", { message: "Conta não autorizada." });
  };
  return betterAuth({
    database: pool,
    baseURL: config.origin,
    secret: config.secret,
    trustedOrigins: [config.origin],
    emailAndPassword: { enabled: false },
    socialProviders: {
      google: {
        clientId: config.googleId,
        clientSecret: config.googleSecret,
        prompt: "select_account",
        scope: ["openid", "email", "profile"],
        mapProfileToUser(profile) {
          // Check the current verified provider claim on returning logins too.
          assertAllowed({
            email: profile.email,
            emailVerified: profile.email_verified,
          });
          return {};
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    account: { accountLinking: { enabled: false }, encryptOAuthTokens: true },
    user: { changeEmail: { enabled: false } },
    advanced: {
      useSecureCookies: config.production,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: config.production,
      },
    },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 60 },
    logger: { disabled: true },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            assertAllowed(user);
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const user = (
              await pool.query(
                'SELECT email,"emailVerified" FROM "user" WHERE id=$1',
                [session.userId],
              )
            ).rows[0];
            assertAllowed(user);
          },
        },
      },
    },
  });
}
