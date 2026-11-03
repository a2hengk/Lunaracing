import { describe, expect, it } from "vitest";
import { gapMeters, traffic, trafficText } from "./traffic";

describe("traffic", () => {
  it("rechnet den Abstand in Meter um", () => {
    expect(gapMeters({ gap: 0.1, speed: 180 })).toBeCloseTo(5);
    expect(gapMeters({ gap: 0, speed: 180 })).toBeNull();
  });

  it("gleiche Sekunden bedeuten je nach Speed etwas anderes", () => {
    // 0,2 s: in der Schikane (60 km/h) 3,3 m → Rad an Rad, auf der Geraden (280 km/h) 15,6 m → dahinter
    expect(traffic({ gap: 0.2, speed: 60 })).toBe("alongside");
    expect(traffic({ gap: 0.2, speed: 280 })).toBe("close");
  });

  it("teilt in Stufen ein", () => {
    expect(traffic({ gap: 2, speed: 200 })).toBe("near");
    expect(traffic({ gap: 4, speed: 200 })).toBe("free");
    expect(traffic({ gap: 0, speed: 200 })).toBe("free");
    expect(traffic({ speed: 200 })).toBeNull();
  });

  it("Text für die Anzeige", () => {
    expect(trafficText({ gap: 0.05, speed: 100 })).toBe("0,1 s, Rad an Rad");
    expect(trafficText({ gap: 0.6, speed: 200 })).toBe("0,6 s");
    expect(trafficText({ gap: 0, speed: 200 })).toBe("frei");
    expect(trafficText(undefined)).toBe("–");
  });
});
