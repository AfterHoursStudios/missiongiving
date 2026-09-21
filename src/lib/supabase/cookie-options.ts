/**
 * Session cookie settings shared by the server, proxy and browser clients. A donor stays signed in for about a year of
 * inactivity (the session is renewed on every visit) until they choose Sign out. Secure cookies in production.
 */
export const SESSION_COOKIE_OPTIONS = {
  maxAge: 60 * 60 * 24 * 400,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
};
