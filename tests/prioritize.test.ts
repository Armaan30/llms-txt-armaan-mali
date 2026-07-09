import { describe, it, expect } from "vitest";
import { selectUrls } from "../lib/crawler/prioritize";

const NO_NAV = new Set<string>();

describe("selectUrls", () => {
  it("drops noise (auth, cart, media, pagination) but keeps content pages", () => {
    const picked = selectUrls(
      [
        "https://x.com/about",
        "https://x.com/login",
        "https://x.com/cart",
        "https://x.com/logo.png",
        "https://x.com/blog?page=2",
      ],
      NO_NAV,
      50,
    );
    expect(picked).toContain("https://x.com/about");
    expect(picked).not.toContain("https://x.com/login");
    expect(picked).not.toContain("https://x.com/cart");
    expect(picked).not.toContain("https://x.com/logo.png");
    expect(picked).not.toContain("https://x.com/blog?page=2");
  });

  it("drops non-default locale duplicates but keeps topic-like segments", () => {
    const picked = selectUrls(
      ["https://x.com/fr/pricing", "https://x.com/pricing", "https://x.com/go/start"],
      NO_NAV,
      50,
    );
    expect(picked).not.toContain("https://x.com/fr/pricing"); // French dup dropped
    expect(picked).toContain("https://x.com/pricing");
    expect(picked).toContain("https://x.com/go/start"); // "go" is a topic, not a locale
  });

  it("ranks a nav-linked page above a deeper non-nav page", () => {
    const nav = new Set(["https://x.com/docs/webhooks"]);
    const picked = selectUrls(
      ["https://x.com/blog/2019/some-old-post", "https://x.com/docs/webhooks"],
      nav,
      1,
    );
    expect(picked).toEqual(["https://x.com/docs/webhooks"]);
  });

  it("caps a templated section so a catalog can't crowd out descriptive pages", () => {
    const products = Array.from({ length: 25 }, (_, i) => `https://x.com/products/${i}`);
    const picked = selectUrls([...products, "https://x.com/about", "https://x.com/pricing"], NO_NAV, 50);
    const productCount = picked.filter((u) => u.includes("/products/")).length;
    expect(productCount).toBeLessThanOrEqual(6);
    expect(picked).toContain("https://x.com/about");
    expect(picked).toContain("https://x.com/pricing");
  });

  it("never returns more than the limit", () => {
    const many = Array.from({ length: 100 }, (_, i) => `https://x.com/page-${i}`);
    expect(selectUrls(many, NO_NAV, 10).length).toBeLessThanOrEqual(10);
  });
});
