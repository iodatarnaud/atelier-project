const { test, expect, resetApp, createClient, createItemInline, openItemDetailByTitle } = require('./helpers');

test.beforeEach(async ({ page }) => {
  await resetApp(page);
  await createClient(page, { name: 'Acme', key: 'ACM' });
});

test.describe('Backlog — CRUD items', () => {
  test('crée un item via le formulaire inline', async ({ page }) => {
    await createItemInline(page, { title: 'Configurer SSO', type: 'story', priority: 1, estimate: 2 });

    const row = page.locator('.backlog-row', { hasText: 'Configurer SSO' });
    await expect(row).toBeVisible();
    await expect(row.locator('.row-key')).toHaveText('ACM-1');
    await expect(row.locator('.type-ico')).toHaveClass(/type-story/);
    await expect(row.locator('.prio-ico')).toHaveClass(/prio-1/);
    await expect(row.locator('.est-badge')).toHaveText('2');
    await expect(row.locator('.status-badge')).toHaveText('À faire');
  });

  test('crée plusieurs items et incrémente le compteur', async ({ page }) => {
    await createItemInline(page, { title: 'Item A' });
    await createItemInline(page, { title: 'Item B' });
    await createItemInline(page, { title: 'Item C' });

    await expect(page.locator('.backlog-row')).toHaveCount(3);
    await expect(page.locator('.backlog-row').nth(0).locator('.row-key')).toHaveText('ACM-1');
    await expect(page.locator('.backlog-row').nth(2).locator('.row-key')).toHaveText('ACM-3');
  });

  test('ouvre la modal détail et modifie titre + statut', async ({ page }) => {
    await createItemInline(page, { title: 'Original' });

    await openItemDetailByTitle(page, 'Original');
    await page.locator('#ed_title').fill('Modifié');
    await page.locator('#ed_status').selectOption('doing');
    await page.locator('#ed_desc').fill('Une description');
    await page.locator('#itemModal button.btn-primary').click();
    await expect(page.locator('#itemModal')).not.toHaveClass(/show/);

    const row = page.locator('.backlog-row', { hasText: 'Modifié' });
    await expect(row).toBeVisible();
    await expect(row.locator('.status-badge')).toHaveText('En cours');
  });

  test('cycle de statut via le badge inline (todo → doing → done → archive)', async ({ page }) => {
    await createItemInline(page, { title: 'Task X' });
    const backlogBadge = page.locator('[data-section="backlog"] .backlog-row', { hasText: 'Task X' }).locator('.status-badge');

    await expect(backlogBadge).toHaveText('À faire');
    await backlogBadge.click();
    await expect(backlogBadge).toHaveText('En cours');

    // Click suivant : passe en "Terminé" → l'item disparaît du backlog (filtré)
    await backlogBadge.click();
    await expect(page.locator('[data-section="backlog"] .backlog-row', { hasText: 'Task X' })).toHaveCount(0);

    // L'item est maintenant dans l'archive
    await page.locator('.side-nav-item[data-view="archive"]').click();
    const archiveBadge = page.locator('.backlog-row', { hasText: 'Task X' }).locator('.status-badge');
    await expect(archiveBadge).toHaveText('Terminé');

    // Click depuis l'archive : repasse à "À faire" → disparaît de l'archive
    await archiveBadge.click();
    await expect(page.locator('.backlog-row', { hasText: 'Task X' })).toHaveCount(0);
  });

  test('supprime un item via la modal de confirmation', async ({ page }) => {
    await createItemInline(page, { title: 'Doomed' });
    const row = page.locator('.backlog-row', { hasText: 'Doomed' });

    await row.hover();
    await row.locator('.row-action').click({ force: true });

    await expect(page.locator('#confirmModal')).toHaveClass(/show/);
    await expect(page.locator('#confirmMessage')).toContainText('Doomed');
    await page.locator('#confirmOk').click();
    await expect(page.locator('#confirmModal')).not.toHaveClass(/show/);

    await expect(page.locator('.backlog-row', { hasText: 'Doomed' })).toHaveCount(0);
  });
});

test.describe('Backlog — filtres et recherche', () => {
  test.beforeEach(async ({ page }) => {
    await createItemInline(page, { title: 'Story haute', type: 'story', priority: 1 });
    await createItemInline(page, { title: 'Bug moyen', type: 'bug', priority: 2 });
    await createItemInline(page, { title: 'TMA basse', type: 'task', priority: 3 });
  });

  test('filtre par type via les chips', async ({ page }) => {
    await page.locator('.filter-chip[data-type="bug"]').click();
    await expect(page.locator('.backlog-row')).toHaveCount(1);
    await expect(page.locator('.backlog-row')).toContainText('Bug moyen');

    await page.locator('.filter-chip[data-type=""]').click();
    await expect(page.locator('.backlog-row')).toHaveCount(3);
  });

  test('filtre par priorité via le select', async ({ page }) => {
    await page.locator('#prioFilter').selectOption('1');
    await expect(page.locator('.backlog-row')).toHaveCount(1);
    await expect(page.locator('.backlog-row')).toContainText('Story haute');

    await page.locator('#prioFilter').selectOption('');
    await expect(page.locator('.backlog-row')).toHaveCount(3);
  });

  test('combine filtre type + priorité', async ({ page }) => {
    await page.locator('.filter-chip[data-type="task"]').click();
    await page.locator('#prioFilter').selectOption('3');
    await expect(page.locator('.backlog-row')).toHaveCount(1);
    await expect(page.locator('.backlog-row')).toContainText('TMA basse');
  });

  test('recherche plein-texte via la topbar filtre les rows', async ({ page }) => {
    await page.locator('#searchInput').fill('haute');
    await expect(page.locator('.backlog-row')).toHaveCount(1);
    await expect(page.locator('.backlog-row')).toContainText('Story haute');

    await page.locator('#searchInput').fill('');
    await expect(page.locator('.backlog-row')).toHaveCount(3);
  });
});
