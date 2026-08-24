import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import agentActionDraftSchema from "../schemas/gate/agent-action-draft.schema.json" with { type: "json" };
import agentContributionSchema from "../schemas/gate/agent-contribution.schema.json" with { type: "json" };
import providerCallEnvelopeSchema from "../schemas/gate/provider-call-envelope.schema.json" with { type: "json" };
import viewerTurnSchema from "../schemas/gate/viewer-turn.schema.json" with { type: "json" };
import approvalRecordSchema from "../schemas/runtime/approval-record.schema.json" with { type: "json" };
import conductorCommitSubmissionSchema from "../schemas/council/conductor-commit-submission.schema.json" with { type: "json" };
import councilShardSchema from "../schemas/council/council-shard.schema.json" with { type: "json" };
import councilRoleSubmissionSchema from "../schemas/council/council-role-submission.schema.json" with { type: "json" };
import conductorDraftCommitSchema from "../schemas/council/conductor-draft-commit.schema.json" with { type: "json" };
import providerRoutingManifestSchema from "../schemas/council/provider-routing-manifest.schema.json" with { type: "json" };
import modelBakeoffApprovalSchema from "../schemas/bakeoff/model-bakeoff-approval.schema.json" with { type: "json" };
import modelBakeoffAttemptSchema from "../schemas/bakeoff/model-bakeoff-attempt.schema.json" with { type: "json" };
import modelBakeoffSelectionSchema from "../schemas/bakeoff/model-bakeoff-selection.schema.json" with { type: "json" };

export { canonicalJson, sha256Canonical } from "./canonical-json.js";
export {
  agentActionDraftSchema,
  agentContributionSchema,
  approvalRecordSchema,
  conductorCommitSubmissionSchema,
  councilShardSchema,
  councilRoleSubmissionSchema,
  conductorDraftCommitSchema,
  modelBakeoffApprovalSchema,
  modelBakeoffAttemptSchema,
  modelBakeoffSelectionSchema,
  providerCallEnvelopeSchema,
  providerRoutingManifestSchema,
  viewerTurnSchema,
};

export const CP03_FOUNDATION_SCHEMA_VERSION = "cp03-foundation-gate/0.1";
export const CP03_RUNTIME_SCHEMA_VERSION = "cp03-runtime/0.1";
export const CP03_COUNCIL_SCHEMA_VERSION = "cp03-council/0.2";
export const CP03_MODEL_BAKEOFF_SCHEMA_VERSION = "cp03-model-bakeoff/0.1";

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

const validators = {
  agentActionDraft: ajv.compile(agentActionDraftSchema),
  agentContribution: ajv.compile(agentContributionSchema),
  approvalRecord: ajv.compile(approvalRecordSchema),
  conductorCommitSubmission: ajv.compile(conductorCommitSubmissionSchema),
  councilShard: ajv.compile(councilShardSchema),
  councilRoleSubmission: ajv.compile(councilRoleSubmissionSchema),
  conductorDraftCommit: ajv.compile(conductorDraftCommitSchema),
  modelBakeoffApproval: ajv.compile(modelBakeoffApprovalSchema),
  modelBakeoffAttempt: ajv.compile(modelBakeoffAttemptSchema),
  modelBakeoffSelection: ajv.compile(modelBakeoffSelectionSchema),
  providerCallEnvelope: ajv.compile(providerCallEnvelopeSchema),
  providerRoutingManifest: ajv.compile(providerRoutingManifestSchema),
  viewerTurn: ajv.compile(viewerTurnSchema),
};

const publicValidationError = (contractName, errors = []) => {
  const locations = errors.map(({ instancePath, schemaPath, keyword }) => (
    `${instancePath || "/"} ${keyword} ${schemaPath}`
  ));
  return new TypeError(`${contractName} validation failed: ${locations.join("; ")}`);
};

const checked = (contractName, validate) => (value) => {
  if (!validate(value)) throw publicValidationError(contractName, validate.errors);
  return value;
};

export const validateViewerTurn = checked("ViewerTurn", validators.viewerTurn);
export const validateAgentContribution = checked("AgentContribution", validators.agentContribution);
export const validateAgentActionDraft = checked("AgentActionDraft", validators.agentActionDraft);
export const validateApprovalRecord = checked("ApprovalRecord", validators.approvalRecord);
export const validateProviderCallEnvelope = checked("ProviderCallEnvelope", validators.providerCallEnvelope);
export const validateCouncilRoleSubmission = checked(
  "CouncilRoleSubmission",
  validators.councilRoleSubmission,
);
export const validateConductorCommitSubmission = checked(
  "ConductorCommitSubmission",
  validators.conductorCommitSubmission,
);
export const validateCouncilShard = checked("CouncilShard", validators.councilShard);
export const validateConductorDraftCommit = checked(
  "ConductorDraftCommit",
  validators.conductorDraftCommit,
);
export const validateModelBakeoffApproval = checked(
  "ModelBakeoffApproval",
  validators.modelBakeoffApproval,
);
export const validateModelBakeoffAttempt = checked(
  "ModelBakeoffAttempt",
  validators.modelBakeoffAttempt,
);
export const validateModelBakeoffSelection = checked(
  "ModelBakeoffSelection",
  validators.modelBakeoffSelection,
);
export const validateProviderRoutingManifest = checked(
  "ProviderRoutingManifest",
  validators.providerRoutingManifest,
);
