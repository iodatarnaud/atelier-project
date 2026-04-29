# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projet

Atelier — SPA mono-utilisateur de gestion de backlog/sprints pour un consultant Salesforce gérant plusieurs clients. UI en français. Pas de backend ni d'étape de build pour l'app elle-même. Hébergé sur GitHub Pages, données persistées dans un Gist GitHub privé.

`atelier-project.zip` est une copie packagée de l'app pour distribution/handoff ; la source vivante est `index.html`.

## Commandes

Pas de toolchain de build/lint pour l'app : `index.html` reste autonome et drop-in. La seule toolchain présente est **Playwright** pour les tests E2E (devDeps uniquement, jamais embarqué dans la page).

- **Lancer en local** : ouvrir `index.html` avec l'extension VS Code **Live Server** (Ritwick Dey) — recommandée via `.vscode/extensions.json`. Port 5500 par défaut. Alternative : `npm run serve`.
- **Tester** : `npm test` (ou `npm run test:headed` pour voir le navigateur, `npm run test:ui` pour le mode interactif). Les tests servent l'app via `http-server` sur le port 5501 (séparé de Live Server).
- **Déployer** : merger une branche feature sur `main` puis push. GitHub Pages redéploie automatiquement (1–2 min). Le user travaille **toujours sur une branche feature**, jamais en commit direct sur main — même pour un bump de version (cf. `feedback_workflow`).

## Architecture

L'app entière est un **`index.html` unique et autonome** (~4500 lignes) : body HTML, `<style>` embarqué, et `<script>` embarqué. Aucune dépendance JS/CSS externe hormis la police web Inter. Les sections sont délimitées par des commentaires `=== NOM ===` — grep sur ce motif pour naviguer.

### Stockage / sync — la partie critique

Trois couches, de la plus rapide à la plus autoritaire :

1. **En mémoire** : objet `state` (`{ clients, activeClientId, activeView, filterType, filterPrio, filterEpic, groupBy, search }`). Forme de `clients[i]` : `{ id, name, key, color?, counter, items[], sprints[], epics[] }`. Forme de `items[i]` : `{ id, num, title, description, type, status, priority, estimate, dueDate, sprintId, epicId, completedAt?, activity[] }` (cf. section Activité ci-dessous pour `activity[]`).
2. **IndexedDB** (`atelier-db` / store `kv` / clé `atelier-data-v2`) — écrite à chaque modification via `saveState()` (debounce 50 ms). Fallback `localStorage` si IndexedDB indisponible.
3. **Gist GitHub** (fichier unique `atelier-data.json`) — push via `scheduleGistPush()` (debounce 2,5 s après l'écriture IndexedDB) en utilisant un PAT stocké dans `localStorage` (`atelier-config-v1`). Un handler `beforeunload` fait un PATCH `keepalive: true` si un push est en attente.

**Politique de conflit : last-write-wins sur `lastSavedAt`** (epoch ms). Au `loadState()`, si le timestamp distant du Gist est plus récent que celui de l'IndexedDB locale, le distant gagne et écrase le local. Le README prévient l'utilisateur de ne pas éditer en parallèle sur deux machines. Le flow `connectGist()` est le seul endroit qui remonte un conflit explicite à l'utilisateur (quand les compteurs d'items divergent à la première connexion).

Quand on touche à la forme des données ou à la persistance, préserver la compatibilité avec les Gists existants — les utilisateurs ont des données vivantes dans le Gist que ce code relit.

### Mode test

Bac à sable activable via la modale Paramètres. Flag `localStorage.getItem('atelier-mode-test') === '1'`, lu par le helper `isTestMode()`.

**Triple garde-fou** pour qu'aucun chemin d'écriture ne tourne en mode test :
- `loadState()` saute IndexedDB et le pull Gist, charge `buildDemoSeed()` directement en mémoire.
- `saveState()` est un no-op total (pas de `dbSet`, pas de `scheduleGistPush`).
- `scheduleGistPush()` et le `beforeunload` push retournent tôt.
- `connectGist()` refuse en mode test avec un toast.

`buildDemoSeed()` retourne 4 projets / 6 epics / 5 sprints / ~25 items mixés (tous statuts/types/prios). C'est un seed riche pour démo et expérimentation. Refresh = seed propre rechargé. Le banner jaune au top de la page (HTML `#testModeBanner` + CSS `.test-mode-banner`) reste affiché tant que le flag est actif.

### Rendu

