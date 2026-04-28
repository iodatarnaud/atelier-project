const { test, expect, resetApp, createClient, createItemInline } = require('./helpers');

test.describe('Mode test', () => {
  test('le banner et le seed démo apparaissent quand le flag est actif', async ({ page }) => {
    // Set le flag AVANT le premier load — sinon resetApp() reset à un état vide.
    await page.addInitScript(() => {
      try { localStorage.setItem('atelier-mode-test', '1'); } catch (e) {}
    });
    await page.goto('/index.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(200);

    // Banner visible
    await expect(page.locator('#testModeBanner')).toBeVisible();
    await expect(page.locator('#testModeBanner')).toContainText('Mode test actif');

    // 4 projets démo chargés
    await expect(page.locator('#clientList .side-item')).toHaveCount(4);
    await expect(page.locator('#clientList')).toContainText('Acme');
    await expect(page.locator('#clientList')).toContainText('Globex');
    await expect(page.locator('#clientList')).toContainText('Initech');
    await expect(page.locator('#clientList')).toContainText('Hooli');

    // Sync indicator en mode local "Mode test"
    await expect(page.locator('#syncLabel')).toContainText('Mode test');
  });

  test('en mode test, les modifs sont volatiles : refresh = seed propre', async ({ page }) => {
    await page.addInitScript(() => {
      try { localStorage.setItem('atelier-mode-test', '1'); } catch (e) {}
    });
    await page.goto('/index.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(200);

    // Acme est actif (premier projet du seed)
    const itemCountBefore = await page.locator('.backlog-row').count();

    // Crée un item sur le projet actif
    await createItemInline(page, { title: 'Item volatile en mode test' });
    await expect(page.locator('.backlog-row', { hasText: 'Item volatile en mode test' })).toBeVisible();

    // Refresh — l'item doit disparaître, on retombe sur le seed propre
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(200);

    await expect(page.locator('#testModeBanner')).toBeVisible();
    await expect(page.locator('.backlog-row', { hasText: 'Item volatile en mode test' })).toHaveCount(0);
    // Compteur d'items revenu à l'état initial du seed
    const itemCountAfter = await page.locator('.backlog-row').count();
    expect(itemCountAfter).toBe(itemCountBefore);
  });

  test('hors mode test : pas de banner, pas de seed démo (avec __SKIP_SEED__)', async ({ page }) => {
    // Pas de flag posé — la fixture default désactive __SKIP_SEED__ aussi
    await resetApp(page);

    await expect(page.locator('#testModeBanner')).toBeHidden();
    // Aucun projet (DB vide + SKIP_SEED)
    await expect(page.locator('#clientList .side-item')).toHaveCount(0);
  });

  test('toggle depuis la modale Paramètres recharge la page en mode test', async ({ page }) => {
    await resetApp(page);
    await createClient(page, { name: 'MonProjetReel', key: 'MPR' });

    // Vérifie qu'on n'est pas en mode test au départ
    await expect(page.locator('#testModeBanner')).toBeHidden();

    // Ouvre la modale + clique le bouton "Activer le mode test"
    // Le confirm() natif est auto-accepté
    page.once('dialog', d => d.accept());
    await page.locator('#syncIndicator').click();
    await expect(page.locator('#settingsModal')).toHaveClass(/show/);
    await page.locator('#testModeBtn').click();

    // La page reload → on attend que le banner soit là et le seed démo aussi
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(300);
    await expect(page.locator('#testModeBanner')).toBeVisible();
    await expect(page.locator('#clientList .side-item')).toHaveCount(4);

    // Le projet réel n'a PAS été touché : on désactive le mode test, il revient
    page.once('dialog', d => d.accept());
    await page.locator('#syncIndicator').click();
    await page.locator('#testModeBtn').click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(300);

    await expect(page.locator('#testModeBanner')).toBeHidden();
    await expect(page.locator('#clientList .side-item', { hasText: 'MonProjetReel' })).toBeVisible();
  });
});
