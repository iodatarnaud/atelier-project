const { test, expect, resetApp, createClient, createSprint, createItemInline, openItemDetailByTitle, closeItemDetail } = require('./helpers');

// === Helpers locaux ===

async function switchToActivityTab(page) {
  await page.locator('#itemModal .tab[data-tab="activity"]').click();
  await expect(page.locator('#itemModal .tab-panel[data-panel="activity"]')).toHaveClass(/active/);
}

async function addCommentInModal(page, text) {
  await page.locator('#comment_input').fill(text);
  await page.locator('.comment-form .btn-primary').click();
}

async function reload(page) {
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#syncIndicator').waitFor({ state: 'visible' });
  await page.waitForTimeout(150);
}

// === Commentaires : golden path ===

test.describe('Activité — commentaires (golden path)', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
    await createClient(page, { name: 'Test', key: 'TST' });
    await createItemInline(page, { title: 'Mon item' });
  });

  test('ajouter un commentaire l\'affiche dans la timeline', async ({ page }) => {
    await openItemDetailByTitle(page, 'Mon item');
    await switchToActivityTab(page);
    await addCommentInModal(page, 'Mon premier commentaire');
    await expect(page.locator('.timeline-event.comment .comment-text', { hasText: 'Mon premier commentaire' })).toBeVisible();
    // L'input est vidé après submit (pour pas réinjecter le commentaire qu'on vient de poster)
    await expect(page.locator('#comment_input')).toHaveValue('');
  });

  test('modifier un commentaire affiche la marque "modifié"', async ({ page }) => {
    await openItemDetailByTitle(page, 'Mon item');
    await switchToActivityTab(page);
    await addCommentInModal(page, 'Texte original');
    await page.locator('.comment-meta .actions button', { hasText: 'Modifier' }).click();
    await page.locator('.comment-edit').fill('Texte modifié');
    await page.locator('.comment-edit-actions .btn-primary').click();
    await expect(page.locator('.comment-text')).toHaveText('Texte modifié');
    await expect(page.locator('.comment-meta')).toContainText('modifié');
  });

  test('supprimer un commentaire laisse un slot avec date dans la timeline', async ({ page }) => {
    await openItemDetailByTitle(page, 'Mon item');
    await switchToActivityTab(page);
    await addCommentInModal(page, 'À supprimer');
    page.on('dialog', d => d.accept());
    await page.locator('.comment-meta .actions button', { hasText: 'Supprimer' }).click();
    await expect(page.locator('.timeline-event.comment.deleted')).toBeVisible();
    await expect(page.locator('.timeline-event.comment.deleted .comment-text')).toContainText('Commentaire supprimé');
    // Le texte original n'est plus visible
    await expect(page.locator('.comment-text', { hasText: 'À supprimer' })).toHaveCount(0);
  });

  test('commentaire vide ou whitespace-only est rejeté silencieusement', async ({ page }) => {
    await openItemDetailByTitle(page, 'Mon item');
    await switchToActivityTab(page);
    await addCommentInModal(page, '   ');
    await expect(page.locator('.timeline-empty')).toBeVisible();
    await expect(page.locator('.timeline-event')).toHaveCount(0);
  });

  test('commentaire survit un reload (persistance IndexedDB)', async ({ page }) => {
    await openItemDetailByTitle(page, 'Mon item');
    await switchToActivityTab(page);
    await addCommentInModal(page, 'Persiste après reload');
    await closeItemDetail(page);
    await page.waitForTimeout(200); // laisse le debounce saveState (50ms) écrire
    await reload(page);
    await openItemDetailByTitle(page, 'Mon item');
    await switchToActivityTab(page);
    await expect(page.locator('.comment-text')).toHaveText('Persiste après reload');
  });
});

// === Tracking des changes ===

