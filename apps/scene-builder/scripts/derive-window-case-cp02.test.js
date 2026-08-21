import { describe, expect, it } from "vitest";

import baseProject from "../projects/window-case/window-that-wasnt-there.blockout.json" with { type: "json" };
import sourceLock from "../projects/window-case-cp02/source-lock.json" with { type: "json" };
import { deriveCp02Project } from "./derive-window-case-cp02.mjs";

describe("CP02 project derivation", () => {
  it("preserves all 200 collaborator objects and source identities", () => {
    const result = deriveCp02Project(baseProject, sourceLock);

    expect(result.objects).toHaveLength(200);
    expect(result.objects.find((item) => item.id === "sandbox-photo_image")?.render.textureDataUrl)
      .toBe(baseProject.objects.find((item) => item.id === "sandbox-photo_image")?.render.textureDataUrl);
    expect(result.cp02.sourceRuntimeCommit).toBe(sourceLock.runtimeCommit);
    expect(result.objects.find((item) => item.id === "sandbox-photo_image")?.governance.state)
      .toBe("SOURCE_LOCKED");
    expect(result.objects.find((item) => item.id === "sandbox-table_top")?.governance.state)
      .toBe("EVIDENCE_LOCKED");
    expect(result.objects.find((item) => item.id === "sandbox-floor")?.governance.state)
      .toBe("STAGE_LOCKED");
    expect(result.objects.every((item) => item.governance?.state !== "WITHHELD")).toBe(true);
  });

  it("creates a short event-driven CP02 timeline without mutating the base object array", () => {
    const before = JSON.stringify(baseProject);
    const result = deriveCp02Project(baseProject, sourceLock);

    expect(result.director.timeline.duration).toBe(60);
    expect(result.director.timeline.clips).toEqual([]);
    expect(JSON.stringify(baseProject)).toBe(before);
  });
});
