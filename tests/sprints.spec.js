const { test, expect, resetApp, createClient, createSprint, createItemInline, openItemDetailByTitle } = require('./helpers');

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
