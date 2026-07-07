import { listSites, listSitesByOwner } from "@/lib/db/queries";
import { toPublicSite } from "@/lib/serialize";

/**
 * GET /api/sites            -> public directory (newest first)
 * GET /api/sites?q=stripe   -> directory search
 * GET /api/sites?mine=1&browserId=... -> everything this browser generated
 */
export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim().slice(0, 100) || undefined;
  const mine = searchParams.get("mine") === "1";
  const browserId = searchParams.get("browserId");

  try {
    const rows = mine && browserId ? await listSitesByOwner(browserId) : await listSites(q);
    return Response.json({ sites: rows.map((s) => toPublicSite(s, browserId)) });
  } catch (err) {
    console.error("list sites failed:", err);
    return Response.json({ error: "Could not load the directory." }, { status: 500 });
  }
}
