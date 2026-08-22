# CP03 Provider Compatibility — Live Run 02

**Evidence status:** `FAILED_RECONSTRUCTED`

**Compatibility status:** `NOT_PASSED`

**Run ID:** `cp03_live02_20260822212521242_4da3eae2`

**Approval ID:** `user_cp03_live02_20260822212521242`

**Approved at:** `2026-08-22T21:25:21.242Z`

**Approved boundary:** eight fixed probes; twelve planned and fourteen maximum
provider dispatches; `0.50 USD` cap; fictional text plus one generated 64×64
checkerboard only. DeepSeek and Gemini credentials were both forced from their
specified macOS Keychain entries. No fallback to inherited provider credentials
was permitted.

## Batch Accounting

| Measure | Count |
|---|---:|
| Intended probes | 8 |
| Preflight eligible | 8 |
| Preflight excluded | 0 |
| Planned provider dispatches | 12 |
| Maximum provider dispatches | 14 |
| Provider dispatches actually sent | 10 |
| Planned dispatches not sent | 2 |
| Probes that reached a provider | 7 |
| Provider retries | 0 |

The command stopped with a non-zero exit after one run. It did not retry the
failed chain, resume it, or start Live Run 03.

Two additional local DSH steps were refused before a provider stream opened and
are not counted as sent dispatches: one automatic parent wake-up after the
Rewriter child settled, and the first `probe-06` step after the shared deadline
had already expired. Consequently neither planned `probe-06` dispatch was sent.

## Observed Outcomes

| Probe | Provider / model | Sent | Outcome | Recorded usage | Approx. elapsed |
|---|---|---:|---|---:|---:|
| `probe-01` | DeepSeek / `deepseek-v4-pro` | 1 | schema-valid `pact_submit_contribution` accepted; caller then cancelled as planned | 1,020 input / 339 output | 4.39 s |
| `probe-02` | DeepSeek / `deepseek-v4-pro` | 2 | `pact_publish_trace` and `pact_route_turn` accepted, then terminal stop | 3,445 input / 316 output | 6.16 s |
| `probe-03` | Google / `gemini-3.5-flash` | 1 | schema-valid `pact_submit_contribution` accepted; caller then cancelled as planned | 748 input / 214 output | 1.91 s |
| `probe-04` | Google / `gemini-3.5-flash` | 2 | synthetic-image Rewriter contribution accepted, then terminal stop | 3,943 input / 212 output | 3.04 s |
| `probe-05` | DeepSeek / `deepseek-v4-pro` | 2 | Guardian contribution accepted; terminal response completed about 0.66 s after the shared deadline and was marked late/quarantined | 1,128 input / 416 output | 6.49 s |
| `probe-06` | DeepSeek / `deepseek-v4-pro` | 0 | draft dispatch refused locally because the representative-chain deadline had expired | no usage event | not sent |
| `probe-07` | DeepSeek / `deepseek-v4-pro` | 1 | long stream reached a first visible token and was cancelled by the caller at the hard-timeout boundary | no usage event | 11.75 s |
| `probe-08` | Google / `gemini-3.5-flash` | 1 | stream reached its first visible token and was immediately cancelled by the caller | no usage event | 0.62 s |

The final error was:

```text
CompatibilityDispatchError: PROVIDER_RESULT_LATE_QUARANTINED: probe-05 dispatch 2
```

The first public trace appeared about 4.24 seconds after the representative
chain began, above the 2.5-second design target. No draft was produced by the
8-second target, and no draft dispatch could start before the 12-second hard
deadline. These are measured failures of the current routing/orchestration
against the approved targets, not authentication failures.

The raw sessions show that both providers can authenticate, stream, and produce
accepted schema-constrained PACT tool calls. Gemini also consumed the generated
checkerboard attachment in the multimodal Rewriter probe. This does not establish
the quality of free-form artistic interpretation, audience interaction, or a
complete mixed-provider encounter.

## Recorded Usage and Cost Boundary

| Provider | Sent dispatches | Dispatches with usage | Input tokens | Output tokens | Recorded-usage estimate |
|---|---:|---:|---:|---:|---:|
| DeepSeek | 6 | 5 | 5,593 | 1,071 | `0.003364725 USD` |
| Gemini | 4 | 3 | 4,691 | 426 | `0.010870500 USD` |
| **Total** | **10** | **8** | **10,284** | **1,497** | **`0.014235225 USD`** |

The estimate uses the repository's 2026-08-22 pricing snapshot: DeepSeek
`0.435 / 0.87 USD` and Gemini `1.50 / 9.00 USD` per million input/output
tokens. The cancelled `probe-07` and `probe-08` streams emitted no usage event,
so their provider-side billing is not represented. The preflight worst-case
estimate for the approved maximum remained `0.48224256 USD`, below the
`0.50 USD` cap. Neither figure is independent provider-billing confirmation.

