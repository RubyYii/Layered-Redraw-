# PACT / Layered Redraw Unified Progress

**Status:** `live_roadmap`

**Updated:** 2026-08-22

**Runtime branch:** `codex/pact-cp03-agent-native`

**Purpose:** Keep the original checkpoint route, Ruby's 3D work, Haorui/Codex governance and agent work, and the next integration gate in one current document. Git/runtime evidence outranks this summary whenever they differ.

## Interaction Authority

The intended public encounter is agent-operated, not viewer-operated:

```text
Viewer
  submits text / cleared image / cleared audio
  sees public agent traces and one frozen proposal
  approves or rejects the proposal hash

DSH Agents
  interpret evidence, preserve disagreement, compose semantic actions
  never write raw coordinates, paths, scripts, URLs, or permissions

PACT Capability Gate
  checks draft hash, scene hash, approval, locks, registries, bounds, and rollback

Ruby Scene Builder
  owns navigation, character interaction, ownership, collision, animation, camera, and rendering
```

The viewer does not directly drive a character with keyboard/game controls in the artwork's principal mode. Operator controls may exist for setup, reset, diagnostics, and emergency stop, but are not presented as audience agency.

## Original CP00-CP08 Route

| Checkpoint | Intended result | Current evidence state | Remaining gate |
|---|---|---|---|
| CP00 Reference Grammar | visual/theoretical grammar and checkpoint media | `ARCHIVED`; human visual direction recorded | preserve as source, not final 3D proof |
| CP01 Asset Bake-off | compare public and generated 3D candidates | `PARTIAL`; preflight and fixed public candidates exist, formal model bake-off incomplete | decide whether a generated challenger is still needed |
| CP02 Mutable Room / One Reframe | source-locked room, governed add/move/undo/reject, real local assets | `CHECKPOINT_ARCHIVED`, runtime tested, artistic `R2 KEEP`, public release false | frozen; do not rewrite its evidence |
| CP03 Five Actions / Agent-Native Encounter | free input, five DSH roles, hash approval, governed 3D effects | `FOUNDATION_TESTED + LOCAL_EXECUTABLE_SLICE_TESTED`; Ruby merge, contracts, DSH durability, approval-gated provider runner/evidence verifier and one approved role-interaction seam exist | eligible and separately approved real-provider run, multi-role orchestration, UI, five actions, archive |
| CP04 Rights-aware Retrieval | local semantic search over cleared asset registry | `NOT_STARTED`; three fixed Case Pack assets are not a vector database | source records, embeddings, retrieval/Guardian UI |
| CP05 Generated Gap Asset | one approved offline generated asset | `NOT_STARTED` | separately authorised model/API or local generation bake-off |
| CP06 Four Positions | 0/1/4-person role and takeover behaviour | `NOT_STARTED` | participant protocol and role runtime |
| CP07 Reference Disturbance | literature/art rules visibly alter system behaviour | `NOT_STARTED` | freeze A/B rules and evidence |
| CP08 Equal Endings | full 10–12 minute encounter and equal endings | `NOT_STARTED_AS_CHECKPOINT`; Ruby has a deterministic 166-second screenplay render, not the interactive equal-ending installation | live encounter, equal endings, offline fallback, installation evidence |

## Collaborator and Local Responsibility Map

### Ruby's merged execution/rendering work

| Commit | Capability | Current use |
|---|---|---|
| `2136710` | RGB-D bridge into Scene Builder | governed mutable-carrier integration tested |
| `722b699` | deterministic interaction simulation | reusable character/prop interaction backend |
| `eacab0c` | collision/clipping repair | retained by current runtime |
| `1691e8e` | deterministic full screenplay render | retained as reproducible 166-second stage render |
| `e831acb` | CP03 integration and Case Pack validation repair | retained in the current shared branch |
| `b8a5833` | reproducible interaction-simulation delivery packages | locally packaged and replay-smoke tested |
| `1657e87` | cinematic camera editor | 19-shot / 720-clip browser smoke tested |
| `e539ba1` | explicit large-project save behaviour | retained; large projects require explicit JSON save |

Ruby owns the 3D execution primitives and authored stage. New CP03 code should call these interfaces rather than duplicate them.

