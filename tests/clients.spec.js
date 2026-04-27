const { test, expect, resetApp, createClient } = require('./helpers');

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
