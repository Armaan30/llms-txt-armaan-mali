import { describe, it, expect } from "vitest";
import { extractPage, extractNavLinks } from "../lib/crawler/extract";

const PAGE = new URL("https://x.com/page");

describe("extractPage — title fallback chain", () => {
  it("prefers <title>", () => {
    const p = extractPage(`<html><head><title>Real Title</title></head><body></body></html>`, PAGE);
    expect(p.title).toBe("Real Title");
  });
  it("falls back to og:title when <title> is absent", () => {
    const p = extractPage(
      `<html><head><meta property="og:title" content="OG Title"></head><body></body></html>`,
      PAGE,
    );
    expect(p.title).toBe("OG Title");
  });
  it("falls back to the first <h1> when nothing else is present", () => {
    const p = extractPage(`<html><body><h1>Heading Title</h1></body></html>`, PAGE);
    expect(p.title).toBe("Heading Title");
  });
});

describe("extractPage — description fallback chain", () => {
  it("prefers the meta description", () => {
    const p = extractPage(
      `<html><head><meta name="description" content="Meta desc."></head><body><p>Body para.</p></body></html>`,
      PAGE,
    );
    expect(p.description).toBe("Meta desc.");
  });
  it("falls back to the first paragraph when no meta/og description exists", () => {
    const p = extractPage(`<html><body><p>First paragraph content.</p></body></html>`, PAGE);
    expect(p.description).toContain("First paragraph content.");
  });
});

describe("extractPage — links", () => {
  it("keeps same-site links (absolutised) and drops external / non-http links", () => {
    const p = extractPage(
      `<html><body>
        <a href="/about">About</a>
        <a href="https://other.com/x">External</a>
        <a href="mailto:a@b.com">Mail</a>
      </body></html>`,
      PAGE,
    );
    expect(p.links).toContain("https://x.com/about");
    expect(p.links).not.toContain("https://other.com/x");
    expect(p.links.some((l) => l.startsWith("mailto"))).toBe(false);
  });
});

describe("extractPage — canonical & SPA signal", () => {
  it("honors a same-site canonical URL", () => {
    const p = extractPage(
      `<html><head><link rel="canonical" href="https://x.com/canonical"><title>t</title></head><body>x</body></html>`,
      new URL("https://x.com/page?ref=twitter"),
    );
    expect(p.url).toBe("https://x.com/canonical");
  });
  it("reports a near-zero textLength for an empty SPA shell", () => {
    const p = extractPage(`<html><body><div id="root"></div><script>var a=1;</script></body></html>`, PAGE);
    expect(p.textLength).toBeLessThan(200);
  });
});

describe("extractNavLinks", () => {
  it("returns only links inside nav/header/footer", () => {
    const nav = extractNavLinks(
      `<html><body>
        <nav><a href="/pricing">Pricing</a></nav>
        <a href="/somewhere-in-body">Body link</a>
        <footer><a href="/contact">Contact</a></footer>
      </body></html>`,
      PAGE,
    );
    expect(nav).toContain("https://x.com/pricing");
    expect(nav).toContain("https://x.com/contact");
    expect(nav).not.toContain("https://x.com/somewhere-in-body");
  });
});
