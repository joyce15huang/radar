import { describe, expect, it } from "vitest";
import { areaOf, shortPlace } from "./areas";

describe("areas", () => {
  it("maps places to areas", () => {
    expect(areaOf("Embarcadero, San Francisco")).toBe("sf");
    expect(areaOf("SF")).toBe("sf");
    expect(areaOf("South San Francisco")).toBe("peninsula");
    expect(areaOf("Inner Richmond")).toBe("sf");
    expect(areaOf("Richmond, CA")).toBe("eastbay");
    expect(areaOf("Downtown Oakland")).toBe("eastbay");
    expect(areaOf("Palo Alto")).toBe("peninsula");
    expect(areaOf("San Jose")).toBe("southbay");
    expect(areaOf(null, "", "Los Gatos")).toBe("southbay");
    expect(areaOf("Tahoe City")).toBeNull();
  });
  it("shortens places", () => {
    expect(shortPlace("Embarcadero, San Francisco")).toBe("Embarcadero");
    expect(shortPlace(null)).toBe("");
  });
});
