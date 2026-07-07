import { boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * One row per website. The normalized domain is the natural key, which makes
 * generation idempotent: repeat requests for the same site hit the cache and
 * regeneration is an explicit action.
 */
export const sites = pgTable("sites", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Normalized (lowercase, no www) — unique so each site exists once. */
  domain: text("domain").notNull().unique(),
  siteName: text("site_name").notNull(),
  llmsTxt: text("llms_txt").notNull(),
  /** Fingerprint of the crawled inventory; the cron compares against this. */
  contentHash: text("content_hash").notNull(),
  pageCount: integer("page_count").notNull().default(0),
  usedLlm: boolean("used_llm").notNull().default(false),
  /** Listed = appears in the public directory. Unlisted still has a hosted URL. */
  isListed: boolean("is_listed").notNull().default(true),
  /** Anonymous browser id of whoever generated it — powers "My sites". */
  ownerBrowserId: text("owner_browser_id"),
  /** True once a human edits the file; the monitor then stops auto-overwriting. */
  editedByUser: boolean("edited_by_user").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  /** When the llms.txt content last changed (regeneration or manual edit). */
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  /** When the monitor last re-crawled the site (whether or not it changed). */
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Site = typeof sites.$inferSelect;
export type NewSite = typeof sites.$inferInsert;