### Haorui/Codex governed artwork and agent work

| Range / commit | Capability | Current use |
|---|---|---|
| `cf2ceae`–`4a4fdb7` | CP02 derivative, governance, ScenePatch, Case Pack, materialisation, visual repair and evidence layers | frozen CP02 baseline |
| `ca14692` | two-parent merge of CP02 and Ruby's four-commit chain | shared runtime baseline |
| `3e2dcfe` | governed RGB-D foundation | proves Ruby runtime and CP02 locks coexist |
| `452f359` | non-executable provider-gate contracts | shared schema foundation |
| `bdd0174` | DSH continuable durability | real DSH lifecycle with scripted provider |
| `30c15a9` | keyless compatibility preflight | zero-call readiness/budget boundary |
| `944b9b9` | executable interaction draft and viewer approval contracts | one bounded runtime capability without weakening compatibility mode |
| `5dc106f` | executable draft carried through DSH | immutable draft payload available by canonical hash |
| `f39c193` | viewer-approved Gate into Ruby runtime | transient navigation/ownership overlay and linked receipt |
| `d66fae2` | cross-application integration test | exact DSH registry payload reaches Ruby's deterministic runtime |
| `410cccd`–`106dc64` | approval-gated real-provider runner, DSH dispatch ledger, bounded retry/cancel and CLI | keyless infrastructure tested; no real call made |
| `747872b` | post-run evidence integrity and secret-leak verifier | blocks secret-bearing raw archives and refuses incomplete/mislabeled evidence |

Haorui/Codex owns viewer approval, governance, agent/session contracts, deterministic authority checks, evidence and checkpoint integration. It does not own Ruby's 3D authorship.

## Current Position

### Overall checkpoint route

```text
CP00  ██████████  archived
CP01  ████░░░░░░  partial
CP02  ██████████  archived / R2 KEEP
CP03  █████░░░░░  local single-call execution tested; encounter incomplete
CP04  ░░░░░░░░░░  not started
CP05  ░░░░░░░░░░  not started
CP06  ░░░░░░░░░░  not started
CP07  ░░░░░░░░░░  not started
CP08  █░░░░░░░░░  deterministic film asset exists; checkpoint not started
```

This is roughly the first third of the full CP00-CP08 production route. It is not a claim that the final artwork is one-third visually complete; checkpoint scope and cost are unequal.

### CP03 engineering route

| Gate | State | Evidence |
|---|---|---|
| A. Ruby + CP02 governed runtime | `COMPLETE` | history-preserving merge and combined tests |
| B1. Shared compatibility contracts | `COMPLETE` | schemas and unit tests |
| B2. DSH root/continuable durability | `COMPLETE` | scripted adapter, flush and cold read |
| B3. Real provider compatibility | `INFRASTRUCTURE_TESTED / REAL RUN NOT ELIGIBLE` | fresh preflight 0/8; zero calls; required model/route/cost configuration and separate approval absent |
| C1. Draft/approval/Gate to Ruby role interaction | `LOCAL_SLICE_TESTED` | real DSH root with scripted provider → hash approval → Gate → Ruby navigation/ownership → receipt |
| C2. Five-action effect runtime | `NOT_STARTED` | follows executable seam |
| C3. Loopback host, privacy and evidence API | `NOT_STARTED` | follows provider contract validation |
| C4. Audience UI and proposal viewer | `NOT_STARTED` | follows host/Gate |
| D. Formal encounters and checkpoint archive | `NOT_STARTED` | requires separate provider/capture approvals and human review |

## Technology Feasibility and Current Test Boundary

The architecture is technically feasible with current components:

- text can enter a DSH root session;
- image can be represented as a validated DSH attachment, but real Gemini multimodal handling is not yet tested;
- audio should first be locally decoded/transcribed or represented through registered sound metadata; the formal audio route is not yet implemented or tested;
- DSH can maintain continuable child sessions and durable event evidence;
- Scene Builder can already validate semantic affordances and compile navigation plus interaction clips;
- Ruby's deterministic 60 Hz runtime can execute claim/transfer/release and collision-corrected motion;
- the first hash-bound executable draft and Capability Gate seam between DSH and Scene Builder is now locally tested for one registered interaction call.

