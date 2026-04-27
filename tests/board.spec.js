const { test, expect, resetApp, createClient, createSprint, createItemInline } = require('./helpers');

test.beforeEach(async ({ page }) => {
  await resetApp(page);
  await createClient(page, { name: 'Acme', key: 'ACM' });
  await createSprint(page, { name: 'Sprint 1' });
});

test.describe('Board (Kanban)', () => {
  test('affiche les 3 colonnes avec un état vide', async ({ page }) => {
    await page.locator('.side-nav-item[data-view="board"]').click();
    await expect(page.locator('#kanbanBoard')).toBeVisible();

    await expect(page.locator('.board-col[data-status="todo"]')).toBeVisible();
    await expect(page.locator('.board-col[data-status="doing"]')).toBeVisible();
    await expect(page.locator('.board-col[data-status="done"]')).toBeVisible();

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
});
