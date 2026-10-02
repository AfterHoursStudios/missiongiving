import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { isOrganizationName, isPlaceholderEmail, mapRows, placeholderEmail, readXlsx, splitName, toIsoDate } from "@/lib/admin/dp-import";

describe("splitName", () => {
  it.each([
    ["Charles Downing", "Charles", "Downing"],
    ["Stan & Gloria Beerman", "Stan & Gloria", "Beerman"],
    ["Dolores L. Wright", "Dolores L.", "Wright"],
    ["Becky St. Clair", "Becky", "St. Clair"],
    ["Nancy Delos Reyes", "Nancy", "Delos Reyes"],
    ["John Smith Jr.", "John", "Smith Jr."],
    ["Anonymous", "", "Anonymous"],
  ])("%s", (full, first, last) => expect(splitName(full)).toEqual({ first, last }));
});

describe("organization detection", () => {
  it("recognises churches, trusts and foundations but not people", () => {
    for (const n of ["Village SDA Church", "The PW Jansen Family Trust", "Graham Family Foundation", "MindCare LLC", "Beavercreek Lions Club"]) expect(isOrganizationName(n)).toBe(true);
    for (const n of ["Charles Downing", "Vincent White", "Mary Kay Frey"]) expect(isOrganizationName(n)).toBe(false);
  });
});

describe("toIsoDate", () => {
  it("reads ISO, US and Excel serial dates", () => {
    expect(toIsoDate("2026-09-03T00:00:00")).toBe("2026-09-03");
    expect(toIsoDate("9/3/2026")).toBe("2026-09-03");
    expect(toIsoDate("46268")).toBe("2026-09-03");
    expect(toIsoDate("")).toBeNull();
  });
});

describe("mapRows", () => {
  const header = ["Score", "Donor name", "ID", "Optional line", "Last gift date", "Last gift amount", "Total given", "Total gifts"];
  it("maps the DonorPerfect list export", () => {
    const r = mapRows([header, ["100", "Charles Downing", "75", "", "2026-09-03T00:00:00", "85", "15077", "64"], ["0", "Village SDA Church", "12", "", "", "", "0", "0"]]);
    expect(r.skipped).toEqual([]);
    expect(r.donors[0]).toMatchObject({ dpId: "75", firstName: "Charles", lastName: "Downing", email: null, score: 100, totalGivenCents: 1507700, giftCount: 64, lastGiftAt: "2026-09-03", lastGiftCents: 8500 });
    expect(r.donors[1]).toMatchObject({ firstName: "", lastName: "Village SDA Church", organizationName: "Village SDA Church", lastGiftAt: null, lastGiftCents: null });
  });
  it("uses first/last/email/address columns from a fuller export and ignores invalid emails", () => {
    const r = mapRows([["Donor ID", "First Name", "Last Name", "Email", "Address", "City", "State", "Zip"], ["9", "Kay", "Cooksley", "KAY@Example.com", "1 Main St", "Salem", "OR", "97301"], ["10", "Tom", "Lee", "not-an-email", "", "", "", ""]]);
    expect(r.donors[0]).toMatchObject({ firstName: "Kay", lastName: "Cooksley", email: "kay@example.com", address1: "1 Main St", city: "Salem", region: "OR", postalCode: "97301" });
    expect(r.donors[1].email).toBeNull();
  });
  it("skips rows without an ID or name, and repeated IDs", () => {
    const r = mapRows([header, ["", "No Id", "", "", "", "", "", ""], ["1", "", "5", "", "", "", "", ""], ["1", "A B", "6", "", "", "", "", ""], ["1", "C D", "6", "", "", "", "", ""]]);
    expect(r.donors.map((d) => d.dpId)).toEqual(["6"]);
    expect(r.skipped.map((s) => s.reason)).toEqual(["no ID", "no name", "duplicate ID 6"]);
  });
  it("explains a file with no ID column", () => expect(() => mapRows([["Name"], ["A B"]])).toThrow(/No ID column/));
});

describe("readXlsx", () => {
  it("reads shared and inline strings and numbers from the first sheet", () => {
    const sheet = `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2"><v>75</v></c><c r="C2" t="inlineStr"><is><t>Tom &amp; Ann</t></is></c></row></sheetData></worksheet>`;
    const zip = zipSync({ "xl/sharedStrings.xml": strToU8(`<sst><si><t>ID</t></si><si><t>Donor name</t></si></sst>`), "xl/worksheets/sheet1.xml": strToU8(sheet) });
    expect(readXlsx(zip)).toEqual([["ID", "Donor name"], ["75", "", "Tom & Ann"]]);
  });
});

describe("placeholder emails", () => {
  it("are recognisable and never a real domain", () => {
    expect(placeholderEmail("75")).toBe("dp-75@no-email.invalid");
    expect(isPlaceholderEmail("dp-75@no-email.invalid")).toBe(true);
    expect(isPlaceholderEmail("kay@example.com")).toBe(false);
  });
});
