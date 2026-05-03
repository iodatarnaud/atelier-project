# Carte de contexte agent — Atelier

> Référence opérationnelle pour Claude Code et Codex CLI lors d'un nouveau WI sur Atelier. Objectif : **réduire le contexte chargé** par les agents — lire le module + invariants ciblés au lieu de scanner les ~5640 lignes de `index.html` à chaque tour. Document complémentaire à `docs/architecture.md` (frontières architecturales) ; ici on est dans l'opérationnel par type de WI.

## Règle de review (or)

Pour tout WI : **lire le module ciblé + le contrat partagé** (`docs/architecture.md`), **pas tout le monolithe**. Si la modification déborde du domaine, élargir le périmètre proportionnellement, pas systématiquement.

## Invariants transverses obligatoires (à TOUJOURS vérifier)

À garder en tête sur tout WI Atelier, indépendamment du domaine :

1. **Mutation pattern** : `state mutation → saveState() → render()`. Toute modification de `state.clients[*].items[*]` doit suivre cet ordre. Pour les champs trackés, passer par `withItemChangeTracking(item, () => { ... mutations ... })` (cf. `index.html` ligne ~5470) pour garantir l'enregistrement de l'event d'activité.
2. **Escape contextuel** : `escapeHtml(...)` pour contenu textuel, `escapeAttr(...)` pour valeur d'attribut HTML, `escapeJs(...)` pour string JS dans un `onclick`. **Jamais** d'interpolation directe dans des templates HTML générés par `innerHTML`.
3. **Validation à l'import** : tout payload externe (Gist sync, import JSON) passe par `_normalizeItem` / `_normalizeEpic` / `_normalizeSprint` / `_normalizeActivityEvent` (`index.html` ~ligne 2570-2610). Ne jamais by-passer.
4. **Last-write-wins inter-boot** : `state.lastSavedAt` est l'arbitre entre IndexedDB et Gist au boot.
5. **Push-guard inter-instance** (depuis v0.17.0) : avant chaque PATCH Gist, GET préalable + comparaison `remoteTs` vs `_lastSyncedRemoteTs` baseline. Voir `index.html` section `// === SYNC MULTI-INSTANCES ===`.
6. **Pas de `</script>` litéral** dans `index.html`, même en commentaire JS (le HTML parser ferme le bloc et casse silencieusement le runtime). Reformuler en `<\/script>` ou en concaténation. Ce point est documenté dans `CLAUDE.md` mémoire user.
7. **Mutation pattern obligatoire `state → saveState() → render()`** (rappel — c'est l'invariant le plus violé en pratique).
8. **Modules ES natifs ne mutent pas le state global** (cf. `docs/architecture.md`). Si un module a besoin du state, il le reçoit en argument.

## Carte des domaines

### Pour les WI **factory item / champ item**

