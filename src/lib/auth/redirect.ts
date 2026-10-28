/**
 * Post-login destination handling.
 *
 * The `next` value arrives in the query string, so it is attacker-controlled:
 * a crafted login link could otherwise bounce a user to an external site once
 * they authenticate. Only a same-site path is accepted; everything else falls
 * back to the dashboard.
 */
export const DEFAULT_LANDING = "/dashboard";

export function safeNextPath(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_LANDING;
  if (!raw.startsWith("/")) return DEFAULT_LANDING;
  // "//host" and "/\host" are protocol-relative and leave the origin.
  if (raw.startsWith("//") || raw.startsWith("/\\")) return DEFAULT_LANDING;
  // A backslash or an embedded scheme can be normalised into an absolute URL
  // by some browsers, so reject both outright.
  if (raw.includes("\\") || raw.includes("://")) return DEFAULT_LANDING;
  return raw;
}
