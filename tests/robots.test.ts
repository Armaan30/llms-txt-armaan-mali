import { describe, it, expect } from "vitest";
import { parseRobots, isAllowed } from "../lib/crawler/robots";

describe("parseRobots", () => {
  it("collects disallow/allow rules and the sitemap for the wildcard group", () => {
    const rules = parseRobots(
      `User-agent: *
Disallow: /admin
Allow: /admin/public
Sitemap: https://x.com/sitemap.xml`,
    );
    expect(rules.disallow).toEqual(["/admin"]);
    expect(rules.allow).toEqual(["/admin/public"]);
    expect(rules.sitemaps).toEqual(["https://x.com/sitemap.xml"]);
  });

  it("ignores rules aimed at a different bot's group", () => {
    const rules = parseRobots(
      `User-agent: BadBot
Disallow: /

User-agent: *
Disallow: /private`,
    );
    // The "Disallow: /" belongs to BadBot's group and must NOT apply to us.
    expect(rules.disallow).toEqual(["/private"]);
  });

  it("strips comments and ignores blank lines", () => {
    const rules = parseRobots(
      `# a comment
User-agent: *
Disallow: /secret   # inline comment
`,
    );
    expect(rules.disallow).toEqual(["/secret"]);
  });

  it("collects sitemaps regardless of group (they are file-level)", () => {
    const rules = parseRobots(
      `Sitemap: https://x.com/a.xml
User-agent: *
Disallow: /x`,
    );
    expect(rules.sitemaps).toEqual(["https://x.com/a.xml"]);
  });
});

describe("isAllowed (longest-match-wins)", () => {
  const rules = { disallow: ["/admin"], allow: ["/admin/public"], sitemaps: [] };

  it("disallows a path under a disallowed prefix", () => {
    expect(isAllowed(rules, new URL("https://x.com/admin/secret"))).toBe(false);
  });
  it("allows a more-specific allowed path even under a disallowed prefix", () => {
    expect(isAllowed(rules, new URL("https://x.com/admin/public/page"))).toBe(true);
  });
  it("allows anything not matched by a disallow rule", () => {
    expect(isAllowed(rules, new URL("https://x.com/pricing"))).toBe(true);
  });
  it("allows everything when there are no rules", () => {
    const empty = { disallow: [], allow: [], sitemaps: [] };
    expect(isAllowed(empty, new URL("https://x.com/anything"))).toBe(true);
  });
});
