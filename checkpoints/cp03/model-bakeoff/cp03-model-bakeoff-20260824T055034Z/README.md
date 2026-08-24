# CP03 Stage B Tasks 7–8 — eligible preflight and one failed partial run

**Status:** `PARTIAL_FAILED_ARCHIVED / NO_TECHNICALLY_ELIGIBLE_PAIRS`

This archive records one zero-call Task 7 preflight and the one separately approved Task 8 real run bound to it. The run is preserved as failed partial evidence. It is not a successful bake-off, provider-quality finding, routing decision, human selection, Ruby interaction, or CP03 checkpoint acceptance.

## Frozen identity and counts

- Run ID: `cp03-model-bakeoff-20260824T055034Z`
- Runtime code baseline at preflight: `3162c486286e3272099f558b8f3fe7ccc403f34f`
- Preflight intended / eligible / excluded / sent: `28 / 28 / 0 / 0`
- Planned / maximum dispatches: `28 / 30`
- Preflight provider requests made: `0`
- Retry reserve: at most one pre-side-effect transport retry for DeepSeek and one for Gemini; both are already included in the 30-dispatch maximum.

The preflight ran against code baseline `3162c486`. Before Task 8, Ruby's scene-builder-only work was incorporated by a strict fast-forward to combined commit `7e441d4`; the frozen plan, fixtures, pricing, caps and preflight hashes remained valid under the zero-call authorization gate.

## Frozen candidates and routes

- `deepseek-official/deepseek-v4-pro`
- `deepseek-official/deepseek-v4-flash`
- `google/gemini-3.5-flash`
- `google/gemini-3.6-flash`
- `google/gemini-3.7-flash`

The local catalog reported DSH adapter `0.1.0-rc.6` for both routes and pi-ai catalog `0.84.2` for the Gemini candidates. DeepSeek candidates expose text input; Gemini candidates expose text and image input.

## Price evidence and budget basis

- DeepSeek official source: https://api-docs.deepseek.com/quick_start/pricing
- Gemini official source: https://ai.google.dev/gemini-api/docs/pricing
- Retrieval time: `2026-08-24T05:50:34Z`
- Planned estimate: USD `0.3190784`
- DeepSeek retry reserve: USD `0.01486848`
- Gemini retry reserve: USD `0.021504`
- Worst-case estimate: USD `0.35545088`
- Proposed hard ceiling for a separately approved run: USD `0.50`

DeepSeek is estimated with the official peak cache-miss input and peak output rates. Gemini is estimated with the current Standard paid rates; no Batch, Flex, Priority, context-caching, tool, off-peak, or cache-hit discount is assumed.

## Role token caps

| Phase | Maximum input | Maximum output |
| --- | ---: | ---: |
| ConductorIntent | 8,192 | 1,024 |
| Archivist | 8,192 | 1,024 |
| Guardian | 8,192 | 1,024 |
| ConductorCommit | 8,192 | 512 |
| Witness | 8,192 | 1,024 |
| Rewriter | 8,192 | 1,024 |

The same phase cap applies to every candidate assigned to that phase.

## Credential boundary

Task 7 checked only the presence of these exact references:

- DeepSeek: service `codex-deepseek-api-key`, account `yhryzy`, env reference `DEEPSEEK_API_KEY` — present.
- Gemini: service `GEMINI_API_KEY`, account `yhryzy`, env reference `GEMINI_API_KEY` — present.

The Task 7 presence command omitted `-w`, ignored stdout/stderr, and used only the process exit status. After the fresh Task 8 authorization gate returned `AUTHORIZED`, the one-run parent loaded both exact values into its isolated child. The child and post-run verifier used the values only for provider authentication and exact-value secret scans. No value was printed or persisted; the post-run recursive scan found `0` exact secret matches and `0` forbidden local-path matches.

## One approved real run

- Approval ID: `approval_cp03_model_bakeoff_20260824T102203Z`
- Approval canonical SHA-256: `67e103468d19525f060cf1b3451136d5345784d1d7426218ca1a08036ea8d71e`
- Approval ceiling: USD `0.50`
- Result: `PARTIAL`
- Planned / maximum / sent: `28 / 30 / 24`
- Accepted / failed / skipped: `2 / 22 / 4`
- Provider requests made: `24`
- Retry slots used: DeepSeek `false`; Gemini `false`
- Estimated cost: USD `0.1464567`, marked `ESTIMATE_NOT_BILLING`
- Transport disposed: `true`

The 24 attempts split into `21` schema failures, `1` late timeout, and `2` accepted outputs. All four ConductorCommit cases were deterministically skipped because their corresponding ConductorIntent cases failed. The only accepted outputs were the two repetitions of `deepseek-v4-flash / Archivist`. Schema failures and a late timeout are not eligible for the bounded pre-side-effect transport retry, so neither provider retry slot was used and the run was not repeated.