## Failure Separation

Three facts must remain separate:

1. **Authentication and basic provider compatibility improved.** The forced
   Keychain credentials reached successful DeepSeek and Gemini streams; the
   Live Run 01 DeepSeek 401 condition did not recur.
2. **The current representative chain missed its latency contract.** Sequential
   Conductor work followed by the parallel Rewriter/Guardian wave consumed the
   full shared 12-second window before `probe-06` could begin. Extending the
   deadline would change an approved design target and is not treated as a bug
   fix.
3. **DSH continuable settlement exposes a second orchestration decision.** The
   Rewriter child's settlement notice automatically woke the unparked parent
   Conductor. Because that provider turn was not in the fixed dispatch plan, the
   ledger rejected it locally as an undisclosed dispatch. It incurred no network
   call, but a production chain must either budget this parent consumption turn
   or deliberately park and aggregate child results through a different bounded
   mechanism.

No PACT draft, Capability Gate approval, ScenePatch, Ruby scene mutation, or
audience-facing result occurred.

## Evidence Integrity and Retention

The pre-fix command did not produce its normal `raw-run.json` or
`evidence-report.json` because the runtime threw before archive publication.
Therefore this run is `FAILED_RECONSTRUCTED`, not `provider evidence verified`.

Ten compressed DSH session logs and one 263-byte checkerboard object remain in
the ignored local run directory. A decompressed exact-value scan against both
forced Keychain credentials inspected all eleven files and found zero matches.
No credential value is stored in this report.

| Local artifact | SHA-256 |
|---|---|
| checkerboard object | `7c48e2e94f6c1dfa3a8e74e327f914490d79cba0cbb25e6b4ba8ff2007456228` |
| `19cc99dc-28a5-428c-9c60-876ea1976b17/session.jsonl.zstd` | `1f53723b7ab052a0c7be06b3342c1cb273ef186580373680d23403a0859521cc` |
| `1f81588d-742a-4b19-b4b2-c2ad8658675a/session.jsonl.zstd` | `2acf50c25429a1af1bf966edc07f9c7e154f96dda389be2898cc5913da8f0e62` |
| `8df7dcd2-d29d-4dd6-870b-66c5aaff69eb/session.jsonl.zstd` | `39da8909e5250e54157b06809ec5b10b97e8b5dc0498f90cb26655db0423c362` |
| `9a8d8618-455c-493c-8bbf-a36f5766a6f7/session.jsonl.zstd` | `1bc3d11ac52266b0d50e706e979a1f583a860b7344821462a70b925d9a667c35` |
| `case_1bba82a3781d4a5291006046911e192b/session.jsonl.zstd` | `3830290e08167dfb6c8765be71f65a52e498c67eb9095c71d3f6a3ab9c77b55a` |
| `case_8c54a930f06344d09249c3f59bd115ab/session.jsonl.zstd` | `2f147bf3de558c37b864d9723bdbb94bc56800526580ea041ce3c9e70b8673e5` |
| `case_c5bdd63edc3d421aa78354bf7999f99b/session.jsonl.zstd` | `724f273877d558506092a7972b71f75023be7986056ad6e781a07c7e19e8026c` |
| `case_d9e41b10915c451388f378897e03e62a/session.jsonl.zstd` | `1eec3986609aed56565685388d666cd8a55b4d98adbbf5abf3545927030783f0` |
| `case_efdf8b0a03a64d41ae6978af74c0fa23/session.jsonl.zstd` | `d67c3657e1dd07dfa349b07e94a1ec5fae5eb185183cf2713922ee032a6b1760` |
| `ff035b60-a1f7-4582-83ff-69f57a8b0ea1/session.jsonl.zstd` | `f8d91c8f82ca2d83b33c827d0979fb8702e89163cfa67983d1426790292c8c5a` |

Commit `a15db83` repairs future failure retention: runtime errors now carry the
partial dispatch ledger, and the command writes a secret-scanned raw archive plus
a failing evidence report before rethrowing. Local verification is `87/87 PASS`,
with typecheck and build passing. The repair was made after Live Run 02 and does
not retroactively create canonical attempt envelopes for this run.

The ignored raw run directory remains local and has not been deleted. This
tracked report is collaboration-safe evidence, but it is not a remote backup of
the compressed sessions.

## Media and Human Gates

No scene mutation occurred, so this failed engineering sub-gate has no honest
3D render, video or still. It is not a formal CP03 checkpoint acceptance. The
required CP03 videos, screenshots, copy, receipts and separate human technical
and artistic decisions remain future gates after the provider/orchestration
decision and an implemented five-action encounter.
