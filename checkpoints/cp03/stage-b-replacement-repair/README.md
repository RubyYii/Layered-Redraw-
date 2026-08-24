# CP03 Stage B Replacement Repair — Local Zero-call Checkpoint

**Status:** `LOCAL_SCRIPTED_REPAIR_ARCHIVED`

**Capture banner:**

> LOCAL SCRIPTED REPAIR — PROVIDER UNVERIFIED — NO PREFLIGHT — NO REPLACEMENT RUN

This fixed, non-run packet records the locally verified repair of the Stage B
model-facing council boundary. It is deliberately outside every
`model-bakeoff` run root. It contains no provider result, preflight, approval
object, model score, candidate winner, routing decision, visitor data, or Ruby
scene mutation.

## Evidence states

| Layer | State | Evidence boundary |
|---|---|---|
| Written repair spec | `AUTHOR_APPROVED` | the author approved the local zero-call Tasks 1–8 scope |
| Implementation | `LOCAL_IMPLEMENTED` | deterministic submission binding, exact references, phase request policy, terminal handling, and versioned evidence are implemented locally |
| Zero-call repair gate | `TESTED_PASS` | 16/16 named checks pass; the canonical gate SHA-256 is `6d01edc1e5145d4af8a5b7db830eebc74e46cc7f3c1b4b7cb04f4f3e705d005e` |
| Checkpoint media | `CAPTURED_HASH_VERIFIED` | deterministic 1280×720 PNG plus an 18.28-second 1280×720 VP8 WebM |
| Provider compatibility | `UNVERIFIED` | local scripted and in-process interception evidence only |
| Replacement preflight | `NOT_CREATED` | no preflight file or replacement identity exists |
| Replacement run | `NOT_AUTHORIZED_NOT_STARTED` | provider requests `0`; runs started `0` |
| Human model selection | `UNAVAILABLE` | no technically eligible replacement archive or blind decision packet exists |
| Routing / Ruby execution | `UNCHANGED` | no route assignment and no Ruby mutation appears in this packet |
| Formal CP03 acceptance | `UNCHANGED_NOT_GRANTED` | this engineering checkpoint is not the five-class Stage C artwork checkpoint |

## What the local gate establishes

- Agent-authored role content is separate from host-owned role, turn, schema,
  session, and runtime fields; a deterministic binder creates the canonical
  envelope.
- Wrapper-shaped submissions and model-authored runtime fields fail closed;
  there is no creative sanitizer or unknown-reference mapper.
- Known rights, assets, spatial bridges, source locks, objects, affordances,
  rollback, semantic capability, and evidence IDs pass unchanged; unknown IDs
  fail before durability.
- One persistent Conductor session uses a 1,024-token intent phase and a
  512-token minimal commit phase.
- Terminal HTTP 400, max-token-without-tool, hard timeout, and first rejected
  expected-tool-result outcomes retain distinct evidence classifications and
  do not receive a hidden second stream.
- The historical failed Stage B archive keeps its legacy evidence policy and
  bytes. The replacement policy can assess an independently complete pair
  without upgrading a globally partial run to `PASS`.
- The five measured external-side-effect counters are exactly:
  `provider 0 / Keychain 0 / external network 0 / preflight 0 / run 0`.

## Media and report manifest

| File | Bytes | File SHA-256 | Verification |
|---|---:|---|---|
| [`repair-gate-report.json`](repair-gate-report.json) | 7,135 | `dccec8beb9cd0ab6036b7397e5c4a59d87af7399a0d042f26756c86ee1de27d4` | canonical self-hash valid; 16/16 checks `PASS` |
| [`capture-report.json`](capture-report.json) | 1,303 | `fa0528939de721a15b33e43571cd1b46ef919df279460770fcb8507f65e80808` | canonical report SHA-256 `f1888cc44af9f31653842a94e1f9b23f6b3517d86d5363e577bb477fb00855b8` |
| [`media/local-repair-summary.png`](media/local-repair-summary.png) | 345,209 | `ac2613bd8f1af0ca87fbc92bbb059e6c209b5a2bc5fd1330fd11ed34260c1bea` | 1280×720; visually inspected; no crop or hidden status |
| [`media/local-repair-summary.webm`](media/local-repair-summary.webm) | 1,629,887 | `bb6c95097793c4d43a2b030a62f0f5379c480a51fbe8da342231547263094d65` | VP8; 1280×720; 25 fps; 457 decoded frames; 18.28 seconds |

Two independent visible-Chrome trial captures produced the same PNG SHA-256
and the same canonical capture-report SHA-256. Their WebM container bytes and
frame counts differed slightly, as allowed for live video timing, while both
decoded as VP8 at 1280×720 and 25 fps. Six sampled frames in each recording
showed the same ordered highlights:

1. authority boundary;
2. exact references;
3. persistent Conductor caps;
4. terminal classification;
5. legacy/replacement evidence policy;
6. zero external-side-effect boundary.

The browser recorder observed `requestCount: 0`, non-local requests `0`,
failed requests `0`, and console errors `0`. The exact banner passed eight
in-viewport visibility checks during each capture.

## Offline verification

The final local tree passed:

- Shared CP03 contracts: `48/48` tests across `1/1` file;
- Agent Host: `492/492` tests across `40/40` files, plus typecheck and build;
- Scene Builder: `238/238` tests across `34/34` files, plus build.

The historical run
[`cp03-model-bakeoff-20260824T055034Z`](../model-bakeoff/cp03-model-bakeoff-20260824T055034Z/README.md)
still contains exactly 64 files and has no working-tree or untracked diff from
its committed Git state. The exact pre-Task-6/post-Task-8 combined SHA-256
manifest is unchanged at
`78ccd860ea4825c26a2390ed4233d5b3c99bad248ae8f7bbd4b6321874768b6e`.
Its legacy technical-evidence result and self-hash also reverify unchanged in
the Agent Host suite.

## Claim ceiling and next authority gate

This packet proves a local scripted engineering repair and an archived local
diagnostic surface. It does not prove provider acceptance of Gemini 3.7 `LOW`,
DeepSeek/Gemini quality, mixed-provider latency, artistic suitability, a
production route, viewer-to-Agent-to-Ruby interaction, rollback in a live
encounter, formal checkpoint acceptance, deployment, or public release.

A future replacement provider step needs a newly approved scope with refreshed
official prices, exact credential-presence scope, a new preflight and run
identity, a hard USD ceiling, and explicit one-run authorization. This packet
grants none of those permissions.