Current successful tests prove local contracts, real DSH session/tool/event plumbing with a scripted provider, deterministic Gate checks, and Ruby navigation/ownership execution. They do not yet prove:

- real DeepSeek/Gemini structured tool reliability;
- real multimodal interpretation quality;
- the 8-second target or 12-second hard deadline under live provider load;
- an audience-facing proposal/approval UI;
- six real free-text turns covering all five actions;
- CP03 visual or artistic completion.

The real-provider command now verifies the exact in-memory archive before it is
published. A valid archive must cover all eight fixed probes, preserve the
approved provider/model plan, use `providerKind: real`, contain a complete
bounded dispatch ledger, and pass every ProviderCallEnvelope check. Exact
credential values and forbidden secret-bearing fields are scanned without
being copied into the report. A secret-bearing archive is not written;
non-secret but inconsistent evidence is retained with `FAIL` and cannot be
returned as a completed run. This verifies only `raw-run.json`, not every byte
under the DSH session directory.

### Verification snapshot — 2026-08-22

| Layer | Result | Scope |
|---|---|---|
| Shared CP03 contracts | `15/15 PASS` | dual execution schema, approval authority, forbidden raw controls |
| PACT DSH host | `typecheck PASS`, `build PASS`, `54/54 PASS` | DSH → approval → Ruby slice plus real-run approval, retry/cancel, evidence-integrity and leak-blocking tests |
| Ruby Scene Builder | `168/168 PASS`, `build PASS` | combined runtime after Ruby's latest merge |
| Browser engineering smoke | `PASS` | CP02 59.88 median FPS; CP03 source-lock/RGB-D; 19-shot camera editor; 300-frame simulation package and replay |
| Provider preflight | `0/8 ELIGIBLE`, `0 SENT` | intended 8, excluded 8, planned 12, hard maximum 14; no provider data sent |
| Provider network | `ZERO CALLS` | all provider execution tests remain scripted; preflight is local-only |
| CP03 visual/archive gate | `FOUNDATION SMOKE ONLY / FORMAL NOT RUN` | ignored engineering video/stills exist; no formal checkpoint copy package or human CP03 decision |

Ruby remote truth was re-read with `git ls-remote` before this verification
matrix. The shared branch had advanced by five commits to merge `d54f8c3`; it
was a clean descendant of the local provider work and was fast-forwarded
without conflict. The four original collaborator tips remain `2136710`,
`722b699`, `eacab0c`, and `1691e8e`, and Ruby's newer Case Pack repair,
delivery-package and camera-editor work is now retained. Haorui/Codex did not
introduce a parallel navigation, collision, ownership, camera or rendering
backend.

## Immediate Sequence

1. Keep Ruby's merged 3D/camera/delivery work and the DSH → approval → Gate → Ruby seam frozen as the integration baseline.
2. Resolve the five missing preflight items: `PACT_DEEPSEEK_MODEL`, `PACT_GEMINI_ROUTE`, `PACT_GEMINI_MODEL`, `PACT_COMPAT_MAX_USD`, and `GEMINI_API_KEY`; then present the exact live scope again.
3. Only after a fresh exact approval record, run the bounded 8-probe / 12-planned / 14-maximum Gemini + DeepSeek compatibility gate and inspect the evidence report.
4. On a real-provider `GO`, implement five-role orchestration and five-action effects, then the loopback API/privacy boundary and audience UI.
5. Add cleared image/audio ingestion paths and test multimodal interpretation without granting those inputs execution authority.
6. Run formal encounters, archive videos/stills/copy/receipts, and request separate human technical and artistic decisions.

## Evidence Vocabulary

- `scripted provider`: local test adapter; no claim of live agency.
- `real DSH`: the actual DSH runtime/session/tool/persistence stack, even when its provider is scripted.
- `real 3D mutation or interaction`: the actual Scene Builder runtime changes/evaluates the scene; not a video mock.
- `real provider tested`: only after bounded external DeepSeek/Gemini calls and receipts.
- `provider evidence verified`: the post-run archive passed fixed-scope, real-kind, contract, dispatch and secret-leak checks; it is not a model-quality or artistic judgment.
- `checkpoint archived`: only after all interaction, visual, provenance, discourse, archive and human-decision gates pass.
