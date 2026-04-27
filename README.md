# Atelier — Backlog & Sprints

Application web mono-utilisateur de gestion de backlog et de sprints, pensée pour un consultant qui jongle entre plusieurs clients.

Pas de backend, pas d'inscription, pas de tracking. L'app tient dans un seul fichier HTML et tourne entièrement dans le navigateur. Les données peuvent rester en local (IndexedDB) ou se synchroniser entre machines via un Gist GitHub privé que vous contrôlez.

## Aperçu des fonctionnalités

- Multi-clients (un workspace par client)
- Items typés (Build / TMA / Bug) et priorisés (P1 / P2 / P3)
- Vues Backlog, Kanban (drag & drop) et Archive
- Sprints : création, activation, clôture (les items non terminés retournent au backlog)
- Recherche plein-texte et filtres (type, priorité)
- Persistance offline (IndexedDB)
- Synchronisation multi-machines optionnelle via Gist GitHub privé
- Export / import JSON manuel (sauvegarde de secours)
- Raccourcis : `Ctrl+C` pour créer un item, `Échap` pour fermer un modal

## Stack

- HTML / CSS / JavaScript vanilla, ~2500 lignes dans un seul `index.html`
- Aucune dépendance runtime (juste la police Inter via CDN)
- IndexedDB pour le cache local, fallback `localStorage`
- API REST GitHub pour la synchronisation Gist (optionnelle)
- Playwright pour les tests end-to-end (29 specs)

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
npm test                   # 29 tests, ~30s
npm run test:headed        # voir le navigateur pendant les tests
npm run test:ui            # mode interactif avec replay
```

Les specs vivent dans [`tests/`](tests/), un fichier par feature.

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
