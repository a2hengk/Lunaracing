import { getSession } from "@/lib/data";
import { bestLap } from "@/lib/lmu/session";

/**
 * Bestrunde einer Session mit allen Messwerten, für den Vergleich über Sessions hinweg.
 * Die Session selbst ist dauerhaft gecacht (siehe getSession), das hier ist nur ein Ausschnitt.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getSession(id);
  const lap = session && bestLap(session);
  if (!session || !lap) return Response.json({ error: "keine gewertete Runde" }, { status: 404 });
  return Response.json({ lap, sessionType: session.sessionType, recordedAt: session.recordedAt, car: session.car });
}
