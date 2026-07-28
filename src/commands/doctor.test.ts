import { describe, it, expect } from "vitest";
import { runDoctorCheck } from "./doctor.js";

describe("Doctor Command", () => {
  it("runs diagnostic checks and returns diagnostic status", async () => {
    const report = await runDoctorCheck();
    expect(report.nodeVersion).toBeTruthy();
    expect(report.cwdWritable).toBe(true);
    expect(Array.isArray(report.items)).toBe(true);
  });
});
