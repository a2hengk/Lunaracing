import { describe, expect, it } from "vitest";
import { pgUrl } from "../db/url";
import { joinParts, sessionTypeDe, shortLayout, shortTrack } from "./format";

describe("Anzeige-Namen", () => {
  it("kürzt bekannte Strecken", () => {
    expect(shortTrack("Autodromo Nazionale Monza")).toBe("Monza");
    expect(shortTrack("Circuit de la Sarthe")).toBe("Le Mans");
    expect(shortTrack("Unbekannter Ring")).toBe("Unbekannter Ring");
  });

  it("Layout ohne Streckenname", () => {
    expect(shortLayout("Circuit de Spa-Francorchamps", "Circuit de Spa-Francorchamps Endurance")).toBe("Endurance");
    expect(shortLayout("Bahrain International Circuit", "Bahrain Endurance Circuit")).toBe("Endurance");
    expect(shortLayout("Autodromo Nazionale Monza", "")).toBe("");
    expect(shortLayout("Fuji Speedway", "Fuji Speedway")).toBe("");
  });

  it("lässt leere Teile in der Unterzeile weg", () => {
    expect(joinParts("", "Team WRT", undefined, false, "GT3")).toBe("Team WRT · GT3");
  });

  it("übersetzt Sessiontypen", () => {
    expect(sessionTypeDe("Qualify")).toBe("Qualifying");
    expect(sessionTypeDe("Race")).toBe("Rennen");
  });
});

describe("pgUrl", () => {
  it("macht aus sslmode=require verify-full und lässt den Rest stehen", () => {
    expect(pgUrl("postgresql://u:p@h/db?sslmode=require&channel_binding=require")).toBe(
      "postgresql://u:p@h/db?sslmode=verify-full&channel_binding=require",
    );
    expect(pgUrl("postgresql://u:p@h/db?channel_binding=require&sslmode=require")).toBe(
      "postgresql://u:p@h/db?channel_binding=require&sslmode=verify-full",
    );
    expect(pgUrl("postgresql://u:p@h/db")).toBe("postgresql://u:p@h/db");
  });
});
