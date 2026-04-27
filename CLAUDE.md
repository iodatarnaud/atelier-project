# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projet

Atelier — SPA mono-utilisateur de gestion de backlog/sprints pour un consultant Salesforce gérant plusieurs clients. UI en français. Pas de backend, pas d'étape de build, pas de gestionnaire de paquets. Hébergé sur GitHub Pages, données persistées dans un Gist GitHub privé.

`atelier-project.zip` est une copie packagée de l'app pour distribution/handoff ; la source vivante est `index.html`.

## Commandes

Pas de toolchain de build, lint ou test. Le développement se résume à :

- **Lancer en local** : ouvrir `index.html` avec l'extension VS Code **Live Server** (Ritwick Dey) — recommandée via `.vscode/extensions.json`. Port 5500 par défaut.
- **Déployer** : commit + push sur `main`. GitHub Pages redéploie automatiquement (1–2 min).

## Architecture

L'app entière est un **`index.html` unique et autonome** (~2520 lignes) : body HTML, `<style>` embarqué, et `<script>` embarqué. Aucune dépendance JS/CSS externe hormis la police web Inter. Les sections sont délimitées par des commentaires `=== NOM ===` — grep sur ce motif pour naviguer.

### Stockage / sync — la partie critique

Trois couches, de la plus rapide à la plus autoritaire :

1. **En mémoire** : objet `state` (`{ clients, activeClientId, activeView, filterType, filterPrio, search }`). Forme de `clients[i]` : `{ id, name, key, counter, items[], sprints[] }`.
2. **IndexedDB** (`atelier-db` / store `kv` / clé `atelier-data-v2`) — écrite à chaque modification via `saveState()` (debounce 50 ms). Fallback `localStorage` si IndexedDB indisponible.
3. **Gist GitHub** (fichier unique `atelier-data.json`) — push via `scheduleGistPush()` (debounce 2,5 s après l'écriture IndexedDB) en utilisant un PAT stocké dans `localStorage` (`atelier-config-v1`). Un handler `beforeunload` fait un PATCH `keepalive: true` si un push est en attente.

**Politique de conflit : last-write-wins sur `lastSavedAt`** (epoch ms). Au `loadState()`, si le timestamp distant du Gist est plus récent que celui de l'IndexedDB locale, le distant gagne et écrase le local. Le README prévient l'utilisateur de ne pas éditer en parallèle sur deux machines. Le flow `connectGist()` est le seul endroit qui remonte un conflit explicite à l'utilisateur (quand les compteurs d'items divergent à la première connexion).

Quand on touche à la forme des données ou à la persistance, préserver la compatibilité avec les Gists existants — les utilisateurs ont des données vivantes dans le Gist que ce code relit.

### Rendu

Re-render single-pass. `render()` appelle `renderSidebar()` + `renderStats()` + `renderBreadcrumb()` + `renderView()`. `renderView()` dispatche vers `renderBacklog` / `renderBoard` / `renderArchive` selon `state.activeView`. Pas de virtual DOM, pas de framework — `innerHTML` est réécrit et les handlers sont rebranchés à chaque render (le câblage drag-and-drop vit dans `attachDragDrop()`, appelé en fin de render board).

Les mutations suivent ce schéma : le handler met à jour `state.clients[...].items[...]` → `await saveState()` → `render()`. Ne pas sauter `saveState()` sinon la modif ne survit pas au reload.

### UI Settings/sync

`openSettingsModal()` / `connectGist()` / `disconnectGist()` gèrent le PAT + l'ID Gist. Le PAT est stocké en clair dans `localStorage` — c'est intentionnel (app mono-utilisateur, machines de confiance) et documenté dans le README. Ne pas ajouter de feature qui envoie le PAT ailleurs que sur `api.github.com`.

## Conventions

- **Langue** : strings UI, commentaires et messages de commit sont en français. À respecter en éditant.
- **Échappement HTML** : `escapeHtml()` est le seul chemin sûr pour injecter une string contrôlée par l'utilisateur dans `innerHTML`. Toujours l'utiliser.
- **IDs** : les IDs clients sont `c<timestamp>` ; les IDs d'items sont générés par client avec le préfixe `key` et le `counter` qui s'incrémente.
- **Pas de nouveaux fichiers sauf nécessité** : la structure single-file est délibérée (mises à jour drop-in : remplacer `index.html`, push, terminé — voir README "Mises à jour de l'app"). Ne pas découper en modules sans raison forte.
