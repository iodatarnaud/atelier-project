# Atelier — Backlog & Sprints

Application web mono-utilisateur de gestion de backlog et de sprints, pensée pour un consultant qui jongle entre plusieurs clients.

Pas de backend, pas d'inscription, pas de tracking. L'app tient dans un seul fichier HTML et tourne entièrement dans le navigateur. Les données peuvent rester en local (IndexedDB) ou se synchroniser entre machines via un Gist GitHub privé que vous contrôlez.

## Aperçu des fonctionnalités

- Multi-clients (un workspace par client) avec stats par projet
- Items typés (Build / TMA / Bug), priorisés (P1 / P2 / P3), avec estimations en jours, dates d'échéance et description rich text
- **Activité par item** : commentaires datés (édition / suppression avec trace) + timeline historique des changes (statut, sprint, priorité, etc.) trackés automatiquement
- Epics colorés (CRUD, filtrage, assignement)
- Vues **Backlog**, **Sprint actif** (kanban), **Archive** et **Calendrier** (mensuel multi-projets avec section "En retard", filtres projet/type/prio/epic, et drag & drop pour replanifier la `dueDate` en 1 geste)
- Sprints avec lifecycle (future → actif → terminé), suppression sécurisée
- Drag & drop : items entre sprints, depuis la sidebar, et réordonnement manuel
- Filtres (type, priorité, epic), recherche plein-texte, groupement par sprint ou par epic
- Persistance offline (IndexedDB, fallback `localStorage`)
- Synchronisation multi-machines optionnelle via Gist GitHub privé
- Export / import JSON manuel (sauvegarde de secours)
- **Mode test** : bac à sable isolé avec jeu de données démo, aucune écriture vers tes vraies données
- Dark theme automatique selon le mode OS
- Sidebar redimensionnable, raccourcis clavier (`Ctrl+C` quick add, `Ctrl+Entrée` valider partout, `Échap` fermer un modal)

## Stack

- HTML / CSS / JavaScript vanilla, ~3760 lignes dans un seul `index.html`
- Aucune dépendance runtime (juste la police Inter via CDN)
- IndexedDB pour le cache local, fallback `localStorage`
- API REST GitHub pour la synchronisation Gist (optionnelle)
- Playwright pour les tests end-to-end (118 tests répartis sur 11 fichiers, dont sécurité XSS, activité, calendrier et raccourcis)

## Lancer en local

L'app étant un fichier HTML statique, n'importe quel serveur HTTP local fait l'affaire :

```bash
npm install        # installe les devDeps (Playwright, http-server)
npm run serve      # http-server sur http://localhost:5500/
```

Alternative : extension VS Code **Live Server** (recommandée via `.vscode/extensions.json`), clic droit sur `index.html` → *Open with Live Server*.

## Tests

Suite end-to-end Playwright qui valide les fonctionnalités principales avant chaque modification de l'app.

```bash
npm install
npx playwright install     # installe Chromium headless (une seule fois)
npm test                   # 118 tests, ~2min
npm run test:headed        # voir le navigateur pendant les tests
npm run test:ui            # mode interactif avec replay
```

Les specs vivent dans [`tests/`](tests/), un fichier par feature : `clients`, `backlog`, `board`, `sprints`, `persistance`, `raccourcis`, `test-mode`, `security`, `activite`, `calendrier`, `calendrier-dnd`.

## Documentation

- [`MANUEL.md`](MANUEL.md) — manuel utilisateur (concepts, vues, sync, mode test)
- [`SMOKE-TEST.md`](SMOKE-TEST.md) — plan de validation manuel pour vérifier tout le périmètre avant un déploiement
- [`CLAUDE.md`](CLAUDE.md) — détails techniques (architecture, persistance, conventions)
- [`AI.md`](AI.md) + [`ai-system/`](ai-system/) — protocole d'orchestration multi-agents (Claude / Codex / Arnaud), v2.1
- [`work-items/`](work-items/) — Work Items (WI) : un fichier par chantier, source unique de vérité d'une feature

## Workflow de développement (multi-agents)

Toute évolution non triviale passe par un **Work Item** (WI) suivant le `AI Orchestration Protocol v2.1` documenté dans [`ai-system/00_AI_SYSTEM.md`](ai-system/00_AI_SYSTEM.md). Trois acteurs collaborent :

- **Arnaud** (humain) : cadre la demande (`CADRAGE`), valide en pré-merge (`VALIDATION_UI`).
- **Claude** : code (`IMPLEMENTATION`), tests (`TESTS`), release notes (`PATCH_NOTES`), merge (`MERGE_RELEASE`), docs (`DOCS`).
- **Codex** : review du PRD (`PLAN_REVIEW`), review du code (`CODE_REVIEW`), rétrospective (`RETROSPECTIVE`).

Pipeline canonique (mode STANDARD, 13 phases) :

