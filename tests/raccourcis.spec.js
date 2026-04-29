const { test, expect, resetApp, createClient, createSprint, createItemInline, openItemDetailByTitle } = require('./helpers');

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

test.describe('Raccourcis — Ctrl+C ne casse pas le copier natif (ATE-14 fix)', () => {
  test('Ctrl+C avec focus dans un input n\'ouvre PAS le quick add (laisse passer le copier natif)', async ({ page }) => {
    await createItemInline(page, { title: 'Item 1' });
    // Ouvre la modale de création d'un sprint pour avoir un input avec focus
    await page.locator('button[title="Nouveau sprint"]').click();
    await page.locator('#sprintName').fill('Sprint A');
    await page.locator('#sprintName').focus();
    // Simule Ctrl+C avec focus dans l'input
    await page.keyboard.press('Control+c');
    // La modale sprint reste ouverte (pas de bascule sur backlog ni de form inline déclenché)
    await expect(page.locator('#sprintModal')).toHaveClass(/show/);
    await expect(page.locator('#form-backlog')).toBeHidden();
  });

  test('Ctrl+C avec focus sur body ouvre le quick add (non-régression)', async ({ page }) => {
    // Force le focus sur body
    await page.evaluate(() => document.body.focus());
    await page.keyboard.press('Control+c');
    await expect(page.locator('#form-backlog')).toBeVisible();
  });

  test('Échap dans un input de modale ne ferme PAS la modale (anti-frappe accidentelle)', async ({ page }) => {
    await page.locator('button[title="Nouveau sprint"]').click();
    await page.locator('#sprintName').focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('#sprintModal')).toHaveClass(/show/);
  });
});

test.describe('Raccourcis — Ctrl/Cmd+Entrée valide le bouton primary contextuel (ATE-14)', () => {
  test('Ctrl+Entrée dans la modale détail d\'un item sauvegarde + ferme', async ({ page }) => {
    await createItemInline(page, { title: 'Original' });
    await openItemDetailByTitle(page, 'Original');
    await page.locator('#ed_title').fill('Modifié via Ctrl+Entrée');
    await page.locator('#ed_title').press('Control+Enter');
    await expect(page.locator('#itemModal')).not.toHaveClass(/show/);
    await expect(page.locator('.backlog-row', { hasText: 'Modifié via Ctrl+Entrée' })).toBeVisible();
  });

  test('Ctrl+Entrée dans le formulaire inline crée 1 SEUL item (anti double-submit)', async ({ page }) => {
    await page.locator('[data-section="backlog"] .add-row').click();
    await page.locator('#form-backlog .if-title').fill('Créé via raccourci');
    await page.locator('#form-backlog .if-title').press('Control+Enter');
    // Count exact = 1 : garde-fou contre le double-submit (listener local
    // sur .if-title + handler global qui clique le bouton primary).
    await expect(page.locator('.backlog-row', { hasText: 'Créé via raccourci' })).toHaveCount(1);
  });

  test('Ctrl+Entrée dans le champ commentaire poste le commentaire', async ({ page }) => {
    await createItemInline(page, { title: 'Item à commenter' });
    await openItemDetailByTitle(page, 'Item à commenter');
    await page.locator('#itemModal .tab[data-tab="activity"]').click();
    await page.locator('#comment_input').fill('Commentaire via raccourci');
    await page.locator('#comment_input').press('Control+Enter');
    await expect(page.locator('.timeline-event.comment .comment-text', { hasText: 'Commentaire via raccourci' })).toBeVisible();
  });

  test('Ctrl+Entrée dans l\'édition d\'un commentaire enregistre la modification', async ({ page }) => {
    await createItemInline(page, { title: 'Item édit' });
    await openItemDetailByTitle(page, 'Item édit');
    await page.locator('#itemModal .tab[data-tab="activity"]').click();
    await page.locator('#comment_input').fill('Texte initial');
    await page.locator('.comment-form .btn-primary').click();
    await page.locator('.comment-meta .actions button', { hasText: 'Modifier' }).click();
    await page.locator('.comment-edit').fill('Texte modifié via raccourci');
    await page.locator('.comment-edit').press('Control+Enter');
    await expect(page.locator('.comment-text')).toHaveText('Texte modifié via raccourci');
    await expect(page.locator('.comment-meta')).toContainText('modifié');
  });

  test('Cmd+Entrée (Meta) déclenche aussi Enregistrer (équivalence Mac)', async ({ page }) => {
    await createItemInline(page, { title: 'Mac shortcut' });
    await openItemDetailByTitle(page, 'Mac shortcut');
    await page.locator('#ed_title').fill('Validé via Cmd+Entrée');
    await page.locator('#ed_title').press('Meta+Enter');
    await expect(page.locator('#itemModal')).not.toHaveClass(/show/);
    await expect(page.locator('.backlog-row', { hasText: 'Validé via Cmd+Entrée' })).toBeVisible();
  });

  test('Ctrl+Entrée sur la modale de confirmation NE supprime PAS (garde anti-suppression accidentelle)', async ({ page }) => {
    await createItemInline(page, { title: 'À ne pas supprimer' });
    const row = page.locator('.backlog-row', { hasText: 'À ne pas supprimer' });
    await row.hover();
    await row.locator('.row-action').click({ force: true });
    await expect(page.locator('#confirmModal')).toHaveClass(/show/);
    // Tape Ctrl+Entrée pendant que la modale de confirmation est ouverte
    await page.keyboard.press('Control+Enter');
    // L'item existe toujours et la modale reste ouverte (le raccourci n'a pas déclenché Confirmer)
    await expect(page.locator('#confirmModal')).toHaveClass(/show/);
    await expect(page.locator('.backlog-row', { hasText: 'À ne pas supprimer' })).toBeVisible();
  });

  test('Ctrl+Entrée onglet Activité actif (focus body) ne clique PAS l\'Enregistrer caché de Détails', async ({ page }) => {
    await createItemInline(page, { title: 'Tab focus check' });
    await openItemDetailByTitle(page, 'Tab focus check');
    // Modifie le titre puis bascule sur l'onglet Activité
    await page.locator('#ed_title').fill('Modif non sauvegardée');
    await page.locator('#itemModal .tab[data-tab="activity"]').click();
    // Force le focus hors du textarea commentaire (sur le panel lui-même)
    await page.evaluate(() => {
      document.activeElement?.blur();
      document.body.focus();
    });
    await page.keyboard.press('Control+Enter');
    // La modale doit rester ouverte (pas de save déclenché par hasard)
    await expect(page.locator('#itemModal')).toHaveClass(/show/);
    // Et le titre n'a pas été persisté
    const persistedTitle = await page.evaluate(() => state.clients[0].items[0].title);
    expect(persistedTitle).toBe('Tab focus check');
  });
});
