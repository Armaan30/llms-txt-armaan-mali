import { describe, it, expect } from "vitest";
import { inferSiteName, buildHeuristicPlan } from "../lib/generate/heuristics";
import type { PageMeta } from "../lib/crawler/extract";

function page(url: string, title = "t", description = "d"): PageMeta {
  return { url, title, description, links: [], textLength: 100 };
}

describe("inferSiteName", () => {
  it("takes the brand from a pipe-separated title", () => {
    expect(inferSiteName(page("https://stripe.com/", "Stripe | Payments Infrastructure"), "stripe.com")).toBe(
      "Stripe",
    );
  });
  it("picks the segment matching the domain, not just the first", () => {
    expect(
      inferSiteName(page("https://vercel.com/", "Agentic Infrastructure - Vercel"), "vercel.com"),
    ).toBe("Vercel");
  });
  it("falls back to the domain when the title is empty", () => {
    expect(inferSiteName(page("https://x.com/", ""), "x.com")).toBe("x.com");
  });
});

describe("buildHeuristicPlan", () => {
  const homepage = page("https://acme.com/", "Acme Home", "Acme builds developer tools.");
  const pages: PageMeta[] = [
    homepage,
    page("https://acme.com/docs/intro", "Intro", "Getting started"),
    page("https://acme.com/blog/launch", "Launch", "We launched"),
    page("https://acme.com/privacy", "Privacy Policy", "legal text"),
  ];
  const plan = buildHeuristicPlan(pages, homepage, "acme.com");

  it("uses the homepage description as the summary", () => {
    expect(plan.summary).toBe("Acme builds developer tools.");
  });
  it("routes pages into sections by URL path", () => {
    const titles = plan.sections.map((s) => s.title);
    expect(titles).toContain("Documentation");
    expect(titles).toContain("Blog & News");
  });
  it("routes legal pages into the spec's Optional section", () => {
    const optional = plan.sections.find((s) => s.title === "Optional");
    expect(optional?.links.some((l) => l.url.includes("/privacy"))).toBe(true);
  });
  it("does not include the homepage as a link (it is the summary source)", () => {
    const allLinks = plan.sections.flatMap((s) => s.links.map((l) => l.url));
    expect(allLinks).not.toContain("https://acme.com/");
  });
});
