import { z } from "zod";
import { getSiteById, saveManualEdit } from "@/lib/db/queries";
import { toPublicSite } from "@/lib/serialize";

const PatchSchema = z.object({
  llmsTxt: z.string().min(1).max(500_000),
  browserId: z.string().max(64).nullish(),
});

/** GET /api/sites/:id — fetch one site (used by the site detail page). */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const browserId = new URL(req.url).searchParams.get("browserId");
  try {
    const site = await getSiteById(id);
    if (!site) return Response.json({ error: "Not found." }, { status: 404 });
    return Response.json({ site: toPublicSite(site, browserId) });
  } catch (err) {
    console.error("get site failed:", err);
    return Response.json({ error: "Could not load this site." }, { status: 500 });
  }
}

/**
 * PATCH /api/sites/:id — save a manual edit from the preview editor. Marks
 * the row `editedByUser`, which tells the monitoring cron to stop
 * auto-overwriting the human-curated version.
 *
 * Edits are owner-gated: the shared row (directory + hosted URL) may only be
 * rewritten by the browser that generated it. Ownership is the anonymous
 * browser id — friction rather than security; a session user id slots in
 * here when auth is added. Unowned rows (seeds) are not editable.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const browserId = parsed.data.browserId ?? null;
  try {
    const existing = await getSiteById(id);
    if (!existing) return Response.json({ error: "Not found." }, { status: 404 });
    if (!browserId || existing.ownerBrowserId !== browserId) {
      return Response.json(
        {
          error:
            "Only the person who generated this file can edit the shared copy. Use copy or download to make your own version.",
        },
        { status: 403 },
      );
    }
    const site = await saveManualEdit(id, parsed.data.llmsTxt);
    if (!site) return Response.json({ error: "Not found." }, { status: 404 });
    return Response.json({ site: toPublicSite(site, browserId) });
  } catch (err) {
    console.error("save edit failed:", err);
    return Response.json({ error: "Could not save your edit." }, { status: 500 });
  }
}
