import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import agentActionDraftSchema from "../schemas/gate/agent-action-draft.schema.json" with { type: "json" };
import agentContributionSchema from "../schemas/gate/agent-contribution.schema.json" with { type: "json" };
import providerCallEnvelopeSchema from "../schemas/gate/provider-call-envelope.schema.json" with { type: "json" };
import viewerTurnSchema from "../schemas/gate/viewer-turn.schema.json" with { type: "json" };
import approvalRecordSchema from "../schemas/runtime/approval-record.schema.json" with { type: "json" };

export { canonicalJson, sha256Canonical } from "./canonical-json.js";
export {
  agentActionDraftSchema,
  agentContributionSchema,
  approvalRecordSchema,
  providerCallEnvelopeSchema,
  viewerTurnSchema,
};

export const CP03_FOUNDATION_SCHEMA_VERSION = "cp03-foundation-gate/0.1";
export const CP03_RUNTIME_SCHEMA_VERSION = "cp03-runtime/0.1";

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

const validators = {
  agentActionDraft: ajv.compile(agentActionDraftSchema),
  agentContribution: ajv.compile(agentContributionSchema),
  approvalRecord: ajv.compile(approvalRecordSchema),
  providerCallEnvelope: ajv.compile(providerCallEnvelopeSchema),
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
