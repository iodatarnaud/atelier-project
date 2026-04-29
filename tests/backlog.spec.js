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
    await page.locator('#itemModal .modal-actions .btn-primary').click();
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

  test('ATE-17 : description ne déborde pas en largeur même avec contenu .md collé', async ({ page }) => {
    await createItemInline(page, { title: 'Overflow check' });
    await openItemDetailByTitle(page, 'Overflow check');

    // Simule un .md collé : ligne sans espace + URL très longue (les 2 cas qui
    // poussaient la modale à déborder horizontalement avant le fix CSS).
    const longContent = 'A'.repeat(500) + ' https://example.com/' + 'x'.repeat(500);
    await page.locator('#ed_desc').evaluate((el, content) => {
      el.innerHTML = content;
    }, longContent);

    // Le rich-editor wrap son contenu — pas de scroll horizontal.
    const editorOverflows = await page.locator('#ed_desc').evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(editorOverflows).toBe(false);

    // Et la modale entière non plus (le grid minmax(0, 1fr) empêche l'expansion).
    const modalOverflows = await page.locator('#itemModal .modal').evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(modalOverflows).toBe(false);
  });

  test('ATE-18 : footer modale détail item reste visible (sticky) avec contenu long', async ({ page }) => {
    // Viewport réduit pour forcer le débordement de la modale.
    await page.setViewportSize({ width: 1280, height: 600 });
    await createItemInline(page, { title: 'Sticky footer check' });
    await openItemDetailByTitle(page, 'Sticky footer check');

    // Injecte un contenu de description très long pour forcer la modale à scroller.
    const longDesc = Array(50).fill('<p>Ligne de description pour forcer le scroll vertical.</p>').join('');
    await page.locator('#ed_desc').evaluate((el, html) => { el.innerHTML = html; }, longDesc);

    // Vérifie que la modale déborde réellement (pré-condition du test, évite
    // un faux positif si jamais le contenu ne suffisait plus à déclencher le scroll).
    const overflows = await page.locator('#itemModal .modal').evaluate((el) => el.scrollHeight > el.clientHeight);
    expect(overflows).toBe(true);

    // Le footer (avec Enregistrer/Annuler/Supprimer) doit rester dans la viewport.
    const footer = page.locator('#itemModal .modal-actions');
    await expect(footer).toBeInViewport();
    await expect(footer.locator('.btn-primary', { hasText: 'Enregistrer' })).toBeInViewport();
  });

  test('ATE-18 : footer modale Nouveau Sprint visible d\'emblée', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 500 });
    await page.locator('button[title="Nouveau sprint"]').click();
    await expect(page.locator('#sprintModal')).toHaveClass(/show/);
    const footer = page.locator('#sprintModal .modal-actions');
    await expect(footer).toBeInViewport();
  });

  test('ATE-18 : footer modale de confirmation visible d\'emblée', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 500 });
    await createItemInline(page, { title: 'À confirmer' });
    const row = page.locator('.backlog-row', { hasText: 'À confirmer' });
    await row.hover();
    await row.locator('.row-action').click({ force: true });
    await expect(page.locator('#confirmModal')).toHaveClass(/show/);
    const footer = page.locator('#confirmModal .modal-actions');
    await expect(footer).toBeInViewport();
    await expect(page.locator('#confirmOk')).toBeInViewport();
  });

  test('ATE-18 anti-régression Settings : seul le DERNIER .modal-actions est sticky (pas le bouton mode test du milieu)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.locator('#syncIndicator').click();
    await expect(page.locator('#settingsModal')).toHaveClass(/show/);

    // Vérifie que le CSS sticky n'est appliqué qu'au dernier .modal-actions.
    const stickyStates = await page.locator('#settingsModal .modal-actions').evaluateAll((els) =>
      els.map(el => getComputedStyle(el).position)
    );
    // 2+ blocs .modal-actions, dont seul le dernier doit être 'sticky'.
    expect(stickyStates.length).toBeGreaterThanOrEqual(2);
    expect(stickyStates[stickyStates.length - 1]).toBe('sticky');
    // Tous les autres doivent être 'static' (pas sticky).
    for (let i = 0; i < stickyStates.length - 1; i++) {
      expect(stickyStates[i]).not.toBe('sticky');
    }
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
