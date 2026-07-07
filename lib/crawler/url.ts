import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * URL normalization and SSRF protection.
 *
 * Everything the crawler fetches comes from user input, so every URL is
 * validated here first: only http(s), only public IPs, tracking params and
 * fragments stripped so the same page never appears twice under two URLs.
 */

const TRACKING_PARAMS = /^(utm_|fbclid|gclid|mc_cid|mc_eid|ref$)/;

/** Coerce raw user input ("stripe.com") into a full https URL, or throw. */
export function coerceInputUrl(input: string): URL {
  const trimmed = input.trim();
  if (!trimmed) throw new UserFacingError("Please enter a website URL.");
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new UserFacingError(`"${input}" doesn't look like a valid URL.`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new UserFacingError("Only http(s) URLs are supported.");
  }
  if (!url.hostname.includes(".") || url.hostname.endsWith(".local")) {
    throw new UserFacingError(`"${url.hostname}" is not a public hostname.`);
  }
  return url;
}

/** Canonical domain used as the directory's primary key: lowercase, no www. */
export function normalizeDomain(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

/** Normalize a URL for dedup: drop fragment, tracking params, trailing slash. */
export function normalizeUrl(url: URL): string {
  const u = new URL(url.href);
  u.hash = "";
  const kept = [...u.searchParams.entries()].filter(([k]) => !TRACKING_PARAMS.test(k));
  u.search = "";
  for (const [k, v] of kept.sort(([a], [b]) => a.localeCompare(b))) u.searchParams.append(k, v);
  u.pathname = u.pathname.replace(/\/index\.(html?|php)$/i, "/");
  if (u.pathname !== "/" && u.pathname.endsWith("/")) u.pathname = u.pathname.slice(0, -1);
  return u.href;
}

/** True if two URLs belong to the same site (ignoring www / scheme). */
export function sameSite(a: URL, b: URL): boolean {
  return normalizeDomain(a.hostname) === normalizeDomain(b.hostname);
}

function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 6) {
    const lower = ip.toLowerCase();
    if (lower.startsWith("::ffff:")) return isPrivateIp(lower.slice(7)); // v4-mapped
    return (
      lower === "::1" ||
      lower.startsWith("fe80:") || // link-local
      lower.startsWith("fc") ||
      lower.startsWith("fd") // unique-local
    );
  }
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224 // multicast + reserved
  );
}

/**
 * Reject URLs that resolve to private/internal addresses. Without this the
 * deployed crawler is an open proxy into the hosting network (SSRF).
 */
export async function assertPublicHost(url: URL): Promise<void> {
  const host = url.hostname;
  if (isIP(host) && isPrivateIp(host)) {
    throw new UserFacingError("That address points to a private network.");
  }
  if (!isIP(host)) {
    let addresses;
    try {
      addresses = await lookup(host, { all: true });
    } catch {
      throw new UserFacingError(`Could not resolve "${host}" — is the domain correct?`);
    }
    if (addresses.some((a) => isPrivateIp(a.address))) {
      throw new UserFacingError("That address points to a private network.");
    }
  }
}

/** Error whose message is safe to show directly to the user. */
export class UserFacingError extends Error {}
