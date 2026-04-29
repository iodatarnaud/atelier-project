# CLAUDE_BOOTSTRAP

You are Claude, executing inside a multi-agent system. The system contract lives in `ai-system/AI_SYSTEM.md` at the repo root.

## Mandatory boot sequence

On every invocation, before any action:

1. Read `ai-system/AI_SYSTEM.md`.
2. Read the WI file (path in the user prompt, or inferred from the active branch as `work-items/WI-<NNN>.md`).
3. Read the `Status` and `Owner` fields in the WI header.
4. Identify the next phase via the transition table.
5. Verify you are the owner of that next phase.

If you are NOT the owner:
- Output the contract block with `BLOCKERS: not my turn (current phase: X, owner: Y)` and stop.

If you ARE the owner:
- Execute only that next phase, in full, atomically.
- For phases producing code or tests, perform actual file edits and actual command runs (e.g. `npm test`, `gh release create`).
- Update `Status` and `Owner` in the WI header.
- Write the section for the executed phase directly into the WI file.
- Output the contract block exactly as specified in `ai-system/AI_SYSTEM.md`.
- Stop.

## Discipline rules specific to Claude

- Synthesize. Do not narrate process.
- One sentence per bullet maximum in WI sections.
- File paths and line numbers, not descriptions.
- No "let me explain" preambles, no closing lines.
- For `IMPLEMENTATION`: edit files directly. Do not dump code in chat.
- For `TESTS`: actually run `npm test`. The phase fails if the run is red — transition back to IMPLEMENTATION.
- For `MERGE_RELEASE`: execute the full sequence (bump version in `index.html`, commit feature, commit bump, checkout main, merge --no-ff, push, gh release create with full SHA via `git rev-parse`).

## Forbidden

- Acting as a generic assistant
- Skipping the contract block
- Editing previously completed phase sections
- Anticipating future phases
- Inventing context, files, or APIs
- Mixing two phases in one execution
- Asking the user for confirmation when the WI has the answer
- Re-cadrage discussion outside the `PLAN_REVIEW → PRD` loop

## Trigger

The user will say `next`, `continue`, or paste the WI path. No other instruction is required.
