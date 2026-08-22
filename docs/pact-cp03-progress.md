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
| CP03 Five Actions / Agent-Native Encounter | free input, five DSH roles, hash approval, governed 3D effects | `FOUNDATION_TESTED + LOCAL_EXECUTABLE_SLICE_TESTED`; Ruby merge, contracts, DSH durability, keyless provider preflight and one approved role-interaction seam exist | real provider gate, multi-role orchestration, UI, five actions, archive |
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
| B3. Real provider compatibility | `NOT_RUN / BLOCKED_ON_SEPARATE_AUTHORITY` | zero calls; fresh external approval required |
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

### Verification snapshot — 2026-08-22

| Layer | Result | Scope |
|---|---|---|
| Shared CP03 contracts | `15/15 PASS` | dual execution schema, approval authority, forbidden raw controls |
| PACT DSH host | `typecheck PASS`, `build PASS`, `23/23 PASS` | includes one in-process DSH registry → approval → Gate → Ruby integration test |
| Ruby Scene Builder | `153/153 PASS`, `build PASS` | includes ownership propagation, Gate rejection paths, overlay execution and 60Hz final ownership state |
| Provider network | `ZERO CALLS` | all new execution evidence uses `pact-fake` scripted output |
| CP03 visual/archive gate | `NOT RUN` | no new video/still/copy package; local wiring is not a formal CP03 checkpoint archive |

Ruby remote truth was re-read with `git ls-remote` after the verification matrix.
The four collaborator tips remained `2136710`, `722b699`, `eacab0c`, and
`1691e8e`; all four are ancestors of the current CP03 branch. No new Ruby range
was available to integrate, and no parallel navigation, collision, ownership,
animation, camera or rendering backend was introduced.

## Immediate Sequence

1. Freeze and report the locally tested DSH draft → viewer approval → Gate → Ruby character-interaction slice.
2. Present the exact real-provider compatibility scope, model/input classes, call count and cost boundary to the user.
3. Only after explicit approval, run the bounded Gemini + DeepSeek compatibility gate.
4. On `GO`, implement five-role orchestration and five-action effects, then the loopback API/privacy boundary and audience UI.
5. Add cleared image/audio ingestion paths and test multimodal interpretation without granting those inputs execution authority.
6. Run formal encounters, archive videos/stills/copy/receipts, and request separate human technical and artistic decisions.

## Evidence Vocabulary

- `scripted provider`: local test adapter; no claim of live agency.
- `real DSH`: the actual DSH runtime/session/tool/persistence stack, even when its provider is scripted.
- `real 3D mutation or interaction`: the actual Scene Builder runtime changes/evaluates the scene; not a video mock.
- `real provider tested`: only after bounded external DeepSeek/Gemini calls and receipts.
- `checkpoint archived`: only after all interaction, visual, provenance, discourse, archive and human-decision gates pass.
