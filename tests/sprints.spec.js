const { test, expect, resetApp, createClient, createSprint, createItemInline, openItemDetailByTitle, openSidebarItemAction } = require('./helpers');

test.beforeEach(async ({ page }) => {
  await resetApp(page);
  await createClient(page, { name: 'Acme', key: 'ACM' });
});

test.describe('Sprints', () => {
  test('crée un sprint et l\'active automatiquement', async ({ page }) => {
    await createSprint(page, { name: 'Sprint 1' });

    // Le sprint apparaît dans la sidebar et dans le backlog comme section active
    await expect(page.locator('#sprintList')).toContainText('Sprint 1');
    await expect(page.locator('.backlog-section.sprint-active-section')).toContainText('Sprint 1');
    await expect(page.locator('.sprint-badge')).toContainText('Sprint actif');
  });

  test('refuse un sprint sans nom', async ({ page }) => {
    await page.locator('button[title="Nouveau sprint"]').click();
    await expect(page.locator('#sprintModal')).toHaveClass(/show/);
    // Vide le nom pré-rempli (vide par défaut, mais on s'assure)
    await page.locator('#sprintName').fill('');
    await page.locator('#sprintModal button.btn-primary').click();
    // Le modal reste ouvert
    await expect(page.locator('#sprintModal')).toHaveClass(/show/);
    await expect(page.locator('#sprintList .side-item')).toHaveCount(0);
  });

  test('assigne un item au sprint actif via la modal détail', async ({ page }) => {
    await createSprint(page, { name: 'Sprint 1' });
    await createItemInline(page, { title: 'Item backlog' });

    // Item est dans le backlog (section "backlog"), pas dans le sprint
    await expect(page.locator('[data-section="backlog"] .backlog-row')).toHaveCount(1);

    await openItemDetailByTitle(page, 'Item backlog');
    // Le select sprint propose "— Pas de sprint —" + le sprint créé
    await page.locator('#ed_sprint').selectOption({ label: 'Sprint 1' });
    await page.locator('#itemModal button.btn-primary').click();
    await expect(page.locator('#itemModal')).not.toHaveClass(/show/);

    // L'item est maintenant dans la section du sprint actif (data-section commence par 's')
    const sprintSection = page.locator('.backlog-section.sprint-active-section');
    await expect(sprintSection.locator('.backlog-row', { hasText: 'Item backlog' })).toBeVisible();
  });

  test('crée un item directement dans le sprint actif via son inline form', async ({ page }) => {
    await createSprint(page, { name: 'Sprint 1' });
    // Le data-section du sprint actif = son id (sXXXXX). On le récupère.
    const sectionId = await page.locator('.backlog-section.sprint-active-section').getAttribute('data-section');
    expect(sectionId).toBeTruthy();

    await createItemInline(page, { sectionId, title: 'Item du sprint', type: 'task', priority: 2 });
    const sprintSection = page.locator('.backlog-section.sprint-active-section');
    await expect(sprintSection.locator('.backlog-row', { hasText: 'Item du sprint' })).toBeVisible();
  });

  test('sidebar : sprint complété est visuellement distinct (suffixe « terminé »)', async ({ page }) => {
    await createSprint(page, { name: 'Sprint Q1' });

    page.once('dialog', d => d.accept());
    await page.locator('.side-nav-item[data-view="board"]').click();
    await page.locator('button', { hasText: 'Terminer le sprint' }).click();

    await expect(page.locator('#sprintList .side-item', { hasText: 'Sprint Q1' })).toContainText('terminé');
  });

  test('clôt un sprint et retourne items non-terminés au backlog', async ({ page }) => {
    await createSprint(page, { name: 'Sprint 1' });
    const sectionId = await page.locator('.backlog-section.sprint-active-section').getAttribute('data-section');

    await createItemInline(page, { sectionId, title: 'À finir' });
    await createItemInline(page, { sectionId, title: 'Terminé' });

    // Marque "Terminé" comme done en cliquant 2x sur le badge (todo→doing→done)
    const doneRow = page.locator('.backlog-row', { hasText: 'Terminé' });
    await doneRow.locator('.status-badge').click();
    await doneRow.locator('.status-badge').click();
    await expect(doneRow.locator('.status-badge')).toHaveText('Terminé');

    // Va sur la vue Board pour utiliser "Terminer le sprint"
    await page.locator('.side-nav-item[data-view="board"]').click();
    await expect(page.locator('#kanbanBoard')).toBeVisible();

    // completeSprint utilise window.confirm() — accepter avant le clic
    page.once('dialog', dialog => dialog.accept());
    await page.locator('button', { hasText: 'Terminer le sprint' }).click();

    // On retourne sur le backlog automatiquement
    await expect(page.locator('#pageTitle')).toHaveText('Backlog');
    // Plus de section sprint-active-section
    await expect(page.locator('.backlog-section.sprint-active-section')).toHaveCount(0);
    // L'item non-fini est dans le backlog
    await expect(page.locator('[data-section="backlog"] .backlog-row', { hasText: 'À finir' })).toBeVisible();
    // L'item terminé est dans l'archive
    await page.locator('.side-nav-item[data-view="archive"]').click();
    await expect(page.locator('.backlog-row', { hasText: 'Terminé' })).toBeVisible();
  });
});

