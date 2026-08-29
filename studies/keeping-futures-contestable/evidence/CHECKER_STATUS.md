# Argument-governance checker status

Command:

```powershell
F:\drawforfun\.venv\Scripts\python.exe C:\Users\15810\.codex\skills\argument-governance\scripts\check_argument_governance.py . --strict-relations --json
```

Latest run: 2026-08-28.

- Profile: `research-relations-v2`
- Structural/enum/cross-table parsing defects: resolved.
- Gaps: 4; claims: 6; data objects: 3; result objects: 3; contributions: 4; innovations: 2; relations: 34.
- Primary contributions: 1.
- Focus-review candidates: 0.
- Remaining issues: 17, all intentionally evidence-facing rather than packet-format errors.

The critical remaining diagnostic is `CON-01`: the primary empirical contribution has no completed human data → result → claim path. `CLM-03`, `CLM-04`, and `CLM-05` remain unsupported; `NOV-01` and `NOV-02` remain comparison-thin. Reviewer defences remain weak until pilot, ethics, recruitment, coding, and analysis are complete.

Do not “fix” these diagnostics with synthetic data, wording, or extra tables. They are the correct blockers before any submission-facing empirical claim.
