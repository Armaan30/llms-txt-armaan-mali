import { describe, it, expect } from "vitest";
import { renderLlmsTxt, inventoryHash } from "../lib/generate/render";
import type { LlmsTxtPlan } from "../lib/generate/types";
import type { PageMeta } from "../lib/crawler/extract";

describe("renderLlmsTxt — spec compliance", () => {
  const plan: LlmsTxtPlan = {
    siteName: "Acme",
    summary: "Acme builds developer tools.",
    sections: [
      {
        title: "Documentation",
        links: [
          { url: "https://acme.com/docs", title: "Docs", description: "The docs." },
          { url: "https://acme.com/api", title: "API", description: "" },
        ],
      },
    ],
  };
  const out = renderLlmsTxt(plan);

  it("starts with the H1 site name", () => {
    expect(out.startsWith("# Acme\n")).toBe(true);
  });
  it("renders the summary as a blockquote", () => {
    expect(out).toContain("> Acme builds developer tools.");
  });
  it("renders sections as H2 headers", () => {
    expect(out).toContain("## Documentation");
  });
  it("renders a link with a description after a colon", () => {
    expect(out).toContain("- [Docs](https://acme.com/docs): The docs.");
  });
  it("omits the colon when a link has no description", () => {
    expect(out).toContain("- [API](https://acme.com/api)");
    expect(out).not.toContain("- [API](https://acme.com/api):");
  });
  it("escapes square brackets in link titles so they can't break the markdown", () => {
    const escaped = renderLlmsTxt({
      siteName: "S",
      summary: "s",
      sections: [{ title: "T", links: [{ url: "https://x.com/g", title: "Guide [beta]", description: "" }] }],
    });
    expect(escaped).toContain("[Guide \\[beta\\]]");
  });
});

describe("inventoryHash — the change-detection fingerprint", () => {
  const a: PageMeta = { url: "https://x.com/a", title: "A", description: "da", links: [], textLength: 1 };
  const b: PageMeta = { url: "https://x.com/b", title: "B", description: "db", links: [], textLength: 1 };

  it("is deterministic: the same inventory always yields the same hash", () => {
    expect(inventoryHash([a, b])).toBe(inventoryHash([a, b]));
  });

  it("is order-independent: reordering the pages yields the same hash", () => {
    expect(inventoryHash([a, b])).toBe(inventoryHash([b, a]));
  });

  it("changes when a title changes (a real content change)", () => {
    const aChanged = { ...a, title: "A (updated)" };
    expect(inventoryHash([a, b])).not.toBe(inventoryHash([aChanged, b]));
  });

  it("changes when a description changes", () => {
    const aChanged = { ...a, description: "different" };
    expect(inventoryHash([a, b])).not.toBe(inventoryHash([aChanged, b]));
  });

  it("changes when a page is added or removed", () => {
    expect(inventoryHash([a, b])).not.toBe(inventoryHash([a]));
  });

  it("ignores fields that don't appear in the file (links, textLength)", () => {
    const aNoisy = { ...a, links: ["https://x.com/z"], textLength: 9999 };
    expect(inventoryHash([a, b])).toBe(inventoryHash([aNoisy, b]));
  });
});
