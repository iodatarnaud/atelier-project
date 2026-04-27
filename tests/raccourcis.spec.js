const { test, expect, resetApp, createClient } = require('./helpers');

test.beforeEach(async ({ page }) => {
  await resetApp(page);
  await createClient(page, { name: 'Acme', key: 'ACM' });
});

test.describe('Raccourcis clavier', () => {
  test('Ctrl+C ouvre le formulaire inline du backlog', async ({ page }) => {
    // S'assure qu'on est sur backlog
    await expect(page.locator('#pageTitle')).toHaveText('Backlog');

    // Le form est caché au départ
    await expect(page.locator('#form-backlog')).toBeHidden();

    await page.keyboard.press('Control+c');

    await expect(page.locator('#form-backlog')).toBeVisible();
    // Focus est sur le champ titre
    await expect(page.locator('#form-backlog .if-title')).toBeFocused();
  });

  test('Ctrl+C depuis la vue archive bascule sur backlog et ouvre le form', async ({ page }) => {
    await page.locator('.side-nav-item[data-view="archive"]').click();
    await expect(page.locator('#pageTitle')).toHaveText('Archive');

    await page.keyboard.press('Control+c');

    await expect(page.locator('#pageTitle')).toHaveText('Backlog');
    await expect(page.locator('#form-backlog')).toBeVisible();
  });

  test('Échap ferme un modal ouvert', async ({ page }) => {
    await page.locator('button[title="Nouveau sprint"]').click();
    await expect(page.locator('#sprintModal')).toHaveClass(/show/);

    await page.keyboard.press('Escape');

    await expect(page.locator('#sprintModal')).not.toHaveClass(/show/);
  });

  test('Clic sur l\'overlay ferme le modal', async ({ page }) => {
    await page.locator('button[title="Nouveau sprint"]').click();
    await expect(page.locator('#sprintModal')).toHaveClass(/show/);

    // Clic en haut de l'overlay (en dehors du contenu modal)
    await page.locator('#sprintModal').click({ position: { x: 10, y: 10 } });
    await expect(page.locator('#sprintModal')).not.toHaveClass(/show/);
  });
});
