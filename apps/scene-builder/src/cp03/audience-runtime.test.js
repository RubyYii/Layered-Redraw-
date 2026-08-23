import { describe, expect, it } from "vitest";
import {
  buildLocalScriptedProposal,
  createCp03EncounterProject,
  createLocalEngineeringArchive,
  createLocalViewerApproval,
} from "./audience-runtime.js";

describe("CP03 local audience harness", () => {
  it.each(["Translate", "Reframe", "Merge", "Continue", "KeepOpaque"])(
    "builds a schema-valid, zero-provider %s proposal",
    async (action) => {
      const proposal = await buildLocalScriptedProposal({
        action,
        project: createCp03EncounterProject(),
        viewerText: "I remember the cup moving.",
      });
      expect(proposal.draft.decision.actionSequence).toEqual([action]);
      expect(proposal.draftHash).toMatch(/^[a-f0-9]{64}$/);
      expect(proposal.providerRequestsMade).toBe(0);
      expect(proposal.draft.execution.terminalIntent).toBe(["Continue", "KeepOpaque"].includes(action) ? action : null);
    },
  );

  it("binds viewer approval to the exact local proposal hash", async () => {
    const proposal = await buildLocalScriptedProposal({
      action: "Reframe",
      project: createCp03EncounterProject(),
      viewerText: "near the table",
    });
    const approval = await createLocalViewerApproval(proposal, "APPROVE", "2026-08-23T00:00:00.000Z");
    expect(approval.draftHash).toBe(proposal.draftHash);
    expect(approval.decision).toBe("APPROVE");
  });

  it("refuses to label the local archive as a checkpoint", () => {
    const archive = createLocalEngineeringArchive({ proposals: [{}], approvals: [], receipts: [], effects: [{}] });
    expect(archive.checkpointEligible).toBe(false);
    expect(archive.status).toContain("NOT_CHECKPOINT");
    expect(archive.evidenceClasses.humanDecision).toBe(false);
  });
});
