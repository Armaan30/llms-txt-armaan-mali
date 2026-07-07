import { assertPublicHost, UserFacingError } from "./url";

/**
 * All outbound HTTP goes through safeFetch. It enforces the crawl budget's
 * per-request limits and re-validates every redirect hop, so a public URL
 * that redirects to an internal address is still blocked.
 */

const USER_AGENT =
  "llms-txt-generator/1.0 (+https://github.com/armaan-mali/llms-txt-armaan-mali)";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB

export interface FetchResult {
  finalUrl: URL;
  status: number;
  contentType: string;
  body: string;
}

export async function safeFetch(url: URL): Promise<FetchResult> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(current);
    const res = await fetch(current.href, {
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml,text/plain;q=0.9,*/*;q=0.5",
        "Accept-Language": "en",
      },
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      res.body?.cancel();
      if (!location) throw new Error(`Redirect from ${current.href} without a Location header`);
      current = new URL(location, current);
      continue;
    }

    const contentType = res.headers.get("content-type") ?? "";
    const body = await readBounded(res);
    return { finalUrl: current, status: res.status, contentType, body };
  }
  throw new Error(`Too many redirects starting from ${url.href}`);
}

/** Read at most MAX_BODY_BYTES so a huge or endless response can't wedge a crawl. */
async function readBounded(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let text = "";
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    text += decoder.decode(value, { stream: true });
    if (bytes >= MAX_BODY_BYTES) {
      await reader.cancel();
      break;
    }
  }
  return text + decoder.decode();
}

/** Fetch a page, retrying once on transient failures (network blip, 5xx). */
export async function fetchWithRetry(url: URL): Promise<FetchResult> {
  try {
    const first = await safeFetch(url);
    if (first.status >= 500) throw new Error(`HTTP ${first.status}`);
    return first;
  } catch (err) {
    if (err instanceof UserFacingError) throw err; // validation failures don't retry
    await new Promise((r) => setTimeout(r, 500));
    return safeFetch(url);
  }
}
