const { test, expect, resetApp, createClient, createSprint, createItemInline } = require('./helpers');

// WI-013 : viewport large pour que les 6 colonnes du pipeline tiennent sans scroll horizontal
// → les tests DnD peuvent déposer sur n'importe quelle colonne (Playwright `dragTo` ne gère pas
// fiablement un drop sur colonne hors-écran dans le board `overflow-x:auto`). Le scroll horizontal
// lui-même est couvert par `board-scroll.spec.js` (viewport 1440, AC5).
test.use({ viewport: { width: 2400, height: 900 } });

test.beforeEach(async ({ page }) => {
  await resetApp(page);
  await createClient(page, { name: 'Acme', key: 'ACM' });
  await createSprint(page, { name: 'Sprint 1' });
});

test.describe('Board (Kanban)', () => {
  test('affiche les 6 colonnes du pipeline dans l\'ordre avec un état vide (AC1)', async ({ page }) => {
    await page.locator('.side-nav-item[data-view="board"]').click();
    await expect(page.locator('#kanbanBoard')).toBeVisible();

    // Ordre canonique du pipeline
    const order = await page.locator('.board-col').evaluateAll(cols => cols.map(c => c.getAttribute('data-status')));
    expect(order).toEqual(['todo', 'doing', 'dev', 'uat', 'golive', 'done']);

    // Libellés des nouveaux stages
    await expect(page.locator('.board-col[data-status="dev"] .board-col-head')).toContainText('DEV');
    await expect(page.locator('.board-col[data-status="uat"] .board-col-head')).toContainText('UAT');
    await expect(page.locator('.board-col[data-status="golive"] .board-col-head')).toContainText('Go live');

    // Compteurs à 0
    await expect(page.locator('.board-col[data-status="todo"] .num')).toHaveText('0');
  });

  test('affiche "aucun sprint actif" si pas de sprint', async ({ page }) => {
    // On clôt le sprint actif d'abord
    page.once('dialog', d => d.accept());
    await page.locator('.side-nav-item[data-view="board"]').click();
    await page.locator('button', { hasText: 'Terminer le sprint' }).click();

    // Retour sur board doit montrer l'empty state
    await page.locator('.side-nav-item[data-view="board"]').click();
    await expect(page.locator('.empty-title')).toContainText('Aucun sprint actif');
  });

  test('drag & drop d\'une carte de To Do vers En cours puis Terminé', async ({ page }) => {
    const sectionId = await page.locator('.backlog-section.sprint-active-section').getAttribute('data-section');
    await createItemInline(page, { sectionId, title: 'Carte mobile' });

    await page.locator('.side-nav-item[data-view="board"]').click();
    await expect(page.locator('#kanbanBoard')).toBeVisible();

    const card = page.locator('.card', { hasText: 'Carte mobile' });
    await expect(card).toBeVisible();

    // À ce stade la carte est dans la colonne todo
    await expect(page.locator('.board-col[data-status="todo"] .card', { hasText: 'Carte mobile' })).toBeVisible();
    await expect(page.locator('.board-col[data-status="doing"] .card', { hasText: 'Carte mobile' })).toHaveCount(0);

    // Drag → doing
    await card.dragTo(page.locator('.board-col[data-status="doing"] .board-col-body'));
    await expect(page.locator('.board-col[data-status="doing"] .card', { hasText: 'Carte mobile' })).toBeVisible();
    await expect(page.locator('.board-col[data-status="doing"] .num')).toHaveText('1');
    await expect(page.locator('.board-col[data-status="todo"] .num')).toHaveText('0');

    // Drag → done
    const cardDoing = page.locator('.board-col[data-status="doing"] .card', { hasText: 'Carte mobile' });
    await cardDoing.dragTo(page.locator('.board-col[data-status="done"] .board-col-body'));
    await expect(page.locator('.board-col[data-status="done"] .card', { hasText: 'Carte mobile' })).toBeVisible();
    await expect(page.locator('.board-col[data-status="done"] .num')).toHaveText('1');
  });

  test('clique sur une carte ouvre la modal détail', async ({ page }) => {
    const sectionId = await page.locator('.backlog-section.sprint-active-section').getAttribute('data-section');
    await createItemInline(page, { sectionId, title: 'Carte cliquable' });

    await page.locator('.side-nav-item[data-view="board"]').click();
    await page.locator('.card', { hasText: 'Carte cliquable' }).click();

    await expect(page.locator('#itemModal')).toHaveClass(/show/);
    await expect(page.locator('#ed_title')).toHaveValue('Carte cliquable');
  });

  test('cycleStatus fait défiler les 6 statuts du pipeline (AC6)', async ({ page }) => {
    const sectionId = await page.locator('.backlog-section.sprint-active-section').getAttribute('data-section');
    await createItemInline(page, { sectionId, title: 'Cycle' });

    const badge = page.locator('.backlog-row', { hasText: 'Cycle' }).locator('.status-badge');
    await expect(badge).toHaveText('À faire');
    for (const label of ['En cours', 'DEV', 'UAT', 'Go live', 'Terminé', 'À faire']) {
      await badge.click();
      await expect(badge).toHaveText(label);
    }
  });

  test('la modale détail expose les 6 options de statut (ordre pipeline)', async ({ page }) => {
    const sectionId = await page.locator('.backlog-section.sprint-active-section').getAttribute('data-section');
    await createItemInline(page, { sectionId, title: 'Modale statut' });

    await page.getByText('Modale statut', { exact: true }).first().click();
    await expect(page.locator('#itemModal')).toHaveClass(/show/);

    const values = await page.locator('#ed_status option').evaluateAll(os => os.map(o => o.value));
    expect(values).toEqual(['todo', 'doing', 'dev', 'uat', 'golive', 'done']);
  });

  test('DnD vers un stage (uat → golive) persiste après reload (AC2)', async ({ page }) => {
    const sectionId = await page.locator('.backlog-section.sprint-active-section').getAttribute('data-section');
    await createItemInline(page, { sectionId, title: 'Pipeline card' });

    await page.locator('.side-nav-item[data-view="board"]').click();
    await expect(page.locator('#kanbanBoard')).toBeVisible();

    // todo → uat
    await page.locator('.board-col[data-status="todo"] .card', { hasText: 'Pipeline card' })
      .dragTo(page.locator('.board-col[data-status="uat"] .board-col-body'));
    await expect(page.locator('.board-col[data-status="uat"] .card', { hasText: 'Pipeline card' })).toBeVisible();

    // uat → golive
    await page.locator('.board-col[data-status="uat"] .card', { hasText: 'Pipeline card' })
      .dragTo(page.locator('.board-col[data-status="golive"] .board-col-body'));
    await expect(page.locator('.board-col[data-status="golive"] .card', { hasText: 'Pipeline card' })).toBeVisible();
    await expect(page.locator('.board-col[data-status="golive"] .num')).toHaveText('1');

    // Persistance après reload (IndexedDB)
    await page.waitForTimeout(200);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.locator('#syncIndicator').waitFor({ state: 'visible' });
    await page.locator('.side-nav-item[data-view="board"]').click();
    await expect(page.locator('.board-col[data-status="golive"] .card', { hasText: 'Pipeline card' })).toBeVisible();
  });

  test('normalizeImportedState préserve dev/uat/golive et coerce l\'inconnu (AC3)', async ({ page }) => {
    const statuses = await page.evaluate(() => {
      const n = normalizeImportedState({ clients: [{ id: 'c1', name: 'X', key: 'XXX', items: [
        { id: 'i1', num: 1, title: 'a', type: 'task', priority: 2, status: 'dev' },
        { id: 'i2', num: 2, title: 'b', type: 'task', priority: 2, status: 'uat' },
        { id: 'i3', num: 3, title: 'c', type: 'task', priority: 2, status: 'golive' },
        { id: 'i4', num: 4, title: 'd', type: 'task', priority: 2, status: 'inconnu' },
      ] }] });
      return n.clients[0].items.map(it => it.status);
    });
    expect(statuses).toEqual(['dev', 'uat', 'golive', 'todo']);
  });
});
