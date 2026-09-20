import { describe, expect, it } from "vitest";
import { SAMPLE_VARS, findUnknownVariables, planVersions } from "@/lib/admin/template-logic";
import { TEMPLATE_VARIABLES, fillTemplate } from "@/lib/messages";

describe("findUnknownVariables", () => {
  it("flags typos and unsupported placeholders only", () => {
    expect(findUnknownVariables("Hi {{donor_first_name}}", "<p>{{ donation_amount }}</p>")).toEqual([]);
    expect(findUnknownVariables("Hi {{donor_name}}", "{{ constructor }} {{donor_first_name}}")).toEqual(["donor_name", "constructor"]);
  });
});

describe("planVersions", () => {
  it("snapshots the original on first edit, then increments", () => {
    expect(planVersions(0)).toEqual({ snapshotOriginal: true, newVersion: 2 });
    expect(planVersions(5)).toEqual({ snapshotOriginal: false, newVersion: 6 });
  });
});

describe("sample data", () => {
  it("covers every supported variable so previews never show blanks", () => {
    for (const v of TEMPLATE_VARIABLES) expect(SAMPLE_VARS[v], v).toBeTruthy();
    expect(fillTemplate("{{donor_first_name}} gave {{donation_amount}}", SAMPLE_VARS)).toBe("Sample gave $50.00");
  });
});
