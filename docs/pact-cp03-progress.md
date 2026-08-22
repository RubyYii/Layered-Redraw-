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
| CP03 Five Actions / Agent-Native Encounter | free input, five DSH roles, hash approval, governed 3D effects | `FOUNDATION_TESTED + LOCAL_EXECUTABLE_SLICE_TESTED + LOCAL_8_DISPATCH_GRAPH_VERIFIED + THREE_FAILED_LIVE_RUNS`; Ruby merge, contracts, CaseSession mechanics/durability, approval-gated provider runner/evidence verifier and one approved role-interaction seam exist; Live Run 03 tested the replacement 8/10 graph and failed when the draft returned 2.215 seconds beyond the 12-second cutoff | critical-path redesign decision and local verification before any new preflight/run; then audience UI, five visually distinct effects, formal encounters and archive |
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
| `8c93476` | pure CaseSession state machine | cumulative and terminal mechanics, failure/no-mutation, local stop and terminal reset unit-tested |
| `29a8d2e` | CaseSession transition durability | one bounded transition crosses the real local DSH append/flush/inspect JSONL barrier |
| `fa2c6b3` | settled-session provider lifecycle repair | verifies detached child durability from storage and stops after a failed first wave before later dispatches |
| `a15db83` | failed provider-run evidence retention | carries partial ledgers out of runtime failures and archives them through the same secret scan before rethrowing |
| `2538a4a` | author-approved 12-second graph spec and plan | freezes option A, evidence ceiling and the new approval boundary |
| `3bdf13f` | fixed 8 planned / 10 maximum provider contract | removes receipt-consumption streams and lowers the conservative cost ceiling |
| `1558a01` | parallel representative wave and settlement isolation | verifies one-stream tool probes, parked settlement sinks, 2.5/8/12 timing facts and fail-fast late quarantine with scripted providers |

Haorui/Codex owns viewer approval, governance, agent/session contracts, deterministic authority checks, evidence and checkpoint integration. It does not own Ruby's 3D authorship.

## Current Position

### Overall checkpoint route