test.describe('Activité — tracking des changes', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
    await createClient(page, { name: 'Test', key: 'TST' });
    await createItemInline(page, { title: 'Item suivi' });
  });

  test('modifier le statut via la modale crée 1 event change', async ({ page }) => {
    await openItemDetailByTitle(page, 'Item suivi');
    await page.locator('#ed_status').selectOption('doing');
    await page.locator('#itemModal .modal-actions .btn-primary').click();
    await openItemDetailByTitle(page, 'Item suivi');
    await switchToActivityTab(page);
    const change = page.locator('.timeline-event.change');
    await expect(change).toHaveCount(1);
    await expect(change).toContainText('Statut');
    await expect(change).toContainText('À faire');
    await expect(change).toContainText('En cours');
  });

  test('modifier 3 champs en bloc crée 3 events (1 par champ)', async ({ page }) => {
    await openItemDetailByTitle(page, 'Item suivi');
    await page.locator('#ed_status').selectOption('doing');
    await page.locator('#ed_prio').selectOption('1');
    await page.locator('#ed_est').fill('2');
    await page.locator('#itemModal .modal-actions .btn-primary').click();

    await openItemDetailByTitle(page, 'Item suivi');
    await switchToActivityTab(page);
    await expect(page.locator('.timeline-event.change')).toHaveCount(3);
    // Tri chrono inverse + sort stable + même ms = ordre d'insertion préservé,
    // qui suit l'ordre TRACKED_FIELDS : status, priority, estimate.
    const all = page.locator('.timeline-event.change .field');
    await expect(all).toContainText(['Statut', 'Priorité', 'Estimation']);
  });

  test('modifier seulement la description ne crée AUCUN event', async ({ page }) => {
    await openItemDetailByTitle(page, 'Item suivi');
    await page.locator('#ed_desc').fill('Nouvelle description complète');
    await page.locator('#itemModal .modal-actions .btn-primary').click();

    await openItemDetailByTitle(page, 'Item suivi');
    await switchToActivityTab(page);
    await expect(page.locator('.timeline-empty')).toBeVisible();
    await expect(page.locator('.timeline-event')).toHaveCount(0);
  });

  test('passage à done crée 1 event status (pas d\'event completedAt)', async ({ page }) => {
    await openItemDetailByTitle(page, 'Item suivi');
    await page.locator('#ed_status').selectOption('done');
    await page.locator('#itemModal .modal-actions .btn-primary').click();
    await expect(page.locator('#itemModal')).not.toHaveClass(/show/);

    // L'item passe à done → disparaît du backlog (filtré). On assert directement
    // sur state.clients[0].items[0].activity sans rouvrir la modale.
    const fields = await page.evaluate(() => {
      const item = state.clients[0].items.find(i => i.title === 'Item suivi');
      return item.activity.map(e => e.field || e.type);
    });
    expect(fields).toEqual(['status']);

    // completedAt est bien setté côté item (mais n'a généré aucun event)
    const completedAt = await page.evaluate(() => {
      return state.clients[0].items.find(i => i.title === 'Item suivi').completedAt;
    });
    expect(completedAt).toBeGreaterThan(0);
  });

  test('cycleStatus depuis le badge backlog crée un event', async ({ page }) => {
    const badge = page.locator('.backlog-row', { hasText: 'Item suivi' }).locator('.status-badge');
    await badge.click(); // todo → doing

    await openItemDetailByTitle(page, 'Item suivi');
    await switchToActivityTab(page);
    await expect(page.locator('.timeline-event.change')).toHaveCount(1);
    await expect(page.locator('.timeline-event.change')).toContainText('Statut');
  });

  test('drag & drop board crée un event status', async ({ page }) => {
    await createSprint(page, { name: 'Sprint 1' });
    const sectionId = await page.locator('.backlog-section.sprint-active-section').getAttribute('data-section');
    await createItemInline(page, { sectionId, title: 'À déplacer' });

    await page.locator('.side-nav-item[data-view="board"]').click();
    const card = page.locator('.card', { hasText: 'À déplacer' });
    await card.dragTo(page.locator('.board-col[data-status="doing"] .board-col-body'));

    await page.locator('.card', { hasText: 'À déplacer' }).click();
    await switchToActivityTab(page);
    await expect(page.locator('.timeline-event.change')).toHaveCount(1);
    await expect(page.locator('.timeline-event.change')).toContainText('Statut');
    await expect(page.locator('.timeline-event.change')).toContainText('En cours');
  });

  test('completeSprint : items non-done génèrent event sprintId, items done non', async ({ page }) => {
    await createSprint(page, { name: 'Sprint à clôturer' });
    const sectionId = await page.locator('.backlog-section.sprint-active-section').getAttribute('data-section');
    await createItemInline(page, { sectionId, title: 'Item ouvert' });
    await createItemInline(page, { sectionId, title: 'Item terminé' });

    // Marque un item comme done
    await openItemDetailByTitle(page, 'Item terminé');
    await page.locator('#ed_status').selectOption('done');
    await page.locator('#itemModal .modal-actions .btn-primary').click();

    // Clôture le sprint
    page.on('dialog', d => d.accept());
    await page.locator('.side-nav-item[data-view="board"]').click();
    await page.locator('button', { hasText: 'Terminer le sprint' }).click();

    // Item ouvert : doit avoir un event "Sprint" (le sprintId est passé à null)
    const ouvertEvents = await page.evaluate(() => {
      const item = state.clients[0].items.find(i => i.title === 'Item ouvert');
      return (item.activity || []).filter(e => e.field === 'sprintId');
    });
    expect(ouvertEvents).toHaveLength(1);
    expect(ouvertEvents[0].after).toBeNull();

    // Item terminé : ne doit PAS avoir d'event sprintId généré par completeSprint
    // (il a déjà un event status pour le passage à done, mais pas de sprintId)
    const termineSprintEvents = await page.evaluate(() => {
      const item = state.clients[0].items.find(i => i.title === 'Item terminé');
      return (item.activity || []).filter(e => e.field === 'sprintId');
    });
    expect(termineSprintEvents).toHaveLength(0);
  });

  test('event survit un reload (persistance IndexedDB)', async ({ page }) => {
    await openItemDetailByTitle(page, 'Item suivi');
    await page.locator('#ed_status').selectOption('doing');
    await page.locator('#itemModal .modal-actions .btn-primary').click();
    // Laisse le debounce de saveState (50ms) écrire en IndexedDB avant le reload
    await page.waitForTimeout(200);

    await reload(page);
    await openItemDetailByTitle(page, 'Item suivi');
    await switchToActivityTab(page);
    await expect(page.locator('.timeline-event.change')).toHaveCount(1);
    await expect(page.locator('.timeline-event.change')).toContainText('Statut');
  });
});

