# CP03 Stage B Task 7 — zero-call eligible preflight

**Status:** `ELIGIBLE_AWAITING_EXPLICIT_APPROVAL`

This archive records exactly one Task 7 preflight. It is readiness evidence, not a paid model comparison, provider-quality result, routing decision, human selection, or CP03 checkpoint acceptance.

## Frozen identity and counts

- Run ID: `cp03-model-bakeoff-20260824T055034Z`
- Runtime code baseline at preflight: `3162c486286e3272099f558b8f3fe7ccc403f34f`
- Intended / eligible / excluded / sent: `28 / 28 / 0 / 0`
- Planned / maximum dispatches: `28 / 30`
- Provider requests made: `0`
- Retry reserve: at most one pre-side-effect transport retry for DeepSeek and one for Gemini; both are already included in the 30-dispatch maximum.

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

Only presence was checked for these exact references:

- DeepSeek: service `codex-deepseek-api-key`, account `yhryzy`, env reference `DEEPSEEK_API_KEY` — present.
- Gemini: service `GEMINI_API_KEY`, account `yhryzy`, env reference `GEMINI_API_KEY` — present.

The presence command omitted `-w`, ignored stdout/stderr, and used only the process exit status. No Key value was read, printed, archived, or loaded into a provider process.

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

## Stop boundary

No `approval.json` exists. Task 8 has not started. A paid run requires a new explicit approval that names this exact run ID, hashes, models/routes, caps, retry terms, input classes, forbidden capabilities, one-run/no-rerun rule, Keychain-only loading after authorization, and USD `0.50` ceiling. A generic “continue” is insufficient.
