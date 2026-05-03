# Architecture Atelier — domaines extraits + frontières shell/modules

> Document de référence pour Claude/Codex/Arnaud lors d'une évolution future. Rédigé en sortie du WI-010 (v0.19.0) qui a stabilisé l'architecture post-calendrier en extrayant 3 modules ES natifs depuis le shell `index.html`. Mise à jour obligatoire à chaque ajout/retrait de module ou changement majeur de frontière.

## Vue d'ensemble

`index.html` reste un **shell mono-fichier** (~5640 lignes) qui contient :
- Le HTML + CSS embarqués.
- Le `<script>` inline classique avec : state global (`state`), storage layer (IndexedDB + Gist sync), DOM rendering (`renderSidebar`, `renderView`, `renderCalendar`, modals), handlers UI orchestraux (50 fonctions globales appelées par HTML inline `onclick="..."` — voir `docs/spike-modules.md` annexe pour l'inventaire complet).
- Un bridge `<script type="module">` (~ligne 2188) qui importe les 3 modules ES et expose leurs primitives sur `window.*` (compat shell) + `window.__atelierInternals` (test-mode-gated pour `page.evaluate` Playwright).

Aucun framework, aucun bundler, aucun build step. Le chargement est natif via `<script type="module">` (Live Server, http-server, GitHub Pages).

## Domaines extraits (modules ES natifs)

### `js/items.js` — Item primitives (factory + defaults)

**Exports** :
- `itemDefaults()` — defaults statiques partagés (type, priority, status, estimate, actualHours, dueDate, sprintId, epicId, description, activity).
- `buildItem(partial)` — factory canonique. **Garantie** : retourne un item avec **tous les 14 champs trackables définis** (jamais `undefined`), ce qui empêche les phantom events d'activité au premier `saveItemEdit`.
- `spikeProbe()` — probe de validation boot module (sera retirée à la fusion finale des tests spike).

**Bridge → window** : `window._buildItem`, `window._itemDefaults`. Test-mode : `window.__atelierInternals.{buildItem, itemDefaults}`.

**Call-sites shell migré** : `submitInlineForm` (`index.html` ~ligne 4455) — création inline d'item. Demo seed et `_normalizeItem` (validation import) **non migrés** : couplage fort avec STATUS_VALUES/TRACKED_FIELDS/ID_PATTERN du shell, équivalent défensif déjà couvert par `_clampNumber/Int/String`. Test AC1.d valide que `_normalizeItem(partial)` retourne les mêmes defaults que `buildItem(partial)`.

### `js/drag-drop.js` — DnD context unifié

**Exports** :
- `startDrag(ctx)` — pose le contexte unifié `{ source: 'backlog'|'board'|'calendar', itemId, clientId?, payload?, startedAt }`. Reset défensif `_dragJustHappened` si nouveau drag avant expiration (refinement Codex Checkpoint #2).
- `endDrag()` — clear contexte + arme `_dragJustHappened` pendant 100ms (anti-click post-drop).
- `getDragItemId()` — itemId si source `'backlog'`/`'board'`, `null` si source `'calendar'` (compat ancien `dragItemId`).
- `getCalendarDragItem()` — `{ clientId, itemId }` si source `'calendar'`, `null` sinon (compat ancien `calendarDragItem`).
- `didDragJustHappen()` — `true` pendant 100ms après `endDrag` (compat ancien `dragJustHappened`).
- `peekDragContext()` — copie lecture seule pour debug/tests.
- `_resetDragState()` — reset complet, exposé test-mode-gated uniquement.

**Bridge → window** : `window._startDrag`, `window._endDrag`, `window._getDragItemId`, `window._getCalendarDragItem`, `window._didDragJustHappen`. Test-mode : `window.__atelierInternals.{startDrag, endDrag, ..., peekDragContext, _resetDragState}`.

**Call-sites shell migrés** : 12 sites dans `index.html` (board card dragstart/dragend/click ~ligne 4550, board col.drop ~ligne 4598, sidebar dragover/drop ~ligne 4561, backlog row dragstart/dragend/click ~ligne 4651, backlog section.drop ~ligne 4710, calendar item dragstart/dragend ~ligne 4690, calendar cell.dragover/drop + unplanned.dragover/drop ~ligne 4730, `openItemFromCalendar` ~ligne 4396).

**Anciens `let dragItemId/calendarDragItem/dragJustHappened` supprimés** du shell (clean break, source unique = module).

### `js/calendar.js` — View-model calendrier multi-projets

**Exports** :
- `localDateKey(d)` — YYYY-MM-DD timezone-safe (utilise getFullYear/getMonth/getDate, **pas** toISOString qui retournerait UTC).
- `buildMonthCells(year, month)` — grille semaines lundi→dimanche + cellules adjacentes mois précédent/suivant (`{ date, inMonth }`).
- `buildCalendarItems(state, filters)` — view-model **pur** (snapshot `JSON.stringify(state)` identique avant/après). Combine flatMap clients × items + annotation `clientId/clientName/clientColor/epicColor/epicName` + filtres exclusion done + `{ projectId, type, priority, epicId }` reçus en argument.
- `indexCalendarItems(items)` — pré-indexation pour lookup O(1) par cellule, extraction `unplanned` + `overdue`, tris stables.

**Bridge → window** : `window.localDateKey`, `window.buildMonthCells`, `window.buildCalendarItems`, `window.indexCalendarItems` (sans préfixe `_` car les tests `calendrier*.spec.js` les appellent directement via `page.evaluate`). Test-mode : `window.__atelierInternals.*`.

**Call-sites shell migré** : `renderCalendar` (`index.html` ~ligne 4163) appelle `buildCalendarItems(state, { projectId, type, priority, epicId })` au lieu des anciens `getAllCalendarItems()` + `filterCalendarItems(items)`.

## Frontière shell ↔ modules (règle d'extension)

**Le shell `index.html` orchestre** :
- Le state global (`state.clients[*].items[*]`, `state.calendarFilter*`, `state.activeView`, etc.) — propriétaire unique.
- Le DOM rendering (`renderSidebar/renderView/renderCalendar/renderItemDetailModal/renderActivityPane/...`) — manipule `document.getElementById(...)` et `innerHTML`.
- Les handlers UI globaux exposés au HTML inline (`onclick="switchView(...)"`, `onclick="openItemDetail(...)"`, etc.) — top-level dans le `<script>` classique.
- La validation d'import (`_normalizeItem`, `_normalizeChangeFieldValue`, `_normalizeActivityEvent`, etc.) — couplage avec les enums de validation.
- Le storage/sync (IndexedDB + Gist) et la coordination push/pull multi-instances.

**Les modules ES natifs portent** :
- Les **primitives pures** (factory item, calculs calendrier, indexation, gestion DnD context).
- **Aucun accès direct au state global** : si une primitive a besoin du state, elle le reçoit en argument (cf. `buildCalendarItems(state, filters)`).
- **Aucune mutation du DOM** : les modules ne touchent jamais à `document.*` directement (sauf hypothétique future extension).
- **State local au module autorisé** uniquement pour le contexte interne du domaine (ex. `_dragContext` dans `js/drag-drop.js`) — pas pour des données partagées avec le shell.

## Règle "pas de module qui mute le state global"

Un module ne doit JAMAIS faire `state.clients = ...` ou similaire. Si une primitive doit modifier l'état :
- Soit elle reçoit la portion concernée en argument et **retourne** la nouvelle valeur (le shell applique).
- Soit le shell appelle la primitive puis fait la mutation lui-même (`item.foo = ...; saveState(); render();`).

Cette règle protège la **mutation pattern** existante du shell : `state mutation → saveState() → render()`.

## Invariants d'extension (ajouter un nouveau champ item, par exemple)

Pour ajouter un nouveau champ optionnel sur un item (suite WI-009 `actualHours`) :
1. Modifier `js/items.js` : ajouter le champ dans `itemDefaults()` + dans `buildItem()`.
2. Modifier `index.html` shell : ajouter la validation dans `_normalizeChangeFieldValue` (case du champ) + `_normalizeItem` (clamping/validation).
3. Ajouter le champ à `TRACKED_FIELDS` (set ligne ~2453) si on veut le tracker en activité.
4. Ajouter l'input dans la modale `renderItemDetailModal` + lecture dans `saveItemEdit`.
5. Ajouter à `_ACTIVITY_FIELD_LABELS` si tracké.
6. Tests E2E : factory shape (via `__atelierInternals.buildItem`), via UI form inline, via import `_normalizeItem`.

Pour étendre le DnD à une 4ᵉ source (hypothétique) :
1. Ajouter la valeur dans le commentaire JSDoc de `startDrag(ctx)` du module.
2. Ajouter un handler shell `attach<NewSource>DragDrop()` qui appelle `_startDrag({ source: '<new>', itemId, ... })` et `_endDrag()`.
3. Décider si `getDragItemId()` doit inclure cette nouvelle source ou rester compat (board/backlog seulement) — adapter la condition source.

Pour ajouter un nouveau filtre calendrier :
1. Étendre la signature de `buildCalendarItems(state, filters)` dans `js/calendar.js` avec le nouveau champ filters.
2. Modifier `renderCalendar` shell pour passer le nouveau filtre.
3. Ajouter l'élément UI dans le `<select>` du calendrier shell.

## Pourquoi mono-fichier `index.html` conservé (vs fichier complet par domaine)

- **Hosting GitHub Pages** : `index.html` autonome drop-in, pas de build à déployer.
- **Familiarité** : Arnaud ouvre le fichier et voit tout. Pas d'éclatement en 30 fichiers.
- **Pipe agent simple** : Claude/Codex chargent le shell + un module ciblé selon le domaine du WI, pas une arborescence complexe (cf. `docs/agent-context.md`).
- **Bornage WI-010** : 3 modules max (PRD AC5b), pas plus. Une extraction massive future (4+ modules, 20 fichiers) demanderait un nouveau WI dédié et probablement la levée du "pas de bundler".

Si l'usage agent montre que 3 modules ne suffisent pas (ex. besoin d'extraire `activity` ou `storage/sync` car blockers identifiés répétés), ouvrir un méta-WI pour faire évoluer cette architecture.
