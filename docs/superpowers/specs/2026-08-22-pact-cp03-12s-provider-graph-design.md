# PACT CP03 12-Second Provider Graph Design

**Status:** `author_approved`

**Decision date:** 2026-08-22

**Approval evidence:** After Live Run 02 showed that the current representative provider chain missed its shared 12-second deadline, the user selected option A: retain the 8-second draft target and 12-second hard cutoff, and redesign the DSH provider graph rather than relax the deadline.

## Problem

The approved Live Run 02 graph serialized too much provider work:

1. the Case Conductor published route/trace and then opened a second provider stream to consume tool receipts;
2. the Rewriter and Guardian began only after that Conductor turn ended;
3. each child opened a second provider stream to consume its tool receipt;
4. continuable-child settlement woke the same active Conductor, opening an undisclosed parent turn;
5. the draft then opened two more Conductor streams.

The providers authenticated and produced accepted schema-constrained PACT tools, but the graph itself could not complete inside the shared deadline. Extending the deadline would hide this orchestration defect and weaken the public interaction target.

## Goals

- Keep `first public trace <= 2.5s` and `accepted draft <= 8s` as measured design targets.
- Keep `12s` as the non-negotiable hard deadline for the representative route/contribution/draft chain.
- Preserve real DSH root and continuable-child sessions, schema tools, durability checks, retry rules, multimodal input, cancellation probes, and provider-bound roles.
- Prevent automatic child settlement from opening a provider call on the active Case Conductor.
- Reduce the fixed compatibility plan to one disclosed provider stream per logical probe.
- Preserve a complete failure archive when a provider result is late, incomplete, invalid, or unauthorized.

## Non-goals

- This change does not call Gemini or DeepSeek and is not Live Run 03 evidence.
- It does not prove that the 2.5-second or 8-second targets are met by real providers.
- It does not change provider/model selection, credentials, price ceiling, prompt ownership, artistic quality, viewer UI, Ruby's 3D runtime, or the Capability Gate.
- It does not replace DSH, monkey-patch `@deepseek-ai/dsh-subagent`, or claim that a blocked local settlement-sink turn is a model-authored turn.
- It does not authorize a new paid run. Run 03 requires a fresh preflight and a new explicit approval matching the new `8 planned / 10 maximum` plan.

## Decisions

### 1. One provider stream per successful tool probe

Probes 01–06 end their model work once every expected schema tool in that probe has returned a non-error result. The harness then cancels the DSH turn. No provider is asked to narrate or consume a receipt in a second stream; the durable tool result, PACT domain event, provider envelope, and flush/inspect barrier are the receipt.

Probe 02 is canceled only after both `pact_publish_trace` and `pact_route_turn` are accepted. A first-tool-only cancellation is invalid.

### 2. Parallel representative analysis wave

The fixed waves become:

1. Probe 01 and Probe 03: independent provider/schema checks.
2. Probe 02, Probe 04, and Probe 05: Case Conductor route/trace, multimodal Rewriter contribution, and Guardian contribution start against one common chain epoch and deadline.
3. Probe 06: one explicit Case Conductor draft using deterministic references extracted from the two accepted durable contributions.
4. Probe 07 and Probe 08: hard-timeout and first-token cancellation checks.

Probe 04 and Probe 05 no longer wait for Probe 02's provider turn to finish. Their roles, bounded fictional input, allowed tools, and required output are fixed before dispatch. Probe 06 remains dependent on accepted outputs from 02, 04, and 05.

### 3. Active Conductor is not a child-settlement parent

Each continuable compatibility child has a dedicated parked settlement sink as its DSH parent. The active Case Conductor is not the DSH parent of Probe 04 or Probe 05.

In DSH `0.1.0-rc.6`, an idle continuable parent is unconditionally woken by `notifySettlement`. A parked sink therefore receives one local `blocked` turn, but its pre-step gate forbids any provider stream. The provider ledger must also reject any unassigned stream as a second fail-closed layer.

The runner must verify that:

- each expected sink reaches one local blocked turn after its child settles;
- no sink opens an LLM stream;
- the active Case Conductor has no `subagent-settled` work and opens only its two explicitly assigned turns: Probe 02 and Probe 06.

### 4. Fixed budget contracts change

There remain eight logical probes. Normal execution is exactly eight provider dispatches:

- DeepSeek: five probes, five planned, six maximum;
- Gemini: three probes, three planned, four maximum;
- total: eight planned, ten maximum.

The two-dispatch retry headroom remains exactly one pre-side-effect transport retry per provider. No retry is permitted after a PACT side effect has been accepted.

### 5. Timing is explicit evidence, not prose

The runtime result records the representative chain start, first accepted public trace, and accepted draft. It derives:

- public-trace latency and whether the 2.5-second target was met;
- draft latency and whether the 8-second target was met;
- whether the 12-second hard cutoff was met.

A missed 2.5-second or 8-second target remains a reported design-target miss. A missed 12-second cutoff is a run failure and late output remains quarantined.

## Acceptance Criteria

1. Focused scripted tests fail under the old 12-stream graph and pass only with the new 8-stream graph.
2. Probe 02 accepts both route/trace tools before cancellation; Probes 01, 03, 04, 05, and 06 accept their required tool before cancellation.
3. A barrier test proves Probes 02, 04, and 05 have all started before any of them is allowed to complete.
4. The normal scripted run records exactly eight attempts: DeepSeek five, Gemini three.
5. One retry records nine attempts; one retry on each provider records ten; no post-acceptance continuation stream occurs.
6. The active Conductor receives no child-settlement wake. Settlement sinks terminate locally as `blocked`, with zero provider dispatches.
7. Timing facts identify a scripted case that meets both design targets and the hard deadline.
8. A draft accepted after 12 seconds is quarantined, later waves do not start, and the thrown partial result contains the timing and attempt evidence.
9. Agent Host focused tests, full tests, typecheck, and build pass without network access.
10. Progress documentation distinguishes local graph verification from a future paid Live Run 03.

## Evidence Ceiling

When implemented and locally verified, this design may be reported as:

> The CP03 DSH compatibility runner has a locally scripted, bounded 8-dispatch graph with isolated child settlement and explicit 2.5/8/12-second timing evidence.

It may not be reported as real-provider latency success, production interaction readiness, checkpoint acceptance, deployment, or public release until a separately approved Live Run 03 and later visual/human gates supply that evidence.
