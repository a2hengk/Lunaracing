/**
 * Verkehr aus dem Abstand zum Vordermann (Time Behind Next). LMU kennt keine Positionen
 * der anderen Autos in der Aufnahme, aber Abstand und eigene Geschwindigkeit ergeben, wie
 * viele Meter das Auto vor dir weg ist. Unter einer Wagenlänge überlappt ihr: Rad an Rad.
 *
 * Achtung: Der Wert bezieht sich auf das Auto eine Position vor dir in der Wertung. Bei
 * Überrundungen oder in Klassenrennen kann das ein anderes Auto sein als das, was du siehst.
 */
import { CLOSE_GAP_S, OVERLAP_M } from "./corners";

export { CLOSE_GAP_S, OVERLAP_M };
/** Bis hier gilt ein Auto als in Reichweite, darüber als frei */
export const NEAR_GAP_S = 3;

export type Traffic = "alongside" | "close" | "near" | "free";

/** Abstand zum Vordermann in Metern, null ohne Auto vor dir oder ohne Daten. */
export function gapMeters(p: { gap?: number; speed: number }): number | null {
  if (p.gap === undefined || p.gap <= 0) return null;
  return (p.gap * p.speed) / 3.6;
}

export function traffic(p: { gap?: number; speed: number } | undefined): Traffic | null {
  if (!p || p.gap === undefined) return null;
  if (p.gap <= 0 || p.gap > NEAR_GAP_S) return "free";
  const m = gapMeters(p)!;
  if (m < OVERLAP_M) return "alongside";
  return p.gap < CLOSE_GAP_S ? "close" : "near";
}

export function trafficText(p: { gap?: number; speed: number } | undefined): string {
  const t = traffic(p);
  if (t === null) return "–";
  if (t === "free" && (p!.gap ?? 0) <= 0) return "frei";
  const s = `${p!.gap!.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
  return t === "alongside" ? `${s}, Rad an Rad` : s;
}
