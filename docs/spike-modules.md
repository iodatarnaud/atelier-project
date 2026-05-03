# Spike modules ES natifs — AC10 (WI-010)

> Spike de faisabilité pour l'extraction modulaire bornée (≤ 3 modules ES natifs sans framework, sans bundler) prévue en AC5b. Vérifie avant toute extraction réelle que le boot `<script type="module">` fonctionne sur Playwright/http-server, que `window.__atelierInternals` est exposable test-mode-gated, et que les handlers inline existants ne sont pas cassés.

## Verdict : **GO** ✅

Tous les critères GO minimum (tests 1+2+3 du PRD AC10) sont remplis. Stratégie d'exposition retenue (cf. AC5b) : **(a) handlers UI restent dans le shell `index.html`** + **(b) primitives métier exposées en `window.*`** pour compat avec le code inline existant + **`window.__atelierInternals` test-mode-gated** pour `page.evaluate` Playwright.

## Tests effectués

### 1. Boot local HTTP + Playwright (critère GO)

**Setup** :
- Module minimal `js/items.js` exportant une fonction probe (`spikeProbe`).
- Bridge inline `<script type="module">` dans `index.html` (avant le `<script>` principal) qui :
  - importe `spikeProbe` depuis `./js/items.js`
  - expose en `window.__atelierInternals.spikeProbe` SI `localStorage['atelier-mode-test'] === 'true'` OU `window.__SKIP_SEED__ === true`
  - pose un marqueur `window.__atelierModuleSpike = { loaded: true, ts: <Date.now()> }` (toujours, signal de boot module)

**Résultats** : `npm test` → suite test-mode (4 tests) PASS, suite spike-modules (3 tests) PASS, suite complète **149/149 PASS** (146 existants + 3 nouveaux spike).

→ Le boot ES module natif fonctionne sur **http-server** (Playwright). Très haute confiance que ça marche aussi sur **Live Server** (port 5500) et **GitHub Pages** (chemins relatifs `./js/...` standards).

### 2. Handler inline post-extraction simulée (critère GO)

**Stratégie retenue (a) pour les handlers inline** : ils restent dans le `<script>` inline classique d'`index.html`, n'ont pas besoin d'être migrés en module.

**Validation** : la suite complète Playwright (149/149) couvre déjà tous les handlers inline existants (`switchView`, `openItemDetail`, `saveItemEdit`, `cycleStatus`, etc.). Aucune régression observée après ajout du `<script type="module">` bridge → les handlers inline continuent de répondre normalement, le module ES natif n'interfère pas avec le scope global du `<script>` classique.

→ Pour les futures extractions de primitives métier (factory, view-model, dragContext), les handlers inline du shell continueront d'appeler ces primitives via `window._clampNumber()`, `window.buildItem()`, etc. (stratégie b — pont `window.*`) ou via leurs noms tels qu'attachés par le bridge module.

### 3. `page.evaluate` accès `window.__atelierInternals` (critère GO)

**Test** `tests/spike-modules.spec.js` (3 cas) :
- `window.__atelierModuleSpike.loaded === true` après `resetApp(page)` → **PASS** (boot module confirmé).
- `window.__atelierInternals.spikeProbe()` retourne `{ ok: true, source: 'js/items.js' }` en mode test (`__SKIP_SEED__` actif via `helpers.js` fixture) → **PASS**.
- En mode normal (nouveau context sans `__SKIP_SEED__` ni `atelier-mode-test`), `window.__atelierInternals === undefined` → **PASS** (pas de fuite prod).

→ La gating test-mode-only fonctionne. Le pattern est viable pour exposer `_buildItem`, `_buildCalendarItems`, etc. aux tests Playwright dans les axes AC1/AC2/AC4 sans polluer la prod.

## Inventaire des fonctions globales à préserver lors des extractions

### Handlers inline HTML (`onclick`, `onchange`, `oninput`, `onsubmit`, `onfocus`, `onblur`, `ondrag*`, etc.)

Liste extraite par `grep -hoE 'on(click|change|input|submit|drag[a-z]*|focus|blur|mouse[a-z]*|key[a-z]*)="[a-zA-Z_$][a-zA-Z0-9_$]*' index.html` (50 fonctions distinctes au moment du spike) :