Re-render single-pass. `render()` appelle `renderSidebar()` + `renderStats()` + `renderBreadcrumb()` + `renderView()`. `renderView()` dispatche vers `renderBacklog` / `renderBoard` / `renderArchive` selon `state.activeView`. Pas de virtual DOM, pas de framework — `innerHTML` est réécrit et les handlers sont rebranchés à chaque render (le câblage drag-and-drop vit dans `attachDragDrop()` / `attachBacklogDragDrop()` / `attachSidebarDropTargets()`, appelés en fin de render).

Les mutations suivent ce schéma : le handler met à jour `state.clients[...].items[...]` → `await saveState()` → `render()`. Ne pas sauter `saveState()` sinon la modif ne survit pas au reload.

`renderSidebar()` snapshot les compteurs avant écrasement de l'innerHTML pour pouvoir bumper les pastilles `.side-stat` dont la valeur a changé (animation `count-bump`). `updateActiveIndicator()` repositionne la barre verticale qui slide vers le projet actif (élément `#activeIndicator` à `position: absolute` dans la sidebar).

### Activité du WI (commentaires + historique des changes)

Chaque item porte un champ optionnel `activity[]` qui mélange deux types d'events :

- **Commentaires** : `{ id, type: 'comment', at, text, editedAt?, deletedAt? }`. Plain text + auto-link `http(s)://` via `renderCommentText()` (escape + `new URL()` strict + `rel="noopener noreferrer"`). Édition in-place (`editedAt`) ; suppression in-place (`deletedAt` + `text=''`) — l'event reste pour ne pas trouer la timeline.
- **Changes** : `{ id, type: 'change', at, field, before, after }`. Générés automatiquement à chaque modif d'un champ tracké de l'item.

**Whitelist `TRACKED_FIELDS`** : `title, type, status, priority, estimate, dueDate, sprintId, epicId`. Volontairement **sans `description`** (verbeux) ni `completedAt` (conséquence du passage à `done`, pas une action séparée).

**Wrapper centralisé `withItemChangeTracking(item, mutateFn)`** : tout chemin de mutation d'un item DOIT passer par ce wrapper, qui snapshot les champs trackés avant, exécute la mutation, puis diff et pousse 1 event change par champ modifié. 10 sites instrumentés : `saveItemEdit`, `cycleStatus`, drag&drop board / sidebar (sprint+epic) / backlog groupé, `doDelete` sprint/epic (boucle items), `completeSprint` (boucle items non-done). Si tu ajoutes un nouveau chemin de mutation, instrumente-le obligatoirement.

**Validator strict (rétrocompat Gist)** : `_normalizeActivityEvent()` rejette les events à id/type/timestamp invalide ; `_normalizeChangeFieldValue(field, v)` rejette `null` sur les champs non-nullables (`isNullableTrackedField()` → seuls `dueDate`, `sprintId`, `epicId` autorisent `null`). Limites : `MAX_ACTIVITY_EVENTS_PER_ITEM = 500`, `MAX_ACTIVITY_TEXT_LEN = 2000`. Au cap → toast + rejet silencieux (la mutation passe quand même, seul le tracking est skippé). Items sans champ `activity` (Gists pré-feature) : normalisés à `[]`, aucun crash.

**UI** : modale détail à 2 onglets (`renderItemDetailModal(itemId, activeTab)` + `switchItemDetailTab()`). L'onglet Activité est re-render localement via `refreshActivityPane(itemId, editingCommentId)` après chaque submit/edit/delete pour ne pas perdre l'état du formulaire Détails. Toggle CSS via classe `.tab-panel.active` (pas de re-render au switch).

### Raccourcis clavier (handler global)

Un seul handler `keydown` global gère `Ctrl+C` (quick add), `Échap` (ferme modale) et `Ctrl/Cmd+Entrée` (valide le bouton primary contextuel). Deux helpers partagés à connaître si tu ajoutes un raccourci :

