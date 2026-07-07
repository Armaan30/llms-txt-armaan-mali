import type { Site } from "./db/schema";

/**
 * Shape of a site row as sent to the browser. The anonymous owner id is
 * never exposed — the client only learns whether *it* is the owner.
 */
export interface PublicSite {
  id: string;
  domain: string;
  siteName: string;
  llmsTxt: string;
  pageCount: number;
  usedLlm: boolean;
  isListed: boolean;
  editedByUser: boolean;
  isOwner: boolean;
  createdAt: string;
  updatedAt: string;
  lastCheckedAt: string;
}

export function toPublicSite(site: Site, browserId: string | null): PublicSite {
  return {
    id: site.id,
    domain: site.domain,
    siteName: site.siteName,
    llmsTxt: site.llmsTxt,
    pageCount: site.pageCount,
    usedLlm: site.usedLlm,
    isListed: site.isListed,
    editedByUser: site.editedByUser,
    isOwner: browserId !== null && site.ownerBrowserId === browserId,
    createdAt: site.createdAt.toISOString(),
    updatedAt: site.updatedAt.toISOString(),
    lastCheckedAt: site.lastCheckedAt.toISOString(),
  };
}