```text
CP00  ██████████  archived
CP01  ████░░░░░░  partial
CP02  ██████████  archived / R2 KEEP
CP03  █████░░░░░  local execution + 8-dispatch provider graph tested; live encounter incomplete
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
| B2. DSH root/continuable + CaseSession durability | `COMPLETE` | scripted adapter, bounded case transition, flush and cold JSONL read |
| B3. Real provider compatibility | `LOCAL GRAPH VERIFIED / THREE FAILED LIVE RUNS / LIVE NOT PASSED` | Run 01 sent 3 and exposed stale DeepSeek auth plus lifecycle masking; Run 02 sent 10 on the old graph and failed before draft; Live Run 03 sent 6 on the replacement 8/10 graph, preserved exact selection and settlement isolation, accepted the first five probes, then quarantined the draft 2.215 seconds beyond the shared 12-second cutoff; probes 07/08 were not sent |
| C1. Draft/approval/Gate to Ruby role interaction | `LOCAL_SLICE_TESTED` | real DSH root with scripted provider → hash approval → Gate → Ruby navigation/ownership → receipt → durable CaseSession transition |
| C2. Five-action effect runtime | `STATE_RULES_TESTED / EFFECTS NOT_STARTED` | cumulative and terminal mechanics are unit-tested; five visually distinct runtime effects are not implemented |
| C3. Loopback host, privacy and evidence API | `NOT_STARTED` | follows provider contract validation |
| C4. Audience UI and proposal viewer | `NOT_STARTED` | follows host/Gate |
| D. Formal encounters and checkpoint archive | `NOT_STARTED` | requires separate provider/capture approvals and human review |

## Technology Feasibility and Current Test Boundary

The architecture is technically feasible with current components:

- text can enter a DSH root session;
- a generated 64×64 checkerboard crossed the validated DSH attachment path into a real Gemini multimodal contribution; this proves bounded transport/schema handling, not artistic image understanding;
- audio should first be locally decoded/transcribed or represented through registered sound metadata; the formal audio route is not yet implemented or tested;
- DSH can maintain continuable child sessions and durable event evidence, including one bounded CaseSession transition;
- the compatibility runner can isolate DSH's automatic child-settlement wake in five parked local sinks, while the active Case Conductor receives only its two explicitly budgeted route/draft turns;
- Scene Builder can already validate semantic affordances and compile navigation plus interaction clips;
- Ruby's deterministic 60 Hz runtime can execute claim/transfer/release and collision-corrected motion;
- the first hash-bound executable draft and Capability Gate seam between DSH and Scene Builder is now locally tested for one registered interaction call, whose exact Ruby receipt and scene hashes become a durable root-session CaseSession transition.

Current successful tests prove local contracts, cumulative/terminal CaseSession mechanics, real DSH session/tool/event plumbing with a scripted provider, an eight-dispatch compatibility graph, deterministic Gate checks, Ruby navigation/ownership execution, and local scripted DSH → approval → Ruby execution → CaseSession durability. They do not yet prove:

- complete mixed-provider reliability: Live Run 03 reached both providers on the replacement graph and accepted the first five probes, but its draft was late/quarantined and the final two probes were not sent;
- real multimodal interpretation quality beyond one generated checkerboard schema probe;
- real-provider satisfaction of the 2.5-second public-trace target, 8-second draft target, or 12-second hard deadline: Live Run 03 measured a 5.762-second first trace, no accepted draft, and draft completion 2.215 seconds after the hard cutoff on the replacement graph;
- an audience-facing proposal/approval UI;
- six real free-text turns covering all five actions;
- five visually distinct runtime effects;
- a formal encounter suite, CP03 checkpoint archive, or CP03 visual/artistic completion.

The real-provider command now verifies the exact in-memory archive before it is
published. A valid archive must cover all eight fixed probes, preserve the
approved provider/model plan, use `providerKind: real`, contain a complete
bounded dispatch ledger, record exactly two active Conductor turns and five
blocked settlement-sink turns, and pass every ProviderCallEnvelope check. Its
chain/trace/draft timestamps, derived latencies and target booleans must agree;
an 8-second design-target miss remains reportable, while a 12-second hard miss
invalidates completion. Runtime
failures now carry their partial ledger into the same archive path before the
error is rethrown. Exact credential values and forbidden secret-bearing fields
are scanned without being copied into the report. A secret-bearing archive is
not written; non-secret but inconsistent or partial evidence is retained with
`FAIL` and cannot be returned as a completed run. This repair post-dates Live
Run 02 and verifies only the generated raw archive, not every byte under the DSH
session directory.

### Verification snapshot — 2026-08-22

| Layer | Result | Scope |
|---|---|---|
| Shared CP03 contracts | `15/15 PASS` | dual execution schema, approval authority, forbidden raw controls |
| PACT DSH host | `typecheck PASS`, `build PASS`, `93/93 PASS` | CaseSession unit/durability plus scripted DSH → approval → Ruby receipt → durable transition; 8/10 provider plan, parallel representative wave, tool-aware cancellation, settlement isolation, timing, fail-fast partial retention, evidence integrity and leak blocking |
| Ruby Scene Builder | `168/168 PASS`, `build PASS` | combined runtime after Ruby's latest merge |
| Browser engineering smoke | `PASS` | CP02 59.88 median FPS; CP03 source-lock/RGB-D; 19-shot camera editor; 300-frame simulation package and replay |
| Provider graph local | `8/8 SCRIPTED PASS`, `8 SENT TO LOCAL ADAPTERS` | one stream per probe; 02/04/05 overlap at a barrier; active Conductor 2 turns; five settlement sinks blocked; controlled 2.0-second trace and 7.5-second draft; 12.001-second draft quarantined before later waves |
| Provider preflight | `FRESH 8/8 ELIGIBLE`, `0 EXCLUDED`, `0 SENT` | both named Keychain entries were present; DeepSeek `deepseek-v4-pro` is 5 planned / 6 maximum, Gemini official `gemini-3.5-flash` is 3/4; both catalog entries are eligible; conservative ten-dispatch estimate `0.36655104 USD` is within the `0.50 USD` cap; this does not authorize or prove a live run |
| Provider network | `FAILED_ARCHIVED`, `6 SENT`, `0 RETRIES` | Keychain-forced Live Run 03: DeepSeek 4 and Gemini 2; the first five probes produced accepted expected tools, the draft tool was rejected as late, and probes 07/08 were not sent; recorded-usage estimate `0.013314525 USD`, not a bill |
| Provider run archive | `THREE FAILURE REPORTS + ONE ZERO-CALL PREFLIGHT TRACKED / RAW LOCAL ONLY` | Run 03 automatically retained a raw partial archive and failing evidence report; archive/selection/provider-kind/timing/orchestration/secret checks passed while completion/ledger/coverage/contracts failed; independent exact-value scan passed all 12 local files including 9 decompressed sessions |
| CP03 visual/archive gate | `FOUNDATION SMOKE ONLY / FORMAL NOT RUN` | ignored engineering video/stills exist; no formal checkpoint copy package or human CP03 decision |

Remote truth was fetched immediately before Live Run 03; the local branch and
its remote were exact at `8cc4733cacc827e1f35cc5fb168a65010eff8fcb`,
which is recorded as the run's source commit. The four named collaborator tips
remained `2136710`, `722b699`, `eacab0c`, and `1691e8e`; none moved during this
live-run slice, so no fetch integration was required. Ruby's newer Case Pack repair,
delivery-package and camera-editor work remains retained. Haorui/Codex did not
introduce a parallel Ruby execution, navigation, collision, ownership, camera
or rendering backend; the CaseSession ledger records existing Gate/Ruby receipt
facts only.

## Immediate Sequence

1. Keep Ruby's merged 3D/camera/delivery work and the DSH → approval → Gate → Ruby seam frozen as the integration baseline.
2. Preserve Live Run 01 as `FAILED_PARTIAL`, Live Run 02 as `FAILED_RECONSTRUCTED`, and Live Run 03 as `FAILED_ARCHIVED`; none is a compatibility pass or CP03 acceptance.
3. Do not repeat Live Run 03: the 8/10 graph fixed undisclosed settlement dispatches but its sequential trace-then-draft critical path did not fit the approved 12-second hard cutoff.
4. Grill and select a new critical-path design: speculative parallel draft plus reconciliation, different approved model/routing or smaller draft contract, or an explicit change to the 12-second artwork requirement.
5. Write and approve the changed design boundary, then verify it with scripted timing/failure tests before creating a fresh zero-call preflight.
6. Any Live Run 04 requires a new exact provider/input/budget approval; no previous approval carries forward.
7. Only after a real-provider `GO`, implement five-action effects, then the loopback API/privacy boundary and audience UI.
8. Add cleared image/audio ingestion paths, run formal encounters, archive videos/stills/copy/receipts, and request separate human technical and artistic decisions.

## Evidence Vocabulary

- `scripted provider`: local test adapter; no claim of live agency.
- `real DSH`: the actual DSH runtime/session/tool/persistence stack, even when its provider is scripted.
- `real 3D mutation or interaction`: the actual Scene Builder runtime changes/evaluates the scene; not a video mock.
- `real provider tested`: only after bounded external DeepSeek/Gemini calls and receipts.
- `provider evidence verified`: the post-run archive passed fixed-scope, real-kind, contract, dispatch, timing, settlement-isolation and secret-leak checks; it is not a model-quality or artistic judgment.
- `checkpoint archived`: only after all interaction, visual, provenance, discourse, archive and human-decision gates pass.