```
cancelCommentEdit          closeClientModal           closeConfirm
closeEpicModal             closeItemModal             closeSettingsModal
closeSprintModal           closeSyncDiffModal         completeSprint
confirmDeleteComment       confirmDeleteItem          connectGist
disconnectGist             execRich                   exportData
hideInlineForm             openClientModal            openEpicModal
openItemDetail             openItemFromCalendar       openSettingsModal
openSprintModal            quickAdd                   renderView
resolveSyncConflict        saveCommentEdit            saveEpic
saveItemEdit               selectEpicColor            setActiveSprint
setCalendarFilterEpic      setCalendarFilterPrio      setCalendarFilterProject
setCalendarFilterType      setCalendarMonth           setEpicFilter
setGroupBy                 setTypeFilter              showInlineForm
startEditComment           submitClientForm           submitComment
submitInlineForm           submitSprintForm           switchClient
switchItemDetailTab        switchView                 toggleCalendarCell
toggleCalendarUnplanned    toggleTestMode             triggerImport
```

**Décision (stratégie a)** : ces fonctions **restent dans le shell `index.html`** (top-level du `<script>` classique inline). Aucune n'est migrée en module ES dans WI-010. Si l'évolution future justifie leur extraction, c'est l'objet d'un WI dédié.

### Accès Playwright via `page.evaluate` (state global + internals)

Les tests E2E accèdent principalement à `state.clients[*].items[*]` directement comme variable globale (depuis le `<script>` inline). Aucun test ne dépend actuellement d'une fonction nommée précise via `page.evaluate(() => fnName())` (le pattern dominant est `state.clients[0].items.find(i => i.title === '...')`).

**Décision** : les nouveaux tests AC1/AC4 utiliseront `page.evaluate(() => window.__atelierInternals.buildItem(...))` ou similaire — exposition test-mode-gated comme dans le spike.

## Stratégie retenue pour les futurs axes (AC1 → AC5b)

1. **AC1 Factory item** : créer `_buildItem` + `_itemDefaults` dans `js/items.js`, exposer via le bridge `<script type="module">` à `window._buildItem` (compat shell) + `window.__atelierInternals.buildItem` (test-mode). Migrer le chemin **form inline** (fait en itération #2). **Demo seed** non migré (statique et complet, acceptable). **`_normalizeItem`** non aligné sur `itemDefaults()` partagé dans cette itération — la validation existante (`_clampNumber/Int/String` + checks enum) couvre déjà les défauts équivalents, vérifié par test AC1.d (`_normalizeItem({ id, title })` retourne mêmes defaults que `buildItem`). Alignement structurel possible WI futur si justifié.
2. **AC2 Marqueurs test-only** : `window.__appStateVersion` + `window.__lastSaveCompletedAt` posés directement dans le `<script>` inline (pas besoin d'être dans un module). Helpers `waitForRender` / `waitForSave` ajoutés à `tests/helpers.js`.
3. **AC3 `_dragContext` + helpers explicites** : créer `js/drag-drop.js` exportant `dragContext` (state local module), `startDrag`, `endDrag`, `getDragItemId`, `getCalendarDragItem`, `didDragJustHappen`. Bridge expose à `window.*` pour compat shell. Anciens `let dragItemId / calendarDragItem / dragJustHappened` synchronisés temporairement via `startDrag/endDrag` dans le bridge.
4. **AC4 View-model calendrier** : créer `js/calendar.js` exportant `buildCalendarItems` + helpers month/cell/today. Bridge expose à `window.*`.
5. **AC5a Regroupement intra-fichier** : commentaires d'ancrage `=== ITEM HELPERS ===`, `=== DRAG CONTEXT ===`, `=== CALENDAR VIEW-MODEL ===` dans `index.html` pour les blocs qui restent inline (handlers UI orchestraux + parties non extraites).
6. **AC5b Extraction modules** : 3 modules livrés (`js/items.js`, `js/drag-drop.js`, `js/calendar.js`), dans cet ordre (items d'abord car le plus pur, drag-drop en dernier car le plus risqué).

## Rollback (si problème en cours)

Si pendant l'IMPLEMENTATION un problème handler inline / global exposure se manifeste après ce GO :
1. Supprimer le `<script type="module">` bridge dans `index.html`.
2. Supprimer les modules `js/*.js`.
3. Garder les changements intra-fichier (factory, marqueurs, dragContext, view-model en regroupement AC5a).
4. AC5b skippée, RETROSPECTIVE WI-010 documente la décision.

## Validations supplémentaires (non-bloquantes pour GO)

- **Chemins relatifs** : `./js/items.js` testé sur http-server (port 5501). À valider en pré-merge sur Live Server (port 5500) et GitHub Pages (base `/atelier-project/`).
- **GitHub Pages** : validation manuelle après merge (push branche test optionnel ; non fait dans le spike — PLAN_REVIEW#2 ambiguity #4).

## Tests du spike (à conserver ou fusionner)

`tests/spike-modules.spec.js` (3 tests) servent de safety net pour le bridge module + l'exposition test-mode. À fusionner avec les tests AC2 (marqueurs test-only) en fin d'IMPLEMENTATION OU à conserver comme suite dédiée si plus pertinent.
