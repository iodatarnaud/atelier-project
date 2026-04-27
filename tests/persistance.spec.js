const { test, expect, resetApp, createClient, createSprint, createItemInline } = require('./helpers');

test.beforeEach(async ({ page }) => {
  await resetApp(page);
});

test.describe('Persistance (IndexedDB)', () => {
  test('clients, sprints et items survivent à un reload', async ({ page }) => {
    await createClient(page, { name: 'Acme', key: 'ACM' });
    await createSprint(page, { name: 'Sprint 1' });
    const sectionId = await page.locator('.backlog-section.sprint-active-section').getAttribute('data-section');
    await createItemInline(page, { sectionId, title: 'Item du sprint', estimate: 1.5 });
    await createItemInline(page, { title: 'Item backlog' });

    // Attend que le debounce de saveState (50ms) ait écrit
    await page.waitForTimeout(200);

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.locator('#syncIndicator').waitFor({ state: 'visible' });

    // Le client est restauré et actif
    await expect(page.locator('#clientList .side-item')).toHaveCount(1);
    await expect(page.locator('#clientList .side-item.active')).toContainText('Acme');

    // Le sprint est restauré et toujours actif
    await expect(page.locator('.backlog-section.sprint-active-section')).toContainText('Sprint 1');

    // Les items sont là
    await expect(page.locator('.backlog-row', { hasText: 'Item du sprint' })).toBeVisible();
    await expect(page.locator('.backlog-row', { hasText: 'Item backlog' })).toBeVisible();
  });

  test('le statut d\'un item est persisté', async ({ page }) => {
    await createClient(page, { name: 'Acme', key: 'ACM' });
    await createItemInline(page, { title: 'En progression' });

    const badge = page.locator('.backlog-row', { hasText: 'En progression' }).locator('.status-badge');
    await badge.click(); // → doing
    await expect(badge).toHaveText('En cours');
    await page.waitForTimeout(200);

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.locator('#syncIndicator').waitFor({ state: 'visible' });

    await expect(
      page.locator('.backlog-row', { hasText: 'En progression' }).locator('.status-badge')
    ).toHaveText('En cours');
  });

  test('le client actif est restauré au reload (état UI partiel)', async ({ page }) => {
    // Note: l'app ne persiste PAS state.activeView (switchView ne fait pas saveState),
    // donc au reload on retombe toujours sur "Backlog" — comportement actuel documenté ici.
    await createClient(page, { name: 'Acme', key: 'ACM' });
    await createClient(page, { name: 'Beta', key: 'BTA' });
    // Beta est actif (dernier créé)
    await page.waitForTimeout(200);

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.locator('#syncIndicator').waitFor({ state: 'visible' });

    await expect(page.locator('#clientList .side-item.active')).toContainText('Beta');
    // La vue revient toujours sur Backlog après reload (non-régression de ce comportement)
    await expect(page.locator('#pageTitle')).toHaveText('Backlog');
  });
});