```
CADRAGE → PRD → PLAN_REVIEW → IMPLEMENTATION → TESTS → CODE_REVIEW →
VALIDATION_UI → PATCH_NOTES → MERGE_RELEASE → DOCS → CLEANUP →
RETROSPECTIVE → DONE
```

Mode `FAST_TRACK` disponible pour les changements à risque LOW (< 50 lignes, pas de schéma, pas d'API publique) : skippe `PRD` / `PLAN_REVIEW` / `CODE_REVIEW` / `RETROSPECTIVE`. Détails dans [`ai-system/SYSTEM_USAGE.md`](ai-system/SYSTEM_USAGE.md).

Pour démarrer un WI : `cp ai-system/WI_TEMPLATE.md work-items/WI-<NNN>.md`, remplir le `CADRAGE`, dire `next` à l'agent dont le `Owner:` du WI fait foi.

## Auto-hébergement (fork)

Pour faire tourner sa propre instance gratuitement :

1. **Fork** ce repo sur son compte GitHub.
2. Repo cible **public** (GitHub Pages gratuit nécessite un repo public — un compte GitHub Pro permet aussi les repos privés, ~4 $/mois).
3. **Settings → Pages → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**.
4. Patienter 1–2 min : l'URL apparaît en haut de la page Settings → Pages, sous la forme `https://<utilisateur>.github.io/atelier-project/`.
5. (Optionnel) Configurer la sync Gist pour partager ses données entre plusieurs machines — voir ci-dessous.

### Synchroniser entre plusieurs machines (optionnel)

Sans cette étape, les données restent dans l'IndexedDB du navigateur local — l'app fonctionne très bien comme ça sur une seule machine.

1. Créer un Gist **privé** sur [gist.github.com](https://gist.github.com) avec un fichier `atelier-data.json` contenant `{}`. Récupérer l'ID dans l'URL du Gist.
2. Créer un **Personal Access Token** sur [github.com/settings/tokens?type=beta](https://github.com/settings/tokens?type=beta) :
   - Type **Fine-grained**
   - Permission **Account → Gists: Read and write**
   - Aucune autre permission n'est nécessaire
3. Ouvrir l'app, cliquer sur l'indicateur **Local** en haut à droite, coller le PAT et l'ID du Gist, **Connecter**.

### Mode test (bac à sable)

Pour expérimenter sans risque (montrer l'app à quelqu'un, tester un workflow, jouer avec un jeu de données plus riche que ses vrais clients) :

1. Cliquer sur l'indicateur de sync (Local / GitHub) → modale Paramètres
2. Section **🧪 Mode test** → **Activer le mode test**
3. La page recharge avec un banner jaune permanent et un seed de 4 projets démo / 25+ items.
4. Tout ce qu'on fait en mode test est **volatile** : aucune écriture en local ni vers le Gist, refresh = retour au seed propre.
5. Pour sortir : bouton **Sortir du mode test** dans le banner ou la modale.

Triple garde-fou côté code : `loadState()` saute IndexedDB et Gist, `saveState()` est no-op, `scheduleGistPush()` retourne tôt. Impossible d'écraser les vraies données par accident.

## Sécurité et confidentialité

L'app est conçue pour fonctionner sans serveur tiers. Quelques choix conscients à connaître :

- **Aucun backend, aucune télémétrie, aucun tracking.** Le seul appel réseau possible est vers `https://api.github.com` (et uniquement si la sync Gist est activée).
- **Le PAT GitHub est stocké en clair dans le `localStorage`** du navigateur. C'est un compromis assumé pour un usage perso sur des machines de confiance. À ne configurer que sur ses propres machines.
- **En cas de perte d'un appareil**, révoquer le token sur [github.com/settings/tokens](https://github.com/settings/tokens) — les autres appareils gardent leur copie locale du PAT.
- **Le PAT a un scope strictement minimal** (Gists Read/Write). Il ne donne accès ni au code, ni aux repos, ni à l'identité GitHub.
- **Les données vivent dans un Gist privé** dont le propriétaire est seul à avoir l'accès en lecture.

## Limitations connues

- Mono-utilisateur : pas de partage ni de collaboration.
- Politique de conflit *last-write-wins* basée sur un timestamp local — éviter d'éditer simultanément depuis deux machines.
- Le PAT doit être reconfiguré sur chaque navigateur (par sécurité, pas synchronisé).
- Limite de l'API GitHub : 5 000 requêtes/heure par PAT — largement au-dessus de tout usage réaliste.

## Architecture

Voir [`CLAUDE.md`](CLAUDE.md) pour le détail des couches de stockage, du flow de synchronisation et des conventions.

En résumé : `index.html` contient le HTML, le CSS (dans `<style>`) et le JS (dans `<script>`), navigables via les commentaires `=== NOM ===`. Trois couches de persistance : mémoire → IndexedDB → Gist (last-write-wins).

## Licence

MIT.
