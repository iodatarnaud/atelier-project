# SYSTEM USAGE

## Start a WI

1. `cp ai-system/WI_TEMPLATE.md work-items/WI-<NNN>.md` (numérotation séquentielle, indépendante du backlog ATE-X qui reste mentionné dans le titre). Voir `ai-system/00_AI_SYSTEM.md` pour le contrat complet.
2. Fill the title line, the `Branch:` and `Target version:` fields.
3. Fill the `CADRAGE` section with goal + open questions.
4. Set `Status: PRD`, `Owner: Claude`.

## Advance a phase

Tell the active agent (per `Owner:` in the WI):

```
next
```

The agent reads the WI, executes one phase, updates the header, writes the section, outputs the contract block, stops.

## Switch agents

When `Owner:` becomes `Codex` → paste `work-items/WI-<NNN>.md` content (or path) to Codex with `next`.
When `Owner:` becomes `Claude` → say `next` here.
When `Owner:` becomes `Arnaud` → smoke-test in Live Server, fill `VALIDATION_UI` with `OK` or `NOT OK`, then say `next` to Claude.

## Loops

`PLAN_REVIEW` verdict `re-cadrage` → Status loops to `PRD`.
`TESTS` red run → Status loops to `IMPLEMENTATION`.
`CODE_REVIEW` blockers → Status loops to `IMPLEMENTATION`.
`VALIDATION_UI` `NOT OK` → Status loops to `IMPLEMENTATION`.

## End

`Status: DONE` → branche supprimée, release publiée, WI archivable.
