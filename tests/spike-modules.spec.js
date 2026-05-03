// Spike AC10 + Factory AC1 + Marqueurs AC2 — couvre le boot ES module + factory item canonique
// + marqueurs test-only `__appStateVersion` / `__lastSaveCompletedAt` + helpers waitForRender/waitForSave.
// Ce fichier sera fusionné/renommé en fin d'IMPLEMENTATION (cf. WI-010 itération #7).
const { test, expect, resetApp, createClient, createSprint, createItemInline, snapshotRender, snapshotSave, waitForRender, waitForSave } = require('./helpers');

test.describe('Spike modules ES natifs (AC10)', () => {
  test('boot module : window.__atelierModuleSpike.loaded === true', async ({ page }) => {
    await resetApp(page);
    const moduleSpike = await page.evaluate(() => window.__atelierModuleSpike);
    expect(moduleSpike).toBeTruthy();
    expect(moduleSpike.loaded).toBe(true);
    expect(typeof moduleSpike.ts).toBe('number');
  });

  test('mode test : window.__atelierInternals.spikeProbe accessible', async ({ page }) => {
    // resetApp helper ouvre avec __SKIP_SEED__ true (cf helpers.js fixture).
    await resetApp(page);
    const probe = await page.evaluate(() => window.__atelierInternals?.spikeProbe?.());
    expect(probe).toBeTruthy();
    expect(probe.ok).toBe(true);
    expect(probe.source).toBe('js/items.js');
  });

  test('mode normal : window.__atelierInternals + __atelierModuleSpike === undefined (pas de fuite prod)', async ({ browser }) => {
    // Nouveau context SANS __SKIP_SEED__ et SANS atelier-mode-test → mode normal.
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('/index.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(150); // attente boot
    const probes = await page.evaluate(() => ({
      internals: window.__atelierInternals,
      moduleSpike: window.__atelierModuleSpike,
    }));
    expect(probes.internals).toBeUndefined();
    expect(probes.moduleSpike).toBeUndefined(); // P2 Checkpoint #1 — gated test-mode.
    await ctx.close();
  });

  test('Checkpoint#1 P1#2 — handler inline shell répond après bridge module (switchView via clic nav)', async ({ page }) => {
    await resetApp(page);
    await createClient(page, { name: 'Test', key: 'TST' });
    // Le handler inline `onclick="switchView('archive')"` doit toujours répondre malgré le bridge module ES natif.
    // Vérification : `data-view` attribute change sur la nav active après clic.
    await page.locator('.side-nav-item[data-view="archive"]').click();
    await expect(page.locator('.side-nav-item.active[data-view="archive"]')).toBeVisible({ timeout: 2000 });
    // Retour backlog pour vérifier qu'un autre handler inline répond aussi.
    await page.locator('.side-nav-item[data-view="backlog"]').click();
    await expect(page.locator('.side-nav-item.active[data-view="backlog"]')).toBeVisible({ timeout: 2000 });
  });
});

test.describe('Factory item canonique (AC1)', () => {
  test('AC1.a — buildItem({ title }) shape complète : tous les champs trackables définis (jamais undefined)', async ({ page }) => {
    await resetApp(page);
    const item = await page.evaluate(() => window.__atelierInternals.buildItem({ title: 'Test factory' }));
    // Garantie PRD AC1 : aucun champ undefined.
    const trackable = ['id', 'num', 'title', 'type', 'priority', 'status', 'estimate', 'actualHours', 'dueDate', 'sprintId', 'epicId', 'createdAt', 'description', 'activity'];
    for (const key of trackable) {
      expect(item[key], `champ "${key}" doit être défini`).not.toBeUndefined();
    }
    // Defaults respectés (cf. itemDefaults).
    expect(item.title).toBe('Test factory');
    expect(item.type).toBe('task');
    expect(item.priority).toBe(2);
    expect(item.status).toBe('todo');
    expect(item.estimate).toBe(0);
    expect(item.actualHours).toBe(0);
    expect(item.dueDate).toBeNull();
    expect(item.sprintId).toBeNull();
    expect(item.epicId).toBeNull();
    expect(item.description).toBe('');
    expect(item.activity).toEqual([]);
    expect(typeof item.id).toBe('string');
    expect(typeof item.createdAt).toBe('number');
  });

  test('AC1.b — item créé via UI inline form a tous les champs définis (pas de phantom event au 1er saveEdit)', async ({ page }) => {
    await resetApp(page);
    await createClient(page, { name: 'Test', key: 'TST' });
    await createItemInline(page, { title: 'Item via UI', type: 'task', priority: 2, estimate: 1.5 });

    // Vérifier shape complète depuis state global.
    const item = await page.evaluate(() => state.clients[0].items[0]);
    const trackable = ['id', 'num', 'title', 'type', 'priority', 'status', 'estimate', 'actualHours', 'dueDate', 'sprintId', 'epicId', 'createdAt', 'description', 'activity'];
    for (const key of trackable) {
      expect(item[key], `champ "${key}" doit être défini après création UI`).not.toBeUndefined();
    }
    expect(item.title).toBe('Item via UI');
    expect(item.estimate).toBe(1.5);
    expect(item.actualHours).toBe(0); // <- défini, pas undefined → critère anti-phantom event.
    expect(item.activity).toEqual([]);
  });

  test('AC1.c — buildItem accepte des partials et préserve les valeurs fournies', async ({ page }) => {
    await resetApp(page);
    const item = await page.evaluate(() => window.__atelierInternals.buildItem({
      id: 'custom-id',
      num: 42,
      title: 'Custom',
      type: 'bug',
      priority: 1,
      status: 'doing',
      estimate: 2.5,
      actualHours: 12,
      sprintId: 's-test',
      description: '<p>Hello</p>',
    }));
    expect(item.id).toBe('custom-id');
    expect(item.num).toBe(42);
    expect(item.title).toBe('Custom');
    expect(item.type).toBe('bug');
    expect(item.priority).toBe(1);
    expect(item.status).toBe('doing');
    expect(item.estimate).toBe(2.5);
    expect(item.actualHours).toBe(12);
    expect(item.sprintId).toBe('s-test');
    expect(item.description).toBe('<p>Hello</p>');
    // Champs non fournis → defaults posés.
    expect(item.dueDate).toBeNull();
    expect(item.epicId).toBeNull();
    expect(item.activity).toEqual([]);
  });

  // (Tests AC2 marqueurs test-only ajoutés ci-dessous, après AC1.d.)
  test('AC1.d (Checkpoint#1 P1#1) — item importé via _normalizeItem a tous les champs trackables définis (mêmes defaults que buildItem)', async ({ page }) => {
    await resetApp(page);
    // Partial minimum : id valide + title. _normalizeItem doit poser les mêmes defaults que buildItem.
    const item = await page.evaluate(() => {
      const partial = { id: 'i-imported-test', title: 'Imported partial' };
      // Signature: _normalizeItem(raw, validSprintIds, validEpicIds)
      return _normalizeItem(partial, new Set(), new Set());
    });
    expect(item).not.toBeNull();
    // Garantie PRD AC1 : aucun champ undefined sur le chemin import (équivalent buildItem).
    const trackable = ['id', 'num', 'title', 'type', 'priority', 'status', 'estimate', 'actualHours', 'dueDate', 'sprintId', 'epicId', 'createdAt', 'description', 'activity'];
    for (const key of trackable) {
      expect(item[key], `champ "${key}" doit être défini après _normalizeItem(partial)`).not.toBeUndefined();
    }
    // Defaults respectés (mêmes que buildItem itemDefaults() — P2 alignement à valider).
    expect(item.id).toBe('i-imported-test');
    expect(item.title).toBe('Imported partial');
    expect(item.type).toBe('task');
    expect(item.priority).toBe(2);
    expect(item.status).toBe('todo');
    expect(item.estimate).toBe(0);
    expect(item.actualHours).toBe(0);
    expect(item.dueDate).toBeNull();
    expect(item.sprintId).toBeNull();
    expect(item.epicId).toBeNull();
    expect(item.description).toBe('');
    expect(item.activity).toEqual([]);
  });
});

test.describe('Marqueurs test-only + helpers Playwright (AC2)', () => {
  test('AC2.a — window.__appStateVersion incrémente à chaque render() en mode test', async ({ page }) => {
    await resetApp(page);
    const v0 = await snapshotRender(page);
    expect(typeof v0).toBe('number');
    expect(v0).toBeGreaterThan(0); // au moins 1 render au boot

    // Déclenche un render via création client (state mutation → saveState → render).
    await createClient(page, { name: 'Test', key: 'TST' });
    const v1 = await snapshotRender(page);
    expect(v1).toBeGreaterThan(v0);

    // Helper waitForRender doit fonctionner.
    await page.evaluate(() => render()); // appel direct render() global du shell
    await waitForRender(page, { from: v1 });
    const v2 = await snapshotRender(page);
    expect(v2).toBeGreaterThan(v1);
  });

  test('AC2.b — window.__lastSaveCompletedAt posé au save (mode test, no-op persistence)', async ({ page }) => {
    await resetApp(page);
    await createClient(page, { name: 'Test', key: 'TST' });
    const t0 = await snapshotSave(page);
    expect(typeof t0).toBe('number');

    // Déclenche un saveState() — en mode test, no-op réel mais marqueur posé.
    await page.evaluate(async () => { await saveState(); });
    await waitForSave(page, { from: t0 });
    const t1 = await snapshotSave(page);
    expect(t1).toBeGreaterThan(t0);
  });

  test('AC2.c — mode normal : __appStateVersion + __lastSaveCompletedAt restent undefined (pas de fuite prod)', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('/index.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(150);
    const probes = await page.evaluate(() => ({
      version: window.__appStateVersion,
      lastSave: window.__lastSaveCompletedAt,
    }));
    expect(probes.version).toBeUndefined();
    expect(probes.lastSave).toBeUndefined();
    await ctx.close();
  });
});

test.describe('DnD context unifié + helpers explicites (AC3)', () => {
  test('AC3.a — startDrag(board) → getDragItemId === itemId, getCalendarDragItem === null', async ({ page }) => {
    await resetApp(page);
    const result = await page.evaluate(() => {
      const { startDrag, endDrag, getDragItemId, getCalendarDragItem, _resetDragState } = window.__atelierInternals;
      _resetDragState();
      startDrag({ source: 'board', itemId: 'i-board-test' });
      const got = { dragItemId: getDragItemId(), calendarDragItem: getCalendarDragItem() };
      endDrag();
      return got;
    });
    expect(result.dragItemId).toBe('i-board-test');
    expect(result.calendarDragItem).toBeNull();
  });

  test('AC3.b — startDrag(calendar) → getCalendarDragItem === { clientId, itemId }, getDragItemId === null', async ({ page }) => {
    await resetApp(page);
    const result = await page.evaluate(() => {
      const { startDrag, endDrag, getDragItemId, getCalendarDragItem, _resetDragState } = window.__atelierInternals;
      _resetDragState();
      startDrag({ source: 'calendar', itemId: 'i-cal-test', clientId: 'c-cal-test' });
      const got = { dragItemId: getDragItemId(), calendarDragItem: getCalendarDragItem() };
      endDrag();
      return got;
    });
    expect(result.dragItemId).toBeNull();
    expect(result.calendarDragItem).toEqual({ clientId: 'c-cal-test', itemId: 'i-cal-test' });
  });

  test('AC3.c — endDrag() arme didDragJustHappen pendant ~100ms puis le reset', async ({ page }) => {
    await resetApp(page);
    const before = await page.evaluate(() => {
      const { startDrag, endDrag, didDragJustHappen, _resetDragState } = window.__atelierInternals;
      _resetDragState();
      startDrag({ source: 'board', itemId: 'i-test' });
      return didDragJustHappen(); // false avant endDrag
    });
    expect(before).toBe(false);

    const justAfter = await page.evaluate(() => {
      const { endDrag, didDragJustHappen } = window.__atelierInternals;
      endDrag();
      return didDragJustHappen(); // true juste après endDrag
    });
    expect(justAfter).toBe(true);

    // Attente > 100ms pour que le timer reset le flag.
    await page.waitForTimeout(150);
    const afterTimer = await page.evaluate(() => window.__atelierInternals.didDragJustHappen());
    expect(afterTimer).toBe(false);
  });

  test('AC3.d — helpers DnD exposés sur window pour les 3 sources (board/backlog/calendar)', async ({ page }) => {
    await resetApp(page);
    const helpers = await page.evaluate(() => ({
      hasStartDrag: typeof window._startDrag === 'function',
      hasEndDrag: typeof window._endDrag === 'function',
      hasGetDragItemId: typeof window._getDragItemId === 'function',
      hasGetCalendarDragItem: typeof window._getCalendarDragItem === 'function',
      hasDidDragJustHappen: typeof window._didDragJustHappen === 'function',
    }));
    expect(helpers.hasStartDrag).toBe(true);
    expect(helpers.hasEndDrag).toBe(true);
    expect(helpers.hasGetDragItemId).toBe(true);
    expect(helpers.hasGetCalendarDragItem).toBe(true);
    expect(helpers.hasDidDragJustHappen).toBe(true);
  });

  test('AC3.e (Checkpoint#2 P1) — DnD déterministe via waitForRender : board cycleStatus + backlog dragstart→dragend + calendar startDrag/endDrag synchro', async ({ page }) => {
    await resetApp(page);
    await createClient(page, { name: 'Test', key: 'TST' });
    await createItemInline(page, { title: 'Item DnD test' });

    // Source 1 — Board : cycleStatus simulé via badge (handler inline shell, pas DnD direct mais teste
    // le chemin saveState + render déterministe avec waitForRender).
    const v0 = await snapshotRender(page);
    await page.locator('.backlog-row', { hasText: 'Item DnD test' }).locator('.status-badge').click();
    await waitForRender(page, { from: v0 });
    const status1 = await page.evaluate(() => state.clients[0].items[0].status);
    expect(status1).toBe('doing');

    // Source 2 — Backlog : startDrag('backlog') + endDrag programmatique → didDragJustHappen armed.
    const dragState = await page.evaluate(() => {
      const { startDrag, endDrag, getDragItemId, didDragJustHappen, _resetDragState } = window.__atelierInternals;
      _resetDragState();
      startDrag({ source: 'backlog', itemId: state.clients[0].items[0].id });
      const duringDrag = { itemId: getDragItemId(), justHappened: didDragJustHappen() };
      endDrag();
      const afterEnd = { itemId: getDragItemId(), justHappened: didDragJustHappen() };
      return { duringDrag, afterEnd };
    });
    expect(dragState.duringDrag.itemId).toBe(await page.evaluate(() => state.clients[0].items[0].id));
    expect(dragState.duringDrag.justHappened).toBe(false);
    expect(dragState.afterEnd.itemId).toBeNull();
    expect(dragState.afterEnd.justHappened).toBe(true);

    // Source 3 — Calendar : startDrag('calendar') → getCalendarDragItem cohérent + getDragItemId === null (sémantique compat).
    const calendarState = await page.evaluate(() => {
      const { startDrag, endDrag, getDragItemId, getCalendarDragItem, _resetDragState } = window.__atelierInternals;
      _resetDragState();
      startDrag({ source: 'calendar', itemId: state.clients[0].items[0].id, clientId: state.clients[0].id });
      const got = { dragItemId: getDragItemId(), calendarDragItem: getCalendarDragItem() };
      endDrag();
      return got;
    });
    expect(calendarState.dragItemId).toBeNull();
    expect(calendarState.calendarDragItem).toEqual({
      clientId: await page.evaluate(() => state.clients[0].id),
      itemId: await page.evaluate(() => state.clients[0].items[0].id),
    });
  });
});

test.describe('Calendar view-model pur (AC4)', () => {
  test('AC4.a — buildCalendarItems(state, {}) annote items avec clientId/clientName/clientColor/epicColor/epicName', async ({ page }) => {
    await resetApp(page);
    await createClient(page, { name: 'Acme', key: 'ACM' });
    await createItemInline(page, { title: 'Calendar item' });
    const annotated = await page.evaluate(() => {
      return window.__atelierInternals.buildCalendarItems(state, {});
    });
    expect(annotated.length).toBe(1);
    expect(annotated[0].title).toBe('Calendar item');
    expect(annotated[0].clientId).toBe(await page.evaluate(() => state.clients[0].id));
    expect(annotated[0].clientName).toBe('Acme');
    expect(annotated[0].clientColor).toBeDefined();
    expect(annotated[0].epicColor).toBeNull();
    expect(annotated[0].epicName).toBeNull();
  });

  test('AC4.b — buildCalendarItems exclut les items status === done', async ({ page }) => {
    await resetApp(page);
    await createClient(page, { name: 'Acme', key: 'ACM' });
    await createItemInline(page, { title: 'Item ouvert' });
    await createItemInline(page, { title: 'Item terminé' });
    // Passe l'item 1 en done via cycle 2x du badge.
    const badge = page.locator('.backlog-row', { hasText: 'Item terminé' }).locator('.status-badge');
    await badge.click(); // doing
    await badge.click(); // done
    const items = await page.evaluate(() => window.__atelierInternals.buildCalendarItems(state, {}));
    expect(items.length).toBe(1);
    expect(items[0].title).toBe('Item ouvert');
  });

  test('AC4.c (PURETÉ) — buildCalendarItems ne mute pas le state original (snapshot avant/après)', async ({ page }) => {
    await resetApp(page);
    await createClient(page, { name: 'Acme', key: 'ACM' });
    await createItemInline(page, { title: 'Pure test' });
    const result = await page.evaluate(() => {
      const before = JSON.stringify(state);
      const items = window.__atelierInternals.buildCalendarItems(state, { type: 'task', priority: 2 });
      const after = JSON.stringify(state);
      // Mute manuellement le résultat pour vérifier qu'on n'altère pas state.
      if (items[0]) items[0].title = 'MUTATED';
      const afterMutation = JSON.stringify(state);
      return { snapshotMatches: before === after, snapshotIntactAfterReturnMutation: before === afterMutation };
    });
    expect(result.snapshotMatches).toBe(true);
    expect(result.snapshotIntactAfterReturnMutation).toBe(true);
  });

  test('AC3.f (CODE_REVIEW#1 P1#2) — vrai DnD DOM board kanban via dragTo Playwright avec attente déterministe', async ({ page }) => {
    await resetApp(page);
    await createClient(page, { name: 'Test', key: 'TST' });
    await createSprint(page, { name: 'Sprint AC3' });
    const sectionId = await page.locator('.backlog-section.sprint-active-section').getAttribute('data-section');
    await createItemInline(page, { sectionId, title: 'Drag DOM réel' });

    // Va sur la vue board (sprint actif → board kanban rendu).
    await page.locator('.side-nav-item[data-view="board"]').click();
    const card = page.locator('.card', { hasText: 'Drag DOM réel' });
    await expect(card).toBeVisible();

    // Vrai DnD DOM via Playwright dragTo (event natif drag/drop).
    const v0 = await snapshotRender(page);
    await card.dragTo(page.locator('.board-col[data-status="doing"] .board-col-body'));
    // Attente déterministe via marqueur __appStateVersion (mutation = nouveau render).
    await waitForRender(page, { from: v0 });

    // Vérifie que le state a muté (status passé en doing).
    const status = await page.evaluate(() => state.clients[0].items[0].status);
    expect(status).toBe('doing');
    // Vérifie aussi que la carte est rendue dans la colonne "doing".
    await expect(page.locator('.board-col[data-status="doing"] .card', { hasText: 'Drag DOM réel' })).toBeVisible();
  });

  test('AC4.d — indexCalendarItems retourne byDate/unplanned/overdue avec tris stables', async ({ page }) => {
    await resetApp(page);
    const result = await page.evaluate(() => {
      const today = window.__atelierInternals.localDateKey(new Date());
      const yesterday = window.__atelierInternals.localDateKey(new Date(Date.now() - 24 * 3600 * 1000));
      const items = [
        { id: 'i1', title: 'Today', status: 'todo', dueDate: today, priority: 2 },
        { id: 'i2', title: 'Yesterday overdue', status: 'todo', dueDate: yesterday, priority: 1 },
        { id: 'i3', title: 'Unplanned A', status: 'todo', dueDate: null, priority: 3 },
        { id: 'i4', title: 'Unplanned B', status: 'todo', dueDate: null, priority: 1 },
      ];
      const indexed = window.__atelierInternals.indexCalendarItems(items);
      return {
        byDateKeys: [...indexed.byDate.keys()].sort(),
        unplannedTitles: indexed.unplanned.map(i => i.title),
        overdueTitles: indexed.overdue.map(i => i.title),
      };
    });
    expect(result.byDateKeys.length).toBe(2); // today + yesterday
    expect(result.unplannedTitles).toEqual(['Unplanned B', 'Unplanned A']); // tri par priorité asc (1 avant 3)
    expect(result.overdueTitles).toEqual(['Yesterday overdue']);
  });
});
