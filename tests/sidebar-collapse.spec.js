// WI-014 (ATE-35) — Sidebar repliable (collapse total via chevron).
const { test, expect, resetApp } = require('./helpers');

test.use({ viewport: { width: 1280, height: 800 } });

test.describe('Sidebar repliable (WI-014)', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
  });

  test('le chevron replie puis déplie la sidebar (largeur restaurée)', async ({ page }) => {
    const app = page.locator('.app');
    const sidebar = page.locator('.sidebar');
    const toggle = page.locator('#sidebarToggle');

    await expect(app).not.toHaveClass(/sidebar-collapsed/);
    const widthOpen = (await sidebar.boundingBox()).width;
    expect(widthOpen).toBeGreaterThan(100);

    // Replier
    await toggle.click();
    await expect(app).toHaveClass(/sidebar-collapsed/);
    const boxCollapsed = await sidebar.boundingBox();
    const collapsedWidth = boxCollapsed ? boxCollapsed.width : 0;
    expect(collapsedWidth).toBeLessThan(2);

    // Déplier → largeur d'avant restaurée
    await toggle.click();
    await expect(app).not.toHaveClass(/sidebar-collapsed/);
    expect((await sidebar.boundingBox()).width).toBe(widthOpen);
  });

  test('le glyphe du chevron reflète l\'état (‹ déplié / › replié)', async ({ page }) => {
    const glyph = () => page.evaluate(
      () => getComputedStyle(document.querySelector('.sidebar-toggle'), '::before').content
    );
    expect(await glyph()).toContain('‹');
    await page.locator('#sidebarToggle').click();
    expect(await glyph()).toContain('›');
  });

  test('l\'état replié est persisté après reload', async ({ page }) => {
    await page.locator('#sidebarToggle').click();
    await expect(page.locator('.app')).toHaveClass(/sidebar-collapsed/);

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.locator('#syncIndicator').waitFor({ state: 'visible' });

    await expect(page.locator('.app')).toHaveClass(/sidebar-collapsed/);
    const stored = await page.evaluate(() => localStorage.getItem('atelier-sidebar-collapsed'));
    expect(stored).toBe('1');
  });

  test('la poignée de resize est masquée quand la sidebar est repliée', async ({ page }) => {
    const resizer = page.locator('#sidebarResizer');
    await expect(resizer).toBeVisible();
    await page.locator('#sidebarToggle').click();
    await expect(resizer).toBeHidden();
  });

  test('la largeur resize (--sidebar-width) est préservée après un cycle replier/déplier', async ({ page }) => {
    await page.evaluate(() => document.documentElement.style.setProperty('--sidebar-width', '320px'));

    await page.locator('#sidebarToggle').click(); // replier
    await page.locator('#sidebarToggle').click(); // déplier

    const after = await page.evaluate(
      () => getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width').trim()
    );
    expect(after).toBe('320px');
  });
});
