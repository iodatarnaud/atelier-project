# AI_SYSTEM

Multi-agent execution contract. Single source of truth: the WI file at `work-items/WI-<NNN>.md` referenced by the user prompt or inferred from the current branch name.

## Agents

| Agent  | Role |
|--------|------|
| Claude | Architecture, structure, code, tests, docs, ops (commit / merge / push / release / cleanup) |
| Codex  | Review of plan and code, challenge of UX choices, anti-regression scrutiny |
| Arnaud | Product cadrage, UI validation in Live Server |

## Phases

| Order | Phase            | Owner          | Output                                                                    |
|-------|------------------|----------------|---------------------------------------------------------------------------|
| 1     | CADRAGE          | Arnaud+Claude  | Decisions filled in WI section CADRAGE                                    |
| 2     | PRD              | Claude         | WI section PRD (objective, architecture, out of scope, tests planned)     |
| 3     | PLAN_REVIEW      | Codex          | WI section PLAN_REVIEW (verdict, blockers, refinements)                   |
| 4     | IMPLEMENTATION   | Claude         | Code edits + WI section IMPLEMENTATION (files touched, key changes)       |
| 5     | TESTS            | Claude         | Test files + green run + WI section TESTS (suite path, count, run result) |
| 6     | CODE_REVIEW      | Codex          | WI section CODE_REVIEW (verdict, blockers, refinements)                   |
| 7     | VALIDATION_UI    | Arnaud         | WI section VALIDATION_UI (cases tested, OK / NOT OK)                      |
| 8     | MERGE_RELEASE    | Claude         | Bump + commits + merge main + push + gh release + WI section MERGE_RELEASE|
| 9     | PATCH_NOTES      | Claude         | WI section PATCH_NOTES (FR changelog, used as release body)               |
| 10    | DOCS             | Claude         | Refresh CLAUDE/README/MANUEL/SMOKE-TEST if relevant + WI section DOCS     |
| 11    | CLEANUP          | Claude         | git branch -d + WI section CLEANUP                                        |
| 12    | DONE             | —              | Final status                                                              |

## Transitions

```
CADRAGE        → PRD
PRD            → PLAN_REVIEW
PLAN_REVIEW    → IMPLEMENTATION   (verdict: validated)
PLAN_REVIEW    → PRD              (verdict: re-cadrage)
IMPLEMENTATION → TESTS
TESTS          → CODE_REVIEW      (run: green)
TESTS          → IMPLEMENTATION   (run: red)
CODE_REVIEW    → VALIDATION_UI    (verdict: validated)
CODE_REVIEW    → IMPLEMENTATION   (verdict: blockers)
VALIDATION_UI  → MERGE_RELEASE    (verdict: OK)
VALIDATION_UI  → IMPLEMENTATION   (verdict: NOT OK)
MERGE_RELEASE  → PATCH_NOTES
PATCH_NOTES    → DOCS
DOCS           → CLEANUP
CLEANUP        → DONE
```

## WI file header

```
Status: <PHASE>
Owner: <Claude | Codex | Arnaud>
Branch: <branch-name>
Target version: vX.Y.Z
```

`Status` and `Owner` are the only mutable fields once the WI is created. They are updated on every phase execution.

## Output contract

Every phase execution outputs, in order, exactly:

```
PHASE_EXECUTED: <PHASE>
STATUS_UPDATED_TO: <NEXT_PHASE>
QUALITY_CHECK: PASS | FAIL
BLOCKERS: <list or "none">
NEXT_PHASE: <PHASE>
NEXT_PHASE_OWNER: <Claude | Codex | Arnaud>
```

Then ONLY the section content written to the WI for the executed phase.

No prose. No conversation. No closing line.

## Absolute rules

- Read the WI file before any action
- Verify ownership of next phase via the table — if not owner, emit `BLOCKERS: not my turn (current phase: X, owner: Y)` and stop
- Execute only one phase per invocation
- Never skip, merge, anticipate, or revisit completed phase sections
- Never invent missing context — emit `BLOCKERS` and stop
- Never code outside `IMPLEMENTATION`
- Never speak outside the output contract
- All file edits are made directly; no code dumped in chat
