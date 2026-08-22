# CP03 Provider Compatibility — Live Run 03 Preflight

**Evidence status:** `ZERO_CALL_PREFLIGHT_VERIFIED`

**Compatibility status:** `NOT_RUN`

**Preflight observed at:** `2026-08-22T22:14:40Z`

**Source commit:** `2a2ae926da1504f050be7d288433a8c0a9dc9239`

**Approval status:** `AWAITING_FRESH_EXPLICIT_APPROVAL`

This preflight belongs to the replacement eight-planned / ten-maximum provider
graph. It does not reuse or extend the approval for Live Run 02, whose approved
scope was the superseded twelve-planned / fourteen-maximum graph.

## Batch Accounting

| Measure | Total | DeepSeek | Gemini |
|---|---:|---:|---:|
| Intended probes | 8 | 5 | 3 |
| Eligible probes | 8 | 5 | 3 |
| Excluded probes | 0 | 0 | 0 |
| Completed probes | 0 | 0 | 0 |
| Planned provider dispatches | 8 | 5 | 3 |
| Maximum provider dispatches | 10 | 6 | 4 |
| Provider dispatches actually sent | 0 | 0 | 0 |

The two-dispatch headroom permits at most one pre-side-effect transport retry
per provider within one approved run. Adapter-internal retries are disabled,
and no retry after an accepted side effect is permitted.

## Selection and Credential Presence

| Provider | Route | Model | Catalog listed | Catalog eligible | Live compatibility passed |
|---|---|---|---:|---:|---:|
| DeepSeek | `deepseek-official` | `deepseek-v4-pro` | yes | yes | no |
| Gemini | `google` | `gemini-3.5-flash` | yes | yes | no |

Both required macOS Keychain items were present. DeepSeek was loaded from
service `codex-deepseek-api-key`, account `yhryzy`; Gemini was loaded from
service `GEMINI_API_KEY`, account `yhryzy`. The values existed only in the
preflight process environment. Neither value was printed or written to this
report, and the command withheld its output unless an exact-value in-memory
check found no credential echo.

`catalogEligible: true` means the repository's provider catalog recognizes the
route/model/capability request. It is not a live compatibility result. Both
entries correctly remain `compatibilityPassed: false` because this preflight
made no provider request.

## Cost Boundary

The repository's dated pricing snapshot resolved the following conservative
worst case for all ten allowed dispatches:

| Provider | Maximum dispatches | Input USD / 1M tokens | Output USD / 1M tokens |
|---|---:|---:|---:|
| DeepSeek | 6 | `0.435` | `0.87` |
| Gemini | 4 | `1.50` | `9.00` |

- input allowance per dispatch: `32,768` tokens;
- output allowance per dispatch: `2,048` tokens;
- worst-case estimate: `0.36655104 USD`;
- user ceiling: `0.50 USD`;
- result: `withinUserCap: true`.

This is a local preflight estimate from the repository's `2026-08-22` pricing
snapshot, not an invoice or independent provider-billing confirmation. Search,
grounding, maps, file search, and other paid provider tools remain disabled.

## Input and Disclosure Boundary

The only eligible input classes are fictional text and one locally generated
64×64 black-and-white PNG checkerboard. The checkerboard envelope was 263 bytes
with SHA-256
`7c48e2e94f6c1dfa3a8e74e327f914490d79cba0cbb25e6b4ba8ff2007456228`.
It remained local during this preflight. No source image, repository content,
private user content, URL, search result, or external tool was supplied.

The observed disclosure facts were:

- `providerRequestsMade: 0`;
- `providerDataSent: []`;
- `externalToolsEnabled: []`;
- `realDispatchAuthorized: false`;
- `realRunRequiresFreshExplicitApproval: true`.

## Decision Gate

The measured state is `ELIGIBLE_AWAITING_EXPLICIT_APPROVAL`, not
`provider compatibility passed`. A Live Run 03 may begin only after a new user
approval explicitly covers all of the following in one boundary:

1. eight fixed probes, eight planned and ten maximum dispatches;
2. DeepSeek `deepseek-v4-pro` at five planned / six maximum dispatches;
3. Gemini official route `google`, model `gemini-3.5-flash`, at three planned /
   four maximum dispatches;
4. both credentials forced from the named Keychain items;
5. fictional text plus the generated checkerboard only;
6. no search, grounding, repository upload, or external tools;
7. `0.50 USD` maximum budget;
8. one run only, with no automatic run-level retry or continuation after a
   failure; only the already budgeted pre-side-effect transport retries may
   consume dispatches nine and ten.

Until that approval exists, the correct next state is to wait. This preflight
does not mutate the Ruby scene, create a PACT draft, or produce checkpoint
visual evidence.