## Technical evidence result

The deterministic verifier returned `FAIL`:

| Check | Result |
| --- | --- |
| archive | PASS |
| approval | PASS |
| plan | PASS |
| dispatch budget / exact completion | FAIL |
| contracts | FAIL |
| grounding | FAIL |
| timing | FAIL |
| usage and estimated cost | FAIL |
| DSH trace | FAIL |
| exact secret scan | PASS |

Because the exact run did not complete, the base eligibility gate excludes every role/model pair even though one Archivist candidate produced two individually accepted attempts. Technically eligible pairs: `0 / 12`. The visible blind packet therefore contains zero candidates and no author selection can be collected from this run. Production routing remains `pending-bakeoff`.

## Inputs and forbidden capabilities

Permitted fixed input classes are fictional text, one programmatically generated synthetic spatial image, and a synthetic scene registry. Search, grounding, repository upload, arbitrary external tools, file access, shell access, arbitrary code execution, model substitution, hidden provider streams, automatic reruns, and dispatches beyond the bounded retry contract are forbidden.

## Cryptographic bindings

- Preflight: `f5f09458460c453187745861ea0837277008d8b9171f972290393955430355e9`
- Plan: `670d37426345f536ee6277e39ca0183005d93535e14bfe35eebf74bc80fefc48`
- Fixtures: `92f94e735e37b51cd0c33e4cd6dd8b6c65b2dbae439aa8bd0f175261090ba524`
- Prompts: `1f1e01b41f37b79742ad1b49e3980f2eea2e0480768188f835401c0399cdbbf8`
- Schemas: `831f7c184ac418f15683bccf34b0e21a7b985f789791f1708bf74b4a02a16f16`
- Pricing manifest: `37305376843c7e01d274982b7479c4555df5d048887cf06f91e454787ef0316a`
- Role caps: `7cd6e9fdf328c84c9b6b4cc536db579c947a7f1235e46f5f72bc3fd25dd2b24a`
- Keychain references: `0a106e2edcd36f7a7ceaa2a2159f623007ee1dfe3099c2a8b542e68435b317cd`
- DeepSeek archived price extract: `0e9c423b7672e3c8ad347f7388e296efcc5fa33649e02b26a7373846b18e43c2`
- Gemini archived price extract: `9bbecbb52ae78edfaf892248f775bf99d6432185f9a86d56e5a511516373b882`
- Technical evidence: `02331010bba16eb500aee06e76bf88daed3a8b2fccdd3d7ba2944f41e2c86447`
- Blind packet: `31bde46c8154b1093d1eba3e3b39fe55b2dda12687ce2c7e82a3c6d86c35d471`
- Sealed mapping: `6c999172777efcecdb99d6137d3c58876c216fa0d5986a16a4f0128d3efcc5c1`
- Final screenshot file: `4e15b18d3b2663c6251fb782547d738113db200e222aa81da726d67c8ee21e20`
- Final video file: `9c1586c9c64731d6e321a1f33c778b85d68131782db92931447a21d2d6ba95c6`

## Review media

The final local capture contains no candidate cards and explicitly states `NO ELIGIBLE CANDIDATES`, `CAPTURE REQUESTS 00`, `ELIGIBLE PAIRS 00`, `SELECTIONS 00`, and `SEALED MAPPING NOT LOADED`. The screenshot is 1280 × 720. The VP8 WebM is 1280 × 720, 25 fps and 26.36 seconds; all five empty role sections are highlighted in sequence. Capture-time non-local browser requests were `0` and are separate from the real run's `24` provider requests.

The first local capture used a generic packet claim that was ambiguous for a zero-candidate result. It is preserved under `review-attempt-01-superseded/`; no provider call occurred during either capture. `review/` is the final reviewed media packet.

## Final offline verification

- Shared CP03 contracts: `30 / 30 PASS`
- PACT Agent Host: `445 / 445 PASS` across 36 files; typecheck and build pass
- Ruby Scene Builder: `238 / 238 PASS` across 34 files; build passes
- Final archive assertion: all frozen bindings, counts, canonical hashes, media hashes, zero-candidate packet state and budget boundary match
- Final generic credential/path scan: zero Google-key, long-token, bearer-token, private-key, credential-assignment or absolute-user-path matches

These offline passes verify code and archive consistency only. They do not upgrade the real provider result, whose technical evidence remains `FAIL`.

## Stop boundary

The one approval has been consumed and this run root is permanently occupied. No rerun, resume, model substitution, Task 9 author selection, routing replacement, Stage C interaction, deployment or public release occurred. Any redesign or replacement bake-off requires diagnosis, a new preflight, a new run ID and fresh explicit approval; a generic “continue” is insufficient.