**Lire** :
- `js/items.js` — factory canonique, defaults statiques.
- `index.html` lignes 2453-2540 — `TRACKED_FIELDS`, `_normalizeChangeFieldValue`, validation enums.
- `index.html` lignes 2570-2640 — `_normalizeItem` (validation à l'import, doit aligner ses defaults sur `itemDefaults()`).
- `index.html` lignes 4438-4475 — `submitInlineForm` (chemin de création UI, utilise `_buildItem` via window).
- `index.html` lignes 5050-5085 — `saveItemEdit` (lecture des inputs modale).
- `index.html` lignes 4860-4880 — `renderItemDetailModal` field-groups (input pour le nouveau champ).
- `index.html` lignes 5536-5560 — `_ACTIVITY_FIELD_LABELS` + `_formatActivityFieldValue` (si champ tracké, ajouter label + format).
- `tests/spike-modules.spec.js` AC1.a/b/c/d — tests factory shape + UI + import.

**Pattern type** : ajouter `newField` dans `itemDefaults()` + `buildItem()` + `_normalizeChangeFieldValue case` + `_normalizeItem` clamping + `TRACKED_FIELDS` (si tracké) + input modale + lecture saveItemEdit + label activité.

### Pour les WI **DnD** (board / backlog / sidebar / calendrier)

**Lire** :
- `js/drag-drop.js` — context unifié + helpers explicites.
- `index.html` lignes 4426-4445 — anchor `=== DRAG & DROP ===` + commentaire des stratégies.
- `index.html` lignes 4540-4580 — board (cartes + colonnes).
- `index.html` lignes 4583-4625 — sidebar (drop targets sprint/epic).
- `index.html` lignes 4630-4720 — backlog (rows + sections).
- `index.html` lignes 4670-4790 — calendrier (cal-items + cells + unplanned).
- `index.html` ligne ~4395 — `openItemFromCalendar` (anti-click `_didDragJustHappen()`).
- `tests/calendrier-dnd.spec.js` (~17 tests) + `tests/spike-modules.spec.js` AC3.a/b/c/d/e — tests DnD multi-vues.

**Pattern type** : nouveau drag → `_startDrag({ source, itemId, clientId? })` au dragstart, `_endDrag()` au dragend, lecture `_getDragItemId()` ou `_getCalendarDragItem()` au drop. Bridge module expose tout sur `window._*`.

### Pour les WI **calendrier / vue mensuelle**

**Lire** :
- `js/calendar.js` — view-model pur (localDateKey, buildMonthCells, buildCalendarItems, indexCalendarItems).
- `index.html` ligne 4113 — anchor `=== CALENDAR ===` + commentaire frontière shell/module.
- `index.html` lignes 4160-4350 — `renderCalendar` (DOM rendering, filtres, expanded cells, overdue, unplanned).
- `index.html` lignes 4670-4790 — DnD calendrier.
- `index.html` ligne ~3635 — `setCalendarFilter*` handlers.
- `tests/calendrier.spec.js` (~37 tests) + `tests/calendrier-dnd.spec.js` (~17 tests) + `tests/spike-modules.spec.js` AC4.a/b/c/d.

**Pattern type** : nouveau filtre → ajouter dans signature `buildCalendarItems(state, filters)` du module + passer depuis `renderCalendar` (state filter + UI select handler).

### Pour les WI **storage / sync (IndexedDB + Gist)**

**Lire** :
- `index.html` ligne 2357 — anchor `=== STORAGE LAYER ===` (dbGet, dbSet, dbDelete IndexedDB + fallback localStorage).
- `index.html` ligne 2415 — anchor `=== SYNC LAYER ===` (Gist push/pull, `syncConfig`, `pushToGist`, `pullFromGist`).
- `index.html` ligne 2427 — anchor `=== SYNC MULTI-INSTANCES ===` (push-guard, focus pull, `_localDirtySinceTs`, `_lastSyncedRemoteTs`).
- `index.html` lignes 3220-3260 — `saveState` (debounce 50ms + dbSet + scheduleGistPush).
- `tests/persistance.spec.js` + `tests/sync-multi-instances.spec.js`.

### Pour les WI **activité / commentaires / timeline changes**

**Lire** :
- `index.html` ligne 5408 — anchor `=== ACTIVITY ===` + tout le bloc (~lignes 5408-5720).
- `index.html` lignes 2453 — `TRACKED_FIELDS` (set des champs trackés).
- `index.html` lignes 2540-2615 — `_normalizeActivityEvent` (validation events).
- `tests/activite.spec.js` (~21 tests).

### Pour les WI **modals / UI inline forms**

**Lire** :
- `index.html` lignes 4354 — anchor `=== INLINE FORM ===` (création items inline).
- `index.html` lignes 4794-4870 — `renderItemDetailModal` (modale détails item).
- `index.html` lignes 5055-5230 — `=== SPRINT/EPIC/CLIENT ACTIONS ===` (modales de gestion).
- `index.html` lignes 5298-5360 — `=== ACTION MENU ===` (kebab popovers).

### Pour les WI **rendu sidebar / breadcrumb / topbar / stats**

**Lire** :
- `index.html` lignes 3477-3608 — `renderSidebar`, `renderStats`, `renderBreadcrumb` (header global, projets, sprints, epics).
- `index.html` lignes 3613-3650 — `renderView` (router vue active : backlog/board/archive/calendar).

### Pour les WI **mode test / seed démo**

**Lire** :
- `index.html` lignes 2242-2360 — anchor `=== MODE TEST ===` (flag + seed démo + skip seed).
- `tests/test-mode.spec.js` + `tests/helpers.js` (fixture `__SKIP_SEED__`).

## Test infrastructure (WI-010 AC2 + spike modules)

Pour tout WI qui ajoute des tests E2E :

- **Helpers déterministes** : `tests/helpers.js` exporte `snapshotRender(page)`, `snapshotSave(page)`, `waitForRender(page, { from })`, `waitForSave(page, { from })` qui s'appuient sur les marqueurs test-only `window.__appStateVersion` (incrément à chaque render) et `window.__lastSaveCompletedAt` (timestamp save async terminé). Ces marqueurs sont **gated mode test / `__SKIP_SEED__`** — invisibles en production. À privilégier sur `waitForTimeout(N)` arbitraires.
- **Internals test-mode** : `window.__atelierInternals.*` expose les primitives des modules (`buildItem`, `itemDefaults`, `startDrag`, `endDrag`, `getDragItemId`, `getCalendarDragItem`, `didDragJustHappen`, `peekDragContext`, `_resetDragState`, `localDateKey`, `buildMonthCells`, `buildCalendarItems`, `indexCalendarItems`, `spikeProbe`). Utilisable via `page.evaluate(() => window.__atelierInternals.foo(...))`.
- **Helpers de scénario** : `tests/helpers.js` exporte aussi `resetApp`, `createClient`, `createSprint`, `createItemInline`, `openItemDetailByTitle`, `closeItemDetail`, `openSidebarItemAction`. Utiliser pour simplifier l'arrangement des tests.

## Méta-WI protocole : à éviter dans un WI app

Si une évolution touche durablement les bootstraps protocole (`AI.md`, `ai-system/CLAUDE_BOOTSTRAP.md`, `ai-system/CODEX_BOOTSTRAP.md`, `ai-system/00_AI_SYSTEM.md`), **ne pas le faire dans un WI app** : ouvrir un **méta-WI protocole dédié**. Ce document `agent-context.md` peut au contraire évoluer librement dans un WI app si la frontière est mieux comprise.

## Maintien de cette doc

À mettre à jour à chaque :
- Ajout/retrait de module ES natif.
- Ajout d'un domaine non répertorié ici (ex. extraction future de `js/activity.js`).
- Changement majeur de frontière shell/module.
- Découverte d'un invariant transverse non documenté qui aurait dû l'être.

Frequency : opportunisme dans un WI sur le domaine concerné, pas méta-WI à part (sauf si le delta est trop important).