- **`isEditableTarget(el)`** : retourne true pour `INPUT`/`TEXTAREA`/`SELECT`/`contenteditable`. Utilisé pour ne pas intercepter un raccourci natif quand l'utilisateur est en train d'éditer un champ (sinon `Ctrl+C` casse le copier natif, `Échap` perd la saisie en cours, etc.).
- **`findContextualPrimary(activeEl)`** : résout le bouton "actionnable" pour `Ctrl+Entrée` en remontant depuis `document.activeElement`. Ordre de priorité : édition commentaire > saisie commentaire > formulaire inline > modale ouverte (avec `.tab-panel.active` prioritaire pour ne pas cliquer un bouton caché par display:none de l'onglet inactif). **Exclut explicitement `#confirmModal`** pour qu'aucun raccourci ne puisse déclencher une suppression sans clic.

Garde-fous : `e.repeat` skippé sur `Ctrl+Enter` (anti double-submit si maintien), `!e.altKey && !e.shiftKey` sur `Ctrl+C` (évite AltGr / `Ctrl+Shift+C`). Le listener local sur `.if-title` (formulaire inline) ne traite que `Enter` simple — `Ctrl/Cmd+Enter` est laissé au handler global pour éviter le double-submit (event bubblé).

### Helpers d'affichage

- `escapeHtml(s)` — seul chemin sûr pour injecter une string contrôlée par l'utilisateur dans `innerHTML`. Toujours l'utiliser.
- `formatDays(d)` — affichage des jours sans zéros traînants ni arrondi forcé : `0 → "0"`, `0.25 → "0.25"`, `2 → "2"`, `2.2 → "2.2"`. Utilisé partout où on affiche un nombre de jours (sidebar stats, topbar, sprint header, board progress).
- `formatDue(due)` — date d'échéance avec mention `J-N` / `J+N` / "Aujourd'hui" et classe CSS (`overdue`, `soon`).
- Variables d'easing : `--ease`, `--ease-out`, `--ease-spring` exposées au `:root`. Les transitions standard durent 0.18–0.25s avec `var(--ease)`.

### UI Settings/sync

`openSettingsModal()` / `connectGist()` / `disconnectGist()` / `toggleTestMode()` gèrent le PAT, l'ID Gist et le flag mode test. Le PAT est stocké en clair dans `localStorage` — c'est intentionnel (app mono-utilisateur, machines de confiance) et documenté dans le README. Ne pas ajouter de feature qui envoie le PAT ailleurs que sur `api.github.com`.

## Conventions

- **Langue** : strings UI, commentaires et messages de commit sont en français. À respecter en éditant.
- **Échappement HTML** : `escapeHtml()` est le seul chemin sûr pour injecter une string contrôlée par l'utilisateur dans `innerHTML`. Toujours l'utiliser.
- **IDs** : les IDs clients sont `c<timestamp>` ; les IDs d'items sont préfixés `i<timestamp>` avec un `num` (compteur par client) qui s'incrémente. La clé visible dans l'UI est `${client.key}-${item.num}`.
- **Pas de nouveaux fichiers sauf nécessité** : la structure single-file est délibérée (mises à jour drop-in : remplacer `index.html`, push, terminé). Ne pas découper en modules sans raison forte. La toolchain Playwright vit à part dans `tests/` + `package.json` — l'app elle-même reste sans dépendance.
- **Workflow git** : toujours sur une branche feature, jamais en commit direct sur main. Pas de PR (le user est seul dev), merge direct vers main après validation par le user. Voir `feedback_workflow` dans la mémoire utilisateur.

## Tests

Suite E2E Playwright dans `tests/` (un fichier par feature : `clients`, `backlog`, `board`, `sprints`, `persistance`, `raccourcis`, `test-mode`, `security`, `activite`). Helpers partagés dans `tests/helpers.js`. Total : 84 tests, ~80s, CI bloquant avant déploiement Pages.

Spécificités à connaître quand on touche aux tests ou à `index.html` :
- **Seed démo (boot)** : 2 clients placeholder (`Acme`, `Globex`) sont créés au premier boot d'une DB vide. **Ne jamais y mettre de vrais noms de clients** — le repo est public. Pareil pour les `placeholder=` des inputs.
- **`window.__SKIP_SEED__`** : flag opt-in que les tests setent via `addInitScript` pour empêcher le seed (sinon les assertions de count seraient polluées). Préserver ce flag (ligne du seed dans `loadState()`) si tu touches au boot.
- **Mode test (flag séparé)** : `localStorage.getItem('atelier-mode-test')` — différent de `__SKIP_SEED__`. Les 4 tests du fichier `test-mode.spec.js` activent le flag via `addInitScript` puis vérifient banner + seed + volatilité.
- **Isolation IndexedDB** : Playwright ne l'isole pas correctement entre tests par défaut. `helpers.js` override la fixture `page` pour créer un `BrowserContext` neuf à chaque test. Le contexte neuf garantit aussi un `localStorage` vide → ne pas re-clear le flag mode test dans la fixture (ça casserait le toggle test qui set le flag puis reload).
- **Helpers utiles** : `createClient`, `createSprint`, `createItemInline`, `openItemDetailByTitle`, `openSidebarItemAction(page, row, action)` (pour le menu kebab Modifier/Supprimer).
- **Sélecteurs robustes** : préférer `data-section`, `data-status`, `data-view`, `data-id`, `data-stat-key`, `#id`, classes `.if-*` du formulaire inline. Éviter les sélecteurs de texte traduits sauf assertions.