// === Sécurité ===

test.describe('Activité — sécurité', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
    await createClient(page, { name: 'Test', key: 'TST' });
    await createItemInline(page, { title: 'Cible XSS' });
  });

  test('commentaire avec HTML/script affiché comme texte (pas exécuté)', async ({ page }) => {
    await openItemDetailByTitle(page, 'Cible XSS');
    await switchToActivityTab(page);
    await addCommentInModal(page, '<img src=x onerror="window.__xss_comment=1"><script>window.__xss_script=1</script>');

    // Aucun side-effect JS n'a été déclenché
    const sideEffects = await page.evaluate(() => ({
      img:    window.__xss_comment ?? null,
      script: window.__xss_script  ?? null,
    }));
    expect(sideEffects).toEqual({ img: null, script: null });

    // Le contenu apparaît comme du texte (les chevrons sont visibles)
    const text = await page.locator('.timeline-event.comment .comment-text').textContent();
    expect(text).toContain('<img');
    expect(text).toContain('<script>');

    // Aucun tag dangereux dans le DOM rendu du commentaire
    const danger = await page.locator('.timeline-event.comment .comment-text').evaluate((root) => {
      const FORBIDDEN = ['IMG', 'SCRIPT', 'SVG', 'IFRAME', 'OBJECT', 'EMBED'];
      return Array.from(root.querySelectorAll('*'))
        .filter(n => FORBIDDEN.includes(n.tagName))
        .map(n => n.tagName);
    });
    expect(danger).toEqual([]);
  });

  test('URL javascript: dans commentaire pas auto-linkée', async ({ page }) => {
    await openItemDetailByTitle(page, 'Cible XSS');
    await switchToActivityTab(page);
    await addCommentInModal(page, 'Voir javascript:alert(1) ou data:text/html,<script>1</script>');

    // Aucun lien <a href> ne doit être créé pour ces protocoles
    const links = await page.locator('.timeline-event.comment .comment-text a').count();
    expect(links).toBe(0);
  });

  test('URL http(s) auto-linkée avec rel sécurisé et ponctuation finale exclue', async ({ page }) => {
    await openItemDetailByTitle(page, 'Cible XSS');
    await switchToActivityTab(page);
    await addCommentInModal(page, 'Voir https://example.com/path?q=1, et plus.');

    const link = page.locator('.timeline-event.comment .comment-text a');
    await expect(link).toHaveCount(1);
    await expect(link).toHaveAttribute('href', 'https://example.com/path?q=1');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(link).toHaveAttribute('target', '_blank');
    // La virgule et le point final apparaissent en texte hors du lien
    const text = await page.locator('.timeline-event.comment .comment-text').textContent();
    expect(text).toMatch(/example\.com\/path\?q=1, et plus\./);
  });

  test('activity hostile importée (Gist piégé) est neutralisée par le validator', async ({ page }) => {
    // Setup : on injecte directement dans IndexedDB une activity contenant des
    // events invalides (id non conforme, type inconnu, field hors whitelist,
    // commentaire trop long, before/after invalides). Le validator doit les
    // filtrer au boot.
    await page.evaluate(async () => {
      const item = state.clients[0].items[0];
      item.activity = [
        // OK : commentaire normal — doit être préservé
        { id: 'avalidcomment01', type: 'comment', at: Date.now(), text: 'Commentaire valide' },
        // Rejeté : id invalide (caractères interdits)
        { id: '<script>alert(1)</script>', type: 'comment', at: Date.now(), text: 'XSS id' },
        // Rejeté : type inconnu
        { id: 'aevil0001', type: 'attack', at: Date.now(), text: 'evil' },
        // Rejeté : type comment sans timestamp valide
        { id: 'aevil0002', type: 'comment', at: 'not-a-number', text: 'no-ts' },
        // Rejeté : type change avec field hors whitelist
        { id: 'aevil0003', type: 'change', at: Date.now(), field: '__proto__', before: null, after: 'pwned' },
        // Rejeté : type change avec before invalide pour le field
        { id: 'aevil0004', type: 'change', at: Date.now(), field: 'priority', before: 99, after: 1 },
        // Rejeté : type change avec null sur champ non-nullable (priority)
        { id: 'aevil0005', type: 'change', at: Date.now(), field: 'priority', before: null, after: 1 },
        // OK : change valide sur sprintId nullable
        { id: 'avalidchange01', type: 'change', at: Date.now(), field: 'sprintId', before: null, after: null },
      ];
      await dbSet(STORAGE_KEY, {
        clients: state.clients,
        activeClientId: state.activeClientId,
        lastSavedAt: Date.now()
      });
    });

    await reload(page);
    await openItemDetailByTitle(page, 'Cible XSS');
    await switchToActivityTab(page);

    // Seul le commentaire valide + le change valide doivent apparaître
    await expect(page.locator('.timeline-event.comment')).toHaveCount(1);
    await expect(page.locator('.comment-text', { hasText: 'Commentaire valide' })).toBeVisible();

    // Vérification directe sur le state normalisé
    const survivors = await page.evaluate(() => {
      return state.clients[0].items[0].activity.map(e => e.id);
    });
    expect(survivors.sort()).toEqual(['avalidchange01', 'avalidcomment01']);
  });

  test('item ancien sans champ activity ne crash pas et timeline = vide', async ({ page }) => {
    // Simule un Gist pré-feature : items sans champ activity
    await page.evaluate(async () => {
      delete state.clients[0].items[0].activity;
      await dbSet(STORAGE_KEY, {
        clients: state.clients,
        activeClientId: state.activeClientId,
        lastSavedAt: Date.now()
      });
    });

    await reload(page);
    await openItemDetailByTitle(page, 'Cible XSS');
    await switchToActivityTab(page);
    await expect(page.locator('.timeline-empty')).toBeVisible();
    // Et on peut commenter normalement (le tableau est créé à la volée)
    await addCommentInModal(page, 'Premier commentaire post-migration');
    await expect(page.locator('.comment-text')).toContainText('Premier commentaire post-migration');
  });
});

// === Mode test ===

test.describe('Activité — mode test', () => {
  test('commentaire en mode test est volatile (perdu au refresh)', async ({ page }) => {
    // Active le flag mode test AVANT le boot pour passer dans le seed démo.
    await page.context().addInitScript(() => {
      try { localStorage.setItem('atelier-mode-test', '1'); } catch (_) {}
    });
    await resetApp(page);

    // Le seed démo crée des projets : on ouvre n'importe quel item du premier projet
    const firstItemTitle = await page.evaluate(() => {
      return state.clients[0].items[0].title;
    });
    await openItemDetailByTitle(page, firstItemTitle);
    await switchToActivityTab(page);
    await addCommentInModal(page, 'Volatile en mode test');
    await expect(page.locator('.comment-text', { hasText: 'Volatile en mode test' })).toBeVisible();

    // Refresh → seed propre rechargé, le commentaire est perdu
    await reload(page);
    await openItemDetailByTitle(page, firstItemTitle);
    await switchToActivityTab(page);
    await expect(page.locator('.comment-text', { hasText: 'Volatile en mode test' })).toHaveCount(0);
  });
});
