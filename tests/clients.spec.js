const { test, expect, resetApp, createClient, createSprint, createItemInline, openSidebarItemAction } = require('./helpers');

test.beforeEach(async ({ page }) => {
  await resetApp(page);
});

test.describe('Clients', () => {
  test('crée un client et l\'active automatiquement', async ({ page }) => {
    await createClient(page, { name: 'Acme', key: 'ACM' });

    await expect(page.locator('#clientList .side-item')).toHaveCount(1);
    await expect(page.locator('#clientList .side-item.active')).toContainText('Acme');
    await expect(page.locator('#bcClient')).toContainText('Acme');
  });

  test('crée plusieurs clients et bascule entre eux', async ({ page }) => {
    await createClient(page, { name: 'Acme', key: 'ACM' });
    await createClient(page, { name: 'Beta', key: 'BTA' });

    await expect(page.locator('#clientList .side-item')).toHaveCount(2);
    // Le dernier créé est actif
    await expect(page.locator('#clientList .side-item.active')).toContainText('Beta');

    // Bascule manuelle vers Acme
    await page.locator('#clientList .side-item', { hasText: 'Acme' }).click();
    await expect(page.locator('#clientList .side-item.active')).toContainText('Acme');
    await expect(page.locator('#bcClient')).toContainText('Acme');
  });

  test('le formulaire client refuse un nom vide', async ({ page }) => {
    await page.locator('button[title="Ajouter un projet"]').click();
    await expect(page.locator('#clientModal')).toHaveClass(/show/);

    await page.locator('#clientModal button.btn-primary').click();
    // Le modal doit rester ouvert (createClient bloque sur name vide)
    await expect(page.locator('#clientModal')).toHaveClass(/show/);
    await expect(page.locator('#clientList .side-item')).toHaveCount(0);
  });

  test('la clé est auto-générée à partir du nom', async ({ page }) => {
    await page.locator('button[title="Ajouter un projet"]').click();
    await page.locator('#clientName').fill('Globex');
    // L'écouteur sur clientName remplit la clé en uppercase 3 lettres
    await expect(page.locator('#clientKey')).toHaveValue('GLO');
  });
});

test.describe('Clients — suppression', () => {
  test('supprime un projet vide via la modal de confirmation', async ({ page }) => {
    await createClient(page, { name: 'Acme', key: 'ACM' });
    await createClient(page, { name: 'Beta', key: 'BTA' });
    await expect(page.locator('#clientList .side-item')).toHaveCount(2);

    const acmeRow = page.locator('#clientList .side-item', { hasText: 'Acme' });
    await openSidebarItemAction(page, acmeRow, 'Supprimer');

    await expect(page.locator('#confirmModal')).toHaveClass(/show/);
    await expect(page.locator('#confirmTitle')).toHaveText('Supprimer ce projet ?');
    await expect(page.locator('#confirmMessage')).toContainText('Acme');
    await page.locator('#confirmOk').click();
    await expect(page.locator('#confirmModal')).not.toHaveClass(/show/);

    await expect(page.locator('#clientList .side-item')).toHaveCount(1);
    await expect(page.locator('#clientList .side-item')).toContainText('Beta');
  });

  test('refuse la suppression si le projet contient des items (toast)', async ({ page }) => {
    await createClient(page, { name: 'Acme', key: 'ACM' });
    await createItemInline(page, { title: 'Item bloquant' });

    const acmeRow = page.locator('#clientList .side-item', { hasText: 'Acme' });
    await openSidebarItemAction(page, acmeRow, 'Supprimer');

    // La modal de confirmation NE doit PAS s'ouvrir
    await expect(page.locator('#confirmModal')).not.toHaveClass(/show/);
    // Toast d'avertissement avec le bon message
    await expect(page.locator('#toast')).toContainText('Impossible de supprimer');
    // Client toujours présent
    await expect(page.locator('#clientList .side-item')).toHaveCount(1);
  });

  test('refuse la suppression si le projet contient des sprints', async ({ page }) => {
    await createClient(page, { name: 'Acme', key: 'ACM' });
    await createSprint(page, { name: 'Sprint 1' });

    const acmeRow = page.locator('#clientList .side-item', { hasText: 'Acme' });
    await openSidebarItemAction(page, acmeRow, 'Supprimer');

    await expect(page.locator('#confirmModal')).not.toHaveClass(/show/);
    await expect(page.locator('#toast')).toContainText('Impossible de supprimer');
    await expect(page.locator('#clientList .side-item')).toHaveCount(1);
  });

  test('supprimer le projet actif bascule sur un autre projet', async ({ page }) => {
    await createClient(page, { name: 'Acme', key: 'ACM' });
    await createClient(page, { name: 'Beta', key: 'BTA' });
    // Beta est actif (dernier créé)
    await expect(page.locator('#clientList .side-item.active')).toContainText('Beta');

    const betaRow = page.locator('#clientList .side-item', { hasText: 'Beta' });
    await openSidebarItemAction(page, betaRow, 'Supprimer');
    await page.locator('#confirmOk').click();

    // Bascule automatique sur Acme (le seul restant)
    await expect(page.locator('#clientList .side-item')).toHaveCount(1);
    await expect(page.locator('#clientList .side-item.active')).toContainText('Acme');
    await expect(page.locator('#bcClient')).toContainText('Acme');
  });

  test('supprimer le dernier projet ramène à l\'empty state', async ({ page }) => {
    await createClient(page, { name: 'Acme', key: 'ACM' });

    const acmeRow = page.locator('#clientList .side-item', { hasText: 'Acme' });
    await openSidebarItemAction(page, acmeRow, 'Supprimer');
    await page.locator('#confirmOk').click();

    await expect(page.locator('#clientList .side-item')).toHaveCount(0);
    await expect(page.locator('#viewContent')).toContainText('Aucun projet');
  });
});

test.describe('Sidebar — compteurs par projet', () => {
  // Régression : la pastille "En cours" filtrait sur status === 'progress' alors
  // que la valeur réelle des items est 'doing'. Le compteur restait à 0.
  test('les pastilles todo/progress/done reflètent le statut réel des items', async ({ page }) => {
    await createClient(page, { name: 'Acme', key: 'ACM' });
    await createItemInline(page, { title: 'Item à suivre' });

    const todo = page.locator('#clientList .side-item [data-stat-key="todo"]');
    const progress = page.locator('#clientList .side-item [data-stat-key="progress"]');
    const done = page.locator('#clientList .side-item [data-stat-key="done"]');

    // À la création, status = todo
    await expect(todo).toHaveText('1');
    await expect(progress).toHaveText('0');
    await expect(done).toHaveText('0');

    // 1er clic sur le badge : todo → doing → la pastille "En cours" passe à 1
    const badge = page.locator('.backlog-row', { hasText: 'Item à suivre' }).locator('.status-badge');
    await badge.click();
    await expect(todo).toHaveText('0');
    await expect(progress).toHaveText('1');
    await expect(done).toHaveText('0');

    // 2e clic : doing → done
    await badge.click();
    await expect(todo).toHaveText('0');
    await expect(progress).toHaveText('0');
    await expect(done).toHaveText('1');
  });
});
