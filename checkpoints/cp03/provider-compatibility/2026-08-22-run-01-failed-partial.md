# CP03 Provider Compatibility — Live Run 01

**Evidence status:** `FAILED_PARTIAL`

**Compatibility status:** `NOT_PASSED`

**Run ID:** `cp03_real_20260822210759395_09a01fd6`

**Approval ID:** `user_cp03_8probe_20260822210759395`

**Approved at:** `2026-08-22T21:07:59.395Z`

**Approved boundary:** eight fixed probes; twelve planned and fourteen maximum
provider dispatches; `0.50 USD` cap; fictional text plus one generated 64×64
checkerboard only.

## Batch Accounting

| Measure | Count |
|---|---:|
| Intended probes | 8 |
| Preflight eligible | 8 |
| Preflight excluded | 0 |
| Provider dispatches sent | 3 |
| Provider dispatches not sent | 9 planned / 11 maximum |
| Probes with a successful expected outcome | 1 |
| Probes not started | 5 |

The command stopped after the first wave. It did not retry, resume or start a
second paid run.

## Observed Outcomes

| Probe | Provider / model | Outcome | Recorded usage | Approx. latency |
|---|---|---|---:|---:|
| `probe-01` | DeepSeek / `deepseek-v4-pro` | HTTP 401 `AUTH`; no accepted tool | no usage event | 0.79 s |
| `probe-02` | DeepSeek / `deepseek-v4-pro` | HTTP 401 `AUTH`; no accepted tool | no usage event | 0.82 s |
| `probe-03` | Google / `gemini-3.5-flash` | expected structured `pact_submit_contribution` accepted | 750 input / 285 output | 2.57 s |
| `probe-04`–`probe-08` | fixed approved routes | not sent | none | none |

Only fictional compatibility text reached providers. The synthetic image was
created locally but was not sent because multimodal `probe-04` never started.
No repository content, artwork source, participant material, private user
content, browsing or provider-side tools were included.

Using the repository's 2026-08-22 pricing snapshot, the one recorded Gemini
usage event estimates to `0.00369 USD`. The conservative maximum for the three
started dispatches under their declared token envelopes is `0.09965568 USD`.
These are local estimates, not independent provider-billing confirmation.

## Failure Separation

Two independent failures occurred:

1. The real-run wrapper preferred the inherited `DEEPSEEK_API_KEY`. Live
   inspection after the run proved that this value and the macOS Keychain item
   `codex-deepseek-api-key / yhryzy` were both present but were not equal. The
   inherited value received both 401 responses. No credential value is stored
   here.
2. After those terminal provider outcomes and the successful Gemini child
   outcome, DSH had already flushed and settled a continuable child. The runner
   called `sessions.flush()` again on the detached session and threw
   `session ... is not live in this store`, masking the provider result.

Commit `fa2c6b3` repairs the local lifecycle defect by checking live sessions,
verifying already-settled sessions against durable storage, and validating the
first wave before any later wave starts. Local scripted regression evidence is
`7/7 PASS`; the full Agent Host evidence is `86/86 PASS`, with typecheck and
build passing. This local repair has not received a second real-provider test.

## Evidence Integrity and Retention

The normal `raw-run.json` and `evidence-report.json` were not produced because
the runtime threw before the command reached its archive stage. This is why the
run must not be labelled `provider evidence verified`.

Four compressed DSH session logs were retained in the ignored local run
directory. An exact-value scan against the Gemini Keychain value, the inherited
DeepSeek value and the DeepSeek Keychain value found no credential value in any
of the four logs. Their SHA-256 identities are:

| Session log | SHA-256 |
|---|---|
| `39809355-ce07-457b-ad0d-930de8f2fc29/session.jsonl.zstd` | `749ebd194af5ec64389af150acdc8606fb06d6ebb2b6d68ec50ae8961dae7a6c` |
| `case_52eeb7d87b604d089e805402943bfe14/session.jsonl.zstd` | `9ae23f3eb32d1be883c32395674f39df8e8c11ac01e0925754e00d8e359f8994` |
| `case_5a203b93bb13408b91154feed992691b/session.jsonl.zstd` | `9bd3b211d4493aba2650287a84ea563906c9659c8916eb709333934e4857b00f` |
| `df020885-8254-4e79-98fb-125afbc71910/session.jsonl.zstd` | `a5e7ffdaeb60e59137cdde7eca326b6f80fc61cb47d6ca4fa6e3906877c0a9c9` |

The generated checkerboard object is 263 bytes and has SHA-256
`7c48e2e94f6c1dfa3a8e74e327f914490d79cba0cbb25e6b4ba8ff2007456228`.

The ignored raw run directory remains local and has not been deleted. This
tracked report is the collaboration-safe archive; it does not claim that the
raw logs are remotely backed up.

## Media and Human Gates

No scene mutation occurred, so this failed engineering sub-gate has no honest
3D render, video or still. It is not a formal CP03 checkpoint acceptance. The
required CP03 videos, screenshots, copy, receipts and separate human technical
and artistic decisions remain future gates after a successful compatibility
run and implemented five-action encounter.

