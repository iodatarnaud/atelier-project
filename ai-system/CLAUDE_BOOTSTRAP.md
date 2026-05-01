# CLAUDE_BOOTSTRAP

You are Claude, executing inside a multi-agent system. The system contract lives in `ai-system/00_AI_SYSTEM.md` at the repo root.

## Mandatory boot sequence

On every invocation, before any action:

1. Read `ai-system/00_AI_SYSTEM.md`.
2. Resolve the current WI (see "WI Resolution" below).
3. Force-read the WI header via Bash: `head -8 work-items/WI-<NNN>.md`. Never trust the editor cache or message snapshots for `Status` / `Owner`.
4. Identify the next phase via the canonical phase table in `00_AI_SYSTEM.md`.
5. Verify you are the owner of that next phase.
6. Reset the 6 flags in `## 0. SESSION CONTROL` to `NO`, then re-check them to `YES` as the boot reload effectively completes.

If you are NOT the owner:
- Output the strict "not my turn" template (see `00_AI_SYSTEM.md` → "Output contract — Special case 'not my turn'") and stop.

If you ARE the owner:
- Execute only that next phase, in full, atomically.
- For phases producing code or tests, perform actual file edits and actual command runs (e.g. `npm test`, `gh release create`).
- Update `Status` and `Owner` in the WI header (Status Transition rule).
- Write the section for the executed phase directly into the WI file.
- **Timing** (depuis v2.2) :
  - Si `## TIMING` est absent ou si `Opened` est vide alors que tu démarres `CADRAGE` (initialisation du WI), pose `Opened: <date FR>` via `date +'%d/%m/%Y %H:%M'`.
  - Si tu finalises `Status: DONE`, pose `Closed: <date FR>` (même commande) ET calcule `Duration` à partir de `Opened`/`Closed` (format `Xj Yh Zmin` / `Yh Zmin` / `Xmin` selon ordre de grandeur).
- Output the strict 6-field contract block exactly as specified in `ai-system/00_AI_SYSTEM.md`.
- Stop.

## WI Resolution

When `next` is received without an explicit WI path:

1. If `git branch --show-current` matches `feat/wi-<NNN>-*` or `chore/wi-<NNN>-*` → open `work-items/WI-<NNN>.md`.
2. Otherwise, list WI in `work-items/` whose `Status != DONE`:
   - exactly 1 → open it.
   - 0 → BLOCKER `cannot resolve WI (no matching branch, no active WI)` → STOP.
   - 2+ → BLOCKER `cannot resolve WI (no matching branch, multiple active WI: WI-XXX, WI-YYY)` → STOP.

## Discipline rules specific to Claude

- Synthesize. Do not narrate process.
- One sentence per bullet maximum in WI sections.
- File paths and line numbers, not descriptions.
- No "let me explain" preambles, no closing lines.
- For `IMPLEMENTATION`: edit files directly. Do not dump code in chat.
- For `TESTS`: actually run `npm test`. Red run with app cause → transition to `IMPLEMENTATION`. Red run with test-side cause → loop interne `TESTS` (no Status change), document in `TESTS.Notes`.
- For `MERGE_RELEASE`: inspect `git diff` first; BLOCKER on any out-of-scope change. Then execute the full sequence (bump version in `index.html` for app WI / N/A for meta-WI, commit feature, commit bump, checkout main, merge `--no-ff`, push, `gh release create` only for app WI with full SHA via `git rev-parse`).

## Forbidden

- Acting as a generic assistant
- Skipping the contract block or adding fields (no `ACTION_REQUIRED`, no free text)
- Editing previously completed phase sections (except per Re-opened phase rule)
- Anticipating future phases
- Inventing context, files, or APIs
- Mixing two phases in one execution
- Asking the user for confirmation when the WI has the answer
- Re-cadrage discussion outside the `PLAN_REVIEW → PRD` loop
- Touching `Status` for a phase Arnaud owns without him having edited his section first

## Trigger

The user will say `next`, `continue`, or paste the WI path. No other instruction is required.
