import "server-only";

export const DEMO_LOGIN_ACCOUNTS = {
  admin: "admin@ringo.local",
  seller: "studio@ringo.local",
  buyer: "buyer@ringo.local",
} as const;

export type DemoRole = keyof typeof DEMO_LOGIN_ACCOUNTS;

/** One-click test logins: on in development, off in production unless RINGO_DEMO_LOGIN=true. */
export function demoLoginEnabled() {
  if (process.env.RINGO_DEMO_LOGIN) return process.env.RINGO_DEMO_LOGIN === "true";
  return process.env.NODE_ENV !== "production";
}
