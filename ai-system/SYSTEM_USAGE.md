# SYSTEM USAGE

## Start a WI

1. `cp ai-system/WI_TEMPLATE.md work-items/WI-<NNN>.md` (numérotation séquentielle, indépendante du backlog ATE-X qui reste mentionné dans le titre). Voir `ai-system/00_AI_SYSTEM.md` pour le contrat complet.
2. Fill the title line, the `Branch:` and `Target version:` fields.
3. Choose `Mode: STANDARD | FAST_TRACK` and `Risk: LOW | MEDIUM | HIGH`.
4. Fill the `CADRAGE` section with goal + open questions.
5. Set the initial Status / Owner per chosen mode :
   - `Mode: STANDARD` → `Status: PRD`, `Owner: Claude` (la phase suivante après CADRAGE est PRD).
   - `Mode: FAST_TRACK` → `Status: IMPLEMENTATION`, `Owner: Claude` (PRD / PLAN_REVIEW skippés, on entre directement en IMPL).

## Advance a phase

Tell the active agent (per `Owner:` in the WI):

```
next
```

The agent reads the WI, executes one phase, updates the header (`Status` + `Owner`), writes its section, outputs the contract block, stops.

## À qui dire `next` ?

| Owner courant | Action utilisateur |
|---|---|
| `Claude` | Dire `next` dans cette session Claude Code |
| `Codex` | Coller le WI (path ou contenu) à Codex avec `next` |
| `Arnaud` | Smoke-test en Live Server, éditer la section dont Arnaud est owner (`CADRAGE.Decisions` ou `VALIDATION_UI`) avec verdict + cases, puis dire `next` à Claude |

Si Arnaud dit `next` sans avoir édité sa section → Claude bloque avec un BLOCKER explicite (`<section> empty (Arnaud channel)`). Voir `00_AI_SYSTEM.md` → "Status Transition rule — Special case Arnaud".

## Modes

### STANDARD

Pipeline complet, 13 phases. `RETROSPECTIVE` obligatoire avant `DONE`.

À utiliser pour : feature avec impact UX, modif schéma, refactor transverse, méta-WI sur le protocole.

Chaîne : `CADRAGE → PRD → PLAN_REVIEW → IMPLEMENTATION → TESTS → CODE_REVIEW → VALIDATION_UI → PATCH_NOTES → MERGE_RELEASE → DOCS → CLEANUP → RETROSPECTIVE → DONE`.

### FAST_TRACK

Pipeline réduit. Éligibilité (toutes obligatoires) :

- `Risk: LOW`
- scope < 50 lignes
- pas de modif schéma de données
- pas d'API publique modifiée

Phases SKIPPÉES en FAST_TRACK : `PRD`, `PLAN_REVIEW`, `CODE_REVIEW`, `RETROSPECTIVE`.
Phases JAMAIS skippables (n'importe quel mode) : `TESTS`, `MERGE_RELEASE`, `CLEANUP`.

Chaîne : `CADRAGE → IMPLEMENTATION → TESTS → VALIDATION_UI → PATCH_NOTES → MERGE_RELEASE → DOCS → CLEANUP → DONE`.

Si en cours d'`IMPLEMENTATION` on découvre que le scope dépasse l'éligibilité (schema, API, > 50 lignes) :

- STOP, BLOCKER explicite.
- `Status` retombe en `PRD`, `Mode` passe à `STANDARD`.
- `PRD` / `PLAN_REVIEW` / `CODE_REVIEW` / `RETROSPECTIVE` redeviennent obligatoires.

## Loops

- `PLAN_REVIEW` verdict `re-cadrage` → Status loops to `PRD` (Claude).
- `TESTS` red **cause app** (bug d'impl, AC non couvert, edge case raté) → Status loops to `IMPLEMENTATION` (Claude).
- `TESTS` red **cause test-side** (sélecteur fragile, helper instable, race test) → loop interne `TESTS` (Claude), pas de transition Status, document dans `TESTS.Notes`.
- `CODE_REVIEW` blockers → Status loops to `IMPLEMENTATION` (Claude).
- `VALIDATION_UI` `NOT OK` → Status loops to `IMPLEMENTATION` (Claude).
- `RETROSPECTIVE` defects → loop to `IMPLEMENTATION` (défaut protocole) ou `PRD` (défaut cadrage), selon nature.

Une phase ré-ouverte par boucle peut intégralement réécrire SA section. Première ligne obligatoire : `Révision après <retour boucle source>`.

## Modifs hors-périmètre

Pendant l'exécution d'un WI, AUCUN acteur ne touche aux fichiers hors scope. Tout ajustement à `ai-system/`, `docs/`, autre WI, ou source non liée passe par un méta-WI dédié. Pendant `MERGE_RELEASE`, Claude vérifie `git diff` et bloque si une modif hors-périmètre est détectée.

## Méta-WI sans release GH

Si `Target version:` indique `système v...` (ou autre marquage explicite "pas de release"), `MERGE_RELEASE` se contente de : commit feature → checkout main → merge `--no-ff` → push. Pas de `gh release create`, pas de bump version. La section `MERGE_RELEASE` note `Version bumped: N/A (meta-WI)` et `Release URL: N/A`.

## End

`Status: DONE` (`Owner: —`) → branche supprimée, release publiée (sauf méta-WI), WI archivable.
