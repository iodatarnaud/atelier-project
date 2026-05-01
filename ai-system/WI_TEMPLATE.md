# WI — <Title> (ATE-<N>)

Status: CADRAGE
Owner: Arnaud
Branch: feat/ate-<N>-<slug>
Target version: vX.Y.Z
Mode: STANDARD | FAST_TRACK
Risk: LOW | MEDIUM | HIGH

---

## TIMING

Opened: JJ/MM/AAAA HH:MM
Closed:
Duration:

<!--
Conventions :
- `Opened` : posé par Claude au boot CADRAGE via `date +'%d/%m/%Y %H:%M'` (timezone système, attendue Europe/Paris).
- `Closed` : posé par Claude au passage `Status: DONE` via la même commande.
- `Duration` : calculée à la fermeture, format `Xj Yh Zmin` ou `Yh Zmin` selon ordre de grandeur.
-->

---

## 0. SESSION CONTROL

Repo source of truth confirmed: NO
System file reloaded: NO
WI reloaded: NO
Relevant files inspected: NO
Git diff inspected: NO
Session assumptions ignored: NO

---

## CADRAGE

Goal:
Persona impact:
Context:
Constraints:
Out of scope:
Open questions:
Decisions:

---

## MODE DECISION

Chosen mode: <STANDARD | FAST_TRACK | META_FAST>

Justification:
- ...

If STANDARD:
- chaîne complète : `CADRAGE → PRD → PLAN_REVIEW → IMPLEMENTATION → TESTS → CODE_REVIEW → VALIDATION_UI → PATCH_NOTES → MERGE_RELEASE → DOCS → CLEANUP → RETROSPECTIVE → DONE`
- `RETROSPECTIVE` obligatoire avant `DONE`.

If FAST_TRACK:
- éligibilité (toutes obligatoires) : `Risk: LOW`, scope < 50 lignes, pas de modif schéma de données, pas d'API publique modifiée.
- chaîne : `CADRAGE → IMPLEMENTATION → TESTS → VALIDATION_UI → PATCH_NOTES → MERGE_RELEASE → DOCS → CLEANUP → DONE`.
- skippées : `PRD`, `PLAN_REVIEW`, `CODE_REVIEW`, `RETROSPECTIVE`.
- jamais skippables (FAST_TRACK ou STANDARD) : `TESTS`, `MERGE_RELEASE`, `CLEANUP`.
- escalade : si pendant `IMPLEMENTATION` le scope dépasse l'éligibilité → STOP, BLOCKER, `Status` retombe en `PRD`, `Mode` passe à `STANDARD`.

If META_FAST:
- éligibilité (toutes obligatoires) : `Risk: LOW`, modifs strictement dans `ai-system/` + WI courant uniquement, pas de bump version, scope diff `ai-system/` < 30 lignes (hors bookkeeping WI courant).
- chaîne : `CADRAGE → IMPLEMENTATION → MERGE_RELEASE → CLEANUP → DONE`.
- skippées : `PRD`, `PLAN_REVIEW`, `TESTS`, `CODE_REVIEW`, `VALIDATION_UI`, `PATCH_NOTES`, `DOCS`, `RETROSPECTIVE`.
- jamais skippables (META_FAST) : `MERGE_RELEASE`, `CLEANUP`.
- substitut TESTS : sous-section obligatoire `IMPLEMENTATION.Verifications:` listant les commandes `grep` exactes et leur résultat (`PASS`/`FAIL`) sur les fichiers `ai-system/` touchés.
- contrat 6 champs inchangé. À `CLEANUP → DONE` : `NEXT_PHASE: none`, `NEXT_PHASE_OWNER: —`.
- objectif retex : `Duration ≤ 8min` (cf. `## TIMING (mandatory)`). Pas un BLOCKER, juste une métrique de succès.
- escalade : si pendant `IMPLEMENTATION` un fichier hors `ai-system/` ou le WI courant doit être touché OU diff > 30 lignes → STOP, BLOCKER, ré-évaluation du Mode (FAST_TRACK ou STANDARD selon ampleur). Voir `00_AI_SYSTEM.md → ### META_FAST`.

---

## PRD

Objective:
Current behavior:
Target behavior:

User stories:

Acceptance criteria:

### AC1
Given  
When  
Then  

### AC2
Given  
When  
Then  

Out of scope:
Assumptions:
Risks:

---

## PLAN_REVIEW

Verdict: <validated | re-cadrage>

Blockers (UX):
Blockers (technical):

Ambiguities:
Missing cases:

Refinements:
Test gaps:

---

## IMPLEMENTATION

Files touched:
- path/to/file

Key changes:
- one line per change

Excluded paths:

Diff summary:
- high-level only

---

## TESTS

Suite added:
New tests count:

Run command:
Run result: <PASS | FAIL>

Edge cases covered:
- list

Missing tests:

Notes:
<!-- Document toute boucle interne TESTS (cause test-side : sélecteur fragile, helper instable, race side-test). Si vide = aucun fix test-side. Voir 00_AI_SYSTEM.md → "TESTS red routing". -->
- ...

---

## CODE_REVIEW

Verdict: <validated | blockers>

P0 blockers:
P1 issues:
P2 improvements:

Spec deviations:
Test gaps:

Security concerns:
Performance concerns:

---

## VALIDATION_UI

Tested by: Arnaud

Environment:
Cases covered:

Verdict: <OK | NOT OK>

Issues:
- one line per issue

---

## PATCH_NOTES

<!-- FR markdown body for GitHub Release -->

---

## MERGE_RELEASE

Version bumped: vX.Y.Z

Feature commit SHA:
Version commit SHA:
Merge SHA on main:

Push: <ok | fail>

Release URL:

---

## DOCS

Files refreshed:
- path

Justification:

---

## CLEANUP

Branch deleted: <yes | no>

## RETROSPECTIVE (STANDARD ONLY)

Execution issues:
- ...

Process weaknesses:
- ...

Agent mistakes:
- ...

Missed edge cases:
- ...

Improvements proposed:
- ...

System updates needed:
- ...

Verdict:
<OK | NEEDS IMPROVEMENT>