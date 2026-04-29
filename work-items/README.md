# /work-items

Un fichier markdown par chantier (WI = Work Item), créé à partir de `ai-system/WI_TEMPLATE.md`.

Convention de nommage : `WI-<NNN>.md` avec numérotation séquentielle indépendante du backlog (l'ID `ATE-X` du backlog reste mentionné dans le titre du WI).

Le WI est la seule source de vérité pour un chantier. Les agents (Claude, Codex, Arnaud) y lisent le `Status` et exécutent une seule phase à la fois selon le contrat `ai-system/00_AI_SYSTEM.md`.
