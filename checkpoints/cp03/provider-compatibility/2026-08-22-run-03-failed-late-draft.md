# CP03 Provider Compatibility — Live Run 03

**Evidence status:** `FAILED_ARCHIVED`

**Compatibility status:** `NOT_PASSED`

**Run ID:** `cp03_live03_20260822222028_fa5bcc43`

**Approval ID:** `user_cp03_live03_20260822222028_fa5bcc43`

**Approved at:** `2026-08-22T22:20:28Z`

**Source commit:** `8cc4733cacc827e1f35cc5fb168a65010eff8fcb`

**Command exit:** `1`

**Automatic evidence report:** `FAIL`

The user explicitly approved one Live Run 03 with eight fixed probes, eight
planned and ten maximum provider dispatches, a `0.50 USD` ceiling, fictional
text plus one generated 64×64 checkerboard, and no search, grounding,
repository upload or external tools. DeepSeek and Gemini credentials were
forced from their named macOS Keychain items. No run-level retry or continuation
was permitted.

## Batch Accounting

| Measure | Count |
|---|---:|
| Intended probes | 8 |
| Preflight eligible | 8 |
| Preflight excluded | 0 |
| Planned provider dispatches | 8 |
| Maximum provider dispatches | 10 |
| Provider dispatches actually sent | 6 |
| Provider dispatches not sent | 2 |
| Probes with accepted expected tools | 5 |
| Probe IDs represented in the ledger | 6 |
| Provider retries | 0 |

Four dispatches used DeepSeek `deepseek-v4-pro`; two used the official Google
route for `gemini-3.5-flash`. The command stopped after the first hard-deadline
failure. It did not retry the run, dispatch probes 07 or 08, or begin Live Run
04.

## Observed Outcomes

| Probe | Provider | Sent | Result | Provider latency |
|---|---|---:|---|---:|
| `probe-01` | DeepSeek | 1 | `pact_submit_contribution` accepted | 5.002 s |
| `probe-02` | DeepSeek | 1 | `pact_publish_trace` and `pact_route_turn` accepted | 5.752 s |
| `probe-03` | Gemini | 1 | `pact_submit_contribution` accepted | 1.902 s |
| `probe-04` | Gemini | 1 | generated-checkerboard `pact_submit_contribution` accepted | 1.780 s |
| `probe-05` | DeepSeek | 1 | Guardian `pact_submit_contribution` accepted | 5.555 s |
| `probe-06` | DeepSeek | 1 | `pact_submit_draft` returned after the shared deadline and was rejected/quarantined | 8.426 s |
| `probe-07` | DeepSeek | 0 | not started after fail-fast stop | not sent |
| `probe-08` | Gemini | 0 | not started after fail-fast stop | not sent |

Every sent stream authenticated and returned a tool call. The first five probes
produced six accepted PACT tool calls. The sixth stream also produced the
expected draft tool name, but its result was not promoted because
`lateQuarantined: true`. Authentication and schema use therefore succeeded for
the reached calls, while the complete compatibility contract failed.

## Critical-path Timing

The representative chain began at `2026-08-22T22:20:33.632Z` after the initial
probe-01 / probe-03 contribution wave.

| Timing fact | Observed | Contract | Result |
|---|---:|---:|---|
| First accepted public trace | 5.762 s | 2.5 s target | miss |
| Draft dispatch start from chain start | 5.789 s | — | observed |
| Time remaining when draft dispatch began | 6.211 s | 12 s hard window | observed |
| Draft provider stream | 8.426 s | — | observed |
| Draft completion from chain start | 14.215 s | 12 s hard cutoff | miss by 2.215 s |
| Accepted draft | none | 8 s target | miss |

The failure was:

```text
PROVIDER_RESULT_LATE_QUARANTINED: probe-06 dispatch 1
```

The first response chunk for the draft arrived before the 8-second design
target, but no complete schema-valid draft had been accepted by that time.
Partial streaming text is not an approved draft and cannot satisfy the target.

## What the 8/10 Repair Did and Did Not Fix

The replacement graph removed the old receipt-consumption streams and prevented
automatic child settlement from opening undisclosed provider turns. The partial
run recorded exactly two active Conductor turns and four blocked settlement-sink
turns; the evidence verifier marked orchestration `PASS`. No hidden parent wake
consumed a seventh dispatch.

The repair did not shorten the real critical path enough. The trace wave used
5.762 seconds, after which the sequential draft stream needed another 8.426
seconds. At the observed provider latencies, reducing dispatch count alone does
not make the current trace-then-draft dependency fit inside twelve seconds.
Repeating the same run would test provider variance, not repair this structural
timing conflict.

## Evidence-verifier Result

The automatic report retained the failure rather than presenting a partial run
as complete:

