import { describe, it, expect } from "vitest";
import {
  coerceInputUrl,
  normalizeDomain,
  normalizeUrl,
  sameSite,
  assertPublicHost,
  UserFacingError,
} from "../lib/crawler/url";

describe("normalizeDomain", () => {
  it("lowercases and strips www so variants collapse to one key", () => {
    expect(normalizeDomain("WWW.Stripe.com")).toBe("stripe.com");
    expect(normalizeDomain("stripe.com")).toBe("stripe.com");
    expect(normalizeDomain("www.docs.example.com")).toBe("docs.example.com");
  });
});

describe("normalizeUrl", () => {
  it("drops the fragment", () => {
    expect(normalizeUrl(new URL("https://x.com/a#section"))).toBe("https://x.com/a");
  });
  it("strips tracking params but keeps real ones, sorted", () => {
    expect(normalizeUrl(new URL("https://x.com/a?utm_source=t&b=2&a=1"))).toBe(
      "https://x.com/a?a=1&b=2",
    );
  });
  it("collapses /index.html and trailing slashes", () => {
    expect(normalizeUrl(new URL("https://x.com/dir/index.html"))).toBe("https://x.com/dir");
    expect(normalizeUrl(new URL("https://x.com/dir/"))).toBe("https://x.com/dir");
    expect(normalizeUrl(new URL("https://x.com/"))).toBe("https://x.com/");
  });
  it("makes two spellings of the same page identical", () => {
    const a = normalizeUrl(new URL("https://x.com/pricing/?utm_campaign=ad#top"));
    const b = normalizeUrl(new URL("https://x.com/pricing"));
    expect(a).toBe(b);
  });
});

describe("sameSite", () => {
  it("treats www and apex as the same site", () => {
    expect(sameSite(new URL("https://www.x.com/a"), new URL("https://x.com/b"))).toBe(true);
  });
  it("distinguishes different domains", () => {
    expect(sameSite(new URL("https://x.com/a"), new URL("https://y.com/a"))).toBe(false);
  });
});

describe("coerceInputUrl", () => {
  it("adds https:// to a bare domain", () => {
    expect(coerceInputUrl("stripe.com").href).toBe("https://stripe.com/");
  });
  it("rejects empty input", () => {
    expect(() => coerceInputUrl("   ")).toThrow(UserFacingError);
  });
  it("rejects non-http(s) protocols (e.g. file://)", () => {
    expect(() => coerceInputUrl("file:///etc/passwd")).toThrow(UserFacingError);
    expect(() => coerceInputUrl("ftp://x.com")).toThrow(UserFacingError);
  });
  it("rejects non-public hostnames", () => {
    expect(() => coerceInputUrl("localhost")).toThrow(UserFacingError);
    expect(() => coerceInputUrl("myserver.local")).toThrow(UserFacingError);
  });
});

describe("assertPublicHost (SSRF guard)", () => {
  it("blocks private and internal IP literals", async () => {
    for (const ip of ["10.0.0.5", "127.0.0.1", "192.168.1.1", "172.16.0.1", "169.254.169.254"]) {
      await expect(assertPublicHost(new URL(`http://${ip}/`))).rejects.toThrow(UserFacingError);
    }
  });
  it("blocks the cloud metadata address specifically", async () => {
    await expect(assertPublicHost(new URL("http://169.254.169.254/latest/meta-data"))).rejects.toThrow(
      /private network/,
    );
  });
  it("allows a public IP literal", async () => {
    await expect(assertPublicHost(new URL("http://8.8.8.8/"))).resolves.toBeUndefined();
  });
  it("allows 172.32.x (outside the private 172.16-31 range)", async () => {
    await expect(assertPublicHost(new URL("http://172.32.0.1/"))).resolves.toBeUndefined();
  });
});
