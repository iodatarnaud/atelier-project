// WI-011 AC7 — Test board layout/scroll OBLIGATOIRE (P1#3 Codex levé : pas optionnel).
// Vérifie que `.main` ne scrolle pas verticalement quand vue board active, qu'au moins une
// `.board-col-body` scrolle (pour s'assurer que le test est non-trivial), et que sprint header
// + headers colonnes restent visibles après scroll interne.
const { test, expect, resetApp, createClient, createSprint, createItemInline } = require('./helpers');

test.use({ viewport: { width: 1440, height: 900 } });

test.describe('Board scroll layout — vue Sprint actif (WI-011 / ATE-30)', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
    await createClient(page, { name: 'Test', key: 'TST' });
    await createSprint(page, { name: 'Sprint scroll' });
  });

  test('AC7 — `.main.view-board` ne scrolle pas verticalement, `.board-col-body` scrolle, headers visibles', async ({ page }) => {
    // Crée 15+ cartes dans la colonne `À faire` du sprint actif (overflow garanti sur 1440x900).
    const sectionId = await page.locator('.backlog-section.sprint-active-section').getAttribute('data-section');
    for (let i = 1; i <= 16; i++) {
      await createItemInline(page, { sectionId, title: `Card scroll ${i}` });
    }

    // Aller sur vue Sprint actif.
    await page.locator('.side-nav-item[data-view="board"]').click();
    await expect(page.locator('.main.view-board')).toBeVisible();

    // AC7 assertion 1 : `.main` ne scrolle pas verticalement (P1#1 Codex — cible le bon conteneur).
    const mainScroll = await page.evaluate(() => {
      const m = document.querySelector('.main');
      return { scrollHeight: m.scrollHeight, clientHeight: m.clientHeight };
    });
    expect(mainScroll.scrollHeight).toBeLessThanOrEqual(mainScroll.clientHeight + 1);

    // AC7 assertion 2 : au moins une `.board-col-body` scrolle (test non-trivial).
    const someColScrolls = await page.evaluate(() => {
      const bodies = Array.from(document.querySelectorAll('.board-col-body'));
      return bodies.some(b => b.scrollHeight > b.clientHeight + 1);
    });
    expect(someColScrolls).toBe(true);

    // AC7 assertion 3 : sprint header reste visible.
    await expect(page.locator('.sprint-header')).toBeVisible();

    // AC7 assertion 4 : header de la colonne longue reste visible après scroll interne.
    // Scroll au milieu de la colonne `todo` (la longue).
    await page.evaluate(() => {
      const colBody = document.querySelector('.board-col[data-status="todo"] .board-col-body');
      if (colBody) colBody.scrollTop = colBody.scrollHeight / 2;
    });
    await expect(page.locator('.board-col[data-status="todo"] .board-col-head')).toBeVisible();
    // Et `.main` ne s'est pas mis à scroller à cause du scroll interne.
    const mainScrollTopAfter = await page.evaluate(() => document.querySelector('.main').scrollTop);
    expect(mainScrollTopAfter).toBe(0);
  });

  test('AC4 — la classe `.view-board` est posée seulement sur vue board (pas sur backlog/archive/calendar)', async ({ page }) => {
    // Backlog par défaut au boot après createClient → vérifions que .view-board n'est PAS là.
    const onBacklog = await page.evaluate(() => document.querySelector('.main').classList.contains('view-board'));
    expect(onBacklog).toBe(false);

    // Switch vers board → classe posée.
    await page.locator('.side-nav-item[data-view="board"]').click();
    await expect(page.locator('.main.view-board')).toBeVisible();

    // Switch vers archive → classe retirée.
    await page.locator('.side-nav-item[data-view="archive"]').click();
    const onArchive = await page.evaluate(() => document.querySelector('.main').classList.contains('view-board'));
    expect(onArchive).toBe(false);

    // Switch vers calendar → classe toujours pas posée.
    await page.locator('.side-nav-item[data-view="calendar"]').click();
    const onCalendar = await page.evaluate(() => document.querySelector('.main').classList.contains('view-board'));
    expect(onCalendar).toBe(false);
  });

  test('Boundary — sprint vide : colonnes visibles et non collapsées sans scroll principal', async ({ page }) => {
    await page.locator('.side-nav-item[data-view="board"]').click();
    await expect(page.locator('.main.view-board')).toBeVisible();
    await expect(page.locator('#kanbanBoard')).toBeVisible();

    const layout = await page.evaluate(() => {
      const main = document.querySelector('.main');
      const cols = Array.from(document.querySelectorAll('.board-col')).map(col => ({
        height: col.getBoundingClientRect().height,
        bodyHeight: col.querySelector('.board-col-body').getBoundingClientRect().height,
      }));
      return {
        mainScrollHeight: main.scrollHeight,
        mainClientHeight: main.clientHeight,
        cols,
      };
    });

    expect(layout.mainScrollHeight).toBeLessThanOrEqual(layout.mainClientHeight + 1);
    expect(layout.cols).toHaveLength(6);
    for (const col of layout.cols) {
      expect(col.height).toBeGreaterThan(100);
      expect(col.bodyHeight).toBeGreaterThan(50);
    }
    await expect(page.locator('.board-col-body', { hasText: 'Vide' })).toHaveCount(6);
  });

  test('Boundary — aller-retour board → backlog → board garde `.view-board` cohérente', async ({ page }) => {
    await page.locator('.side-nav-item[data-view="board"]').click();
    await expect(page.locator('.main.view-board')).toBeVisible();

    await page.locator('.side-nav-item[data-view="backlog"]').click();
    await expect(page.locator('.main.view-board')).toHaveCount(0);
    await expect(page.locator('.backlog-section.sprint-active-section')).toBeVisible();

    await page.locator('.side-nav-item[data-view="board"]').click();
    await expect(page.locator('.main.view-board')).toBeVisible();
    await expect(page.locator('#kanbanBoard')).toBeVisible();

    const mainScroll = await page.evaluate(() => {
      const main = document.querySelector('.main');
      return { scrollHeight: main.scrollHeight, clientHeight: main.clientHeight, scrollTop: main.scrollTop };
    });
    expect(mainScroll.scrollHeight).toBeLessThanOrEqual(mainScroll.clientHeight + 1);
    expect(mainScroll.scrollTop).toBe(0);
  });

  test('WI-013 AC5 — 6 colonnes ≥ 280px, board scroll horizontal, pas de scroll horizontal de la page', async ({ page }) => {
    await page.locator('.side-nav-item[data-view="board"]').click();
    await expect(page.locator('#kanbanBoard')).toBeVisible();

    const m = await page.evaluate(() => {
      const board = document.querySelector('#kanbanBoard');
      const main = document.querySelector('.main');
      const widths = Array.from(document.querySelectorAll('.board-col')).map(c => c.getBoundingClientRect().width);
      return {
        colCount: widths.length,
        minColWidth: Math.min(...widths),
        boardScrollsX: board.scrollWidth > board.clientWidth + 1,
        mainNoScrollX: main.scrollWidth <= main.clientWidth + 1,
        bodyNoScrollX: document.body.scrollWidth <= document.documentElement.clientWidth + 1,
      };
    });

    expect(m.colCount).toBe(6);
    expect(m.minColWidth).toBeGreaterThanOrEqual(279);   // min-width 280px (tolérance sub-pixel)
    expect(m.boardScrollsX).toBe(true);                  // 6×280 + gaps > largeur board sur 1440px → scroll interne
    expect(m.mainNoScrollX).toBe(true);                  // le débordement reste dans `.board`, pas dans `.main`
    expect(m.bodyNoScrollX).toBe(true);                  // ni dans la page
  });
});