| Check | Result |
|---|---|
| archive | `PASS` |
| completion | `FAIL` |
| dispatch ledger | `FAIL` |
| probe coverage | `FAIL` |
| provider/model selection | `PASS` |
| provider kind | `PASS` |
| call contracts | `FAIL` |
| timing consistency | `PASS` |
| orchestration consistency | `PASS` |
| archive secret scan | `PASS` |

Its findings were `RUN_COMPLETION_MISMATCH`,
`SENT_DISPATCH_COUNT_OUT_OF_BOUNDS`, `LATE_RESULT_QUARANTINED`, missing
probe-07/probe-08 evidence, rejected expected draft-tool evidence, and the two
missing planned cancellation dispatches. These are expected consequences of the
fail-fast partial run; they remain compatibility failures.

## Recorded Usage and Cost Boundary

| Provider | Sent | Input tokens | Output tokens | Recorded-usage estimate |
|---|---:|---:|---:|---:|
| DeepSeek | 4 | 9,341 | 1,687 | `0.005531025 USD` |
| Gemini | 2 | 2,591 | 433 | `0.007783500 USD` |
| **Total** | **6** | **11,932** | **2,120** | **`0.013314525 USD`** |

The estimate applies the repository's 2026-08-22 pricing snapshot to recorded
usage. It is not provider billing confirmation. The approved conservative
ten-dispatch estimate remained `0.36655104 USD`, below the `0.50 USD` ceiling.

## Input, Credentials and Retention

The real run sent only the approved fictional compatibility prompts. Probe-04
also sent the generated 263-byte checkerboard to Gemini. No artwork source
image, repository content, private user content, search result, URL or external
tool was supplied.

The automatic archive secret check passed. A second exact-value scan loaded both
credentials from Keychain without printing them, decompressed all nine session
logs, and inspected all twelve files in the run directory. It found zero exact
credential matches.

The ignored local run directory is approximately 96 KB and contains
`raw-run.json`, `evidence-report.json`, nine compressed DSH session logs and the
checkerboard object. These raw artifacts remain local and are not a remote
backup. This tracked report records their integrity without publishing the raw
sessions.

| Local artifact | SHA-256 |
|---|---|
| checkerboard object | `7c48e2e94f6c1dfa3a8e74e327f914490d79cba0cbb25e6b4ba8ff2007456228` |
| `evidence-report.json` | `942851d639d92259d0a848e3bd0a584d1d212cb5f04136cbf2253d22bc74762c` |
| `raw-run.json` | `d6e69e8ea08430332e61e806aa98f07521d51a29ce476218fb1bd63ab19d3c8a` |
| `445627b1-e589-45c0-8d56-c9ebf021e820/session.jsonl.zstd` | `f86517a8ac1e0db5f982114f83e800e8b49abe2df9a783aa05fec42030b06365` |
| `73316264-8954-4439-9565-60bcacef546c/session.jsonl.zstd` | `7e4b15d05db88c9b1f4df3a0e4e1535280d70e77cb8645613509c6352f2c144a` |
| `9bc49102-3c5e-45e2-b140-1158d928433c/session.jsonl.zstd` | `836677544c7187aa89e55eec65c5613c54498442406b81f9c82ba7e79efb7d9a` |
| `c8d551ce-836f-4aef-9dd9-f3a0ab5f0ed9/session.jsonl.zstd` | `7fce81470c4001cf791bcc7edfc9b893d7ab68aa5ee68d627b221937e7bfa72d` |
| `case_080a29a99d38403abc97878a8973217d/session.jsonl.zstd` | `ea0d246796999dd12268fa31ebb9d866003d56c22e11852de24e3c2caed54213` |
| `case_10e3055d630a4a728c0bcecddb101394/session.jsonl.zstd` | `4683ac598424000e6c5e2095ddf62f6bb576ecfdc94aa0d7c2ff65e423adc8d9` |
| `case_297c7bc7c46a40aba6c0746c609493f4/session.jsonl.zstd` | `eb463303732d398d1afaa35655c986c37588752149ea8f438f7d5ea9ea08d32a` |
| `case_59911205162e4bc3a671d0bf01873794/session.jsonl.zstd` | `e387a966493d615d3f08fe1b346057244ecf964379a01a7dbb239f0af7cd8670` |
| `case_d26db0456ec14efc8382c170b9ef1944/session.jsonl.zstd` | `e7988d2193f46f0216c1e13ab6928ec73cd39aed66714d9423d9f49da620fdd9` |

## Artwork and Next Gate

No PACT draft was accepted, no viewer approval was requested, and no Capability
Gate or Ruby scene mutation ran. Therefore this engineering failure has no
honest 3D result video or screenshot and is not a CP03 checkpoint archive.

Before any Live Run 04, the critical path needs a new design decision and local
scripted verification. The design review must compare at least: speculative
parallel draft composition with deterministic reconciliation; a different
approved model/routing or smaller draft contract; and changing the 12-second
deadline as an explicit artistic/product decision rather than calling it a
repair. Any changed graph, model, scope or deadline requires a fresh preflight
and a new exact approval. No option is selected by this report.