test.describe('Sprints — suppression', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
    await createClient(page, { name: 'Acme', key: 'ACM' });
  });

  test('refuse la suppression d\'un sprint actif (toast)', async ({ page }) => {
    await createSprint(page, { name: 'Sprint actif' });
    // Sprint vient d'être créé, donc actif

    const row = page.locator('#sprintList .side-item', { hasText: 'Sprint actif' });
    await openSidebarItemAction(page, row, 'Supprimer');

    await expect(page.locator('#confirmModal')).not.toHaveClass(/show/);
    await expect(page.locator('#toast')).toContainText('actif');
    await expect(page.locator('#sprintList .side-item')).toHaveCount(1);
  });

  test('refuse la suppression d\'un sprint future avec items (toast)', async ({ page }) => {
    // Crée un sprint, puis un autre qui devient actif → premier passe en "future"
    await createSprint(page, { name: 'Sprint future' });
    const sectionId = await page.locator('.backlog-section.sprint-active-section').getAttribute('data-section');
    await createItemInline(page, { sectionId, title: 'Item dedans' });

    // Crée un 2e sprint qui prend l'actif (le 1er devient future non-actif avec items)
    await createSprint(page, { name: 'Sprint 2' });

    const row = page.locator('#sprintList .side-item', { hasText: 'Sprint future' });
    await openSidebarItemAction(page, row, 'Supprimer');

    await expect(page.locator('#confirmModal')).not.toHaveClass(/show/);
    await expect(page.locator('#toast')).toContainText('item');
    await expect(page.locator('#sprintList .side-item', { hasText: 'Sprint future' })).toHaveCount(1);
  });

  test('supprime un sprint future vide via modal de confirmation', async ({ page }) => {
    await createSprint(page, { name: 'À supprimer' });
    // Crée un 2e sprint pour que le 1er ne soit plus actif
    await createSprint(page, { name: 'Nouveau actif' });

    const row = page.locator('#sprintList .side-item', { hasText: 'À supprimer' });
    await openSidebarItemAction(page, row, 'Supprimer');

    await expect(page.locator('#confirmModal')).toHaveClass(/show/);
    await expect(page.locator('#confirmTitle')).toHaveText('Supprimer ce sprint ?');
    await page.locator('#confirmOk').click();

    await expect(page.locator('#sprintList .side-item', { hasText: 'À supprimer' })).toHaveCount(0);
    await expect(page.locator('#sprintList .side-item')).toHaveCount(1);
  });

  test('supprime un sprint complété vide directement', async ({ page }) => {
    await createSprint(page, { name: 'Sprint à clôturer' });
    page.once('dialog', d => d.accept());
    await page.locator('.side-nav-item[data-view="board"]').click();
    await page.locator('button', { hasText: 'Terminer le sprint' }).click();

    // Sprint est maintenant completed (et vide d'items)
    const row = page.locator('#sprintList .side-item', { hasText: 'Sprint à clôturer' });
    await expect(row).toContainText('terminé');
    await openSidebarItemAction(page, row, 'Supprimer');

    await expect(page.locator('#confirmModal')).toHaveClass(/show/);
    // Pas de mention d'items livrés (sprint vide)
    await expect(page.locator('#confirmMessage')).toContainText('définitivement');
    await page.locator('#confirmOk').click();

    await expect(page.locator('#sprintList .side-item')).toHaveCount(0);
  });

  test('supprime un sprint complété avec items done : warning + items restent dans Archive', async ({ page }) => {
    await createSprint(page, { name: 'Sprint avec done' });
    const sectionId = await page.locator('.backlog-section.sprint-active-section').getAttribute('data-section');
    await createItemInline(page, { sectionId, title: 'Livré 1' });
    await createItemInline(page, { sectionId, title: 'Livré 2' });

    // Marque les 2 items comme done (2 clicks chacun : todo → doing → done)
    for (const title of ['Livré 1', 'Livré 2']) {
      const badge = page.locator('.backlog-row', { hasText: title }).locator('.status-badge');
      await badge.click();
      await badge.click();
    }

    // Clôture le sprint
    page.once('dialog', d => d.accept());
    await page.locator('.side-nav-item[data-view="board"]').click();
    await page.locator('button', { hasText: 'Terminer le sprint' }).click();

    // Sprint completed avec 2 items done dedans → tente la suppression
    const row = page.locator('#sprintList .side-item', { hasText: 'Sprint avec done' });
    await openSidebarItemAction(page, row, 'Supprimer');

    await expect(page.locator('#confirmModal')).toHaveClass(/show/);
    // Warning fort : mention des items livrés
    await expect(page.locator('#confirmMessage')).toContainText('2 item');
    await expect(page.locator('#confirmMessage')).toContainText('Archive');
    await page.locator('#confirmOk').click();

    // Sprint disparu, items toujours dans l'Archive
    await expect(page.locator('#sprintList .side-item')).toHaveCount(0);
    await page.locator('.side-nav-item[data-view="archive"]').click();
    await expect(page.locator('.backlog-row', { hasText: 'Livré 1' })).toBeVisible();
    await expect(page.locator('.backlog-row', { hasText: 'Livré 2' })).toBeVisible();
  });
});
