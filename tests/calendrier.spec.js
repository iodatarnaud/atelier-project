const { test, expect, resetApp, createClient, createItemInline, openItemDetailByTitle } = require('./helpers');

// === Helpers locaux ===

async function setItemDueDate(page, itemTitle, dueDate) {
  await page.evaluate(({ title, due }) => {
    const item = state.clients[0].items.find(i => i.title === title);
    if (item) item.dueDate = due;
  }, { title: itemTitle, due: dueDate });
}

async function gotoCalendar(page) {
  await page.locator('.side-nav-item[data-view="calendar"]').click();
  await expect(page.locator('#pageTitle')).toHaveText('Calendrier');
}

async function getTodayKey(page) {
  return await page.evaluate(() => localDateKey(new Date()));
}

// === Vue calendrier — affichage de base ===

test.describe('Calendrier — affichage et navigation', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
    await createClient(page, { name: 'Acme', key: 'ACM' });
  });

  test('s\'ouvre via la nav sidebar et affiche le mois courant', async ({ page }) => {
    await gotoCalendar(page);
    const monthsFR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const expectedTitle = monthsFR[new Date().getMonth()] + ' ' + new Date().getFullYear();
    await expect(page.locator('.calendar-month-title')).toHaveText(expectedTitle);
    // Grille présente
    await expect(page.locator('.calendar-grid')).toBeVisible();
    // Headers Lun..Dim
    await expect(page.locator('.calendar-day-header')).toHaveCount(7);
  });

  test('navigation mois précédent / suivant met à jour le titre', async ({ page }) => {
    await gotoCalendar(page);
    const before = await page.locator('.calendar-month-title').textContent();
    await page.locator('.calendar-month-nav button[title="Mois suivant"]').click();
    const after = await page.locator('.calendar-month-title').textContent();
    expect(after).not.toBe(before);
    // Retour avec "Aujourd'hui"
    await page.locator('.calendar-month-nav button[title="Aujourd\'hui"]').click();
    await expect(page.locator('.calendar-month-title')).toHaveText(before);
  });

  test('aujourd\'hui a la classe CSS "today"', async ({ page }) => {
    await gotoCalendar(page);
    const todayKey = await getTodayKey(page);
    await expect(page.locator(`.cal-cell[data-date="${todayKey}"]`)).toHaveClass(/today/);
  });

  test('cas vide : aucun projet → empty state au lieu de la grille', async ({ page }) => {
    // Supprime tout le state via evaluate puis reload
    await page.evaluate(async () => {
      state.clients = [];
      await dbSet(STORAGE_KEY, { clients: [], activeClientId: null, lastSavedAt: Date.now() });
    });
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.locator('#syncIndicator').waitFor({ state: 'visible' });
    await page.waitForTimeout(150);
    await gotoCalendar(page);
    await expect(page.locator('.empty-title')).toContainText('Aucun projet');
  });
});

test.describe('Calendrier — items et placement', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
    await createClient(page, { name: 'Acme', key: 'ACM' });
  });

  test('un item avec dueDate apparaît dans la cellule du jour', async ({ page }) => {
    await createItemInline(page, { title: 'Item planifié' });
    const todayKey = await getTodayKey(page);
    await setItemDueDate(page, 'Item planifié', todayKey);
    await gotoCalendar(page);
    const cell = page.locator(`.cal-cell[data-date="${todayKey}"]`);
    await expect(cell.locator('.cal-item-title', { hasText: 'Item planifié' })).toBeVisible();
  });

  test('un item sans dueDate apparaît dans la section "Non planifiés"', async ({ page }) => {
    await createItemInline(page, { title: 'Item flottant' });
    await gotoCalendar(page);
    await expect(page.locator('.calendar-unplanned')).toBeVisible();
    await expect(page.locator('.calendar-unplanned-items .cal-item-title', { hasText: 'Item flottant' })).toBeVisible();
  });

  test('item overdue (dueDate passée + non done) → section "En retard"', async ({ page }) => {
    await createItemInline(page, { title: 'En retard ancien' });
    await setItemDueDate(page, 'En retard ancien', '2024-01-15');
    await gotoCalendar(page);
    await expect(page.locator('.calendar-overdue')).toBeVisible();
    await expect(page.locator('.calendar-overdue-title')).toContainText('En retard');
    await expect(page.locator('.calendar-overdue-items .cal-item-title', { hasText: 'En retard ancien' })).toBeVisible();
  });

  test('item overdue mais done → PAS dans la section "En retard"', async ({ page }) => {
    await createItemInline(page, { title: 'Fini hier' });
    await page.evaluate(() => {
      const item = state.clients[0].items.find(i => i.title === 'Fini hier');
      item.dueDate = '2024-01-15';
      item.status = 'done';
    });
    await gotoCalendar(page);
    await expect(page.locator('.calendar-overdue')).toHaveCount(0);
  });

  test('click sur un item ouvre la modale détail (vue reste calendrier après fermeture)', async ({ page }) => {
    await createItemInline(page, { title: 'Cliquable' });
    await gotoCalendar(page);
    await page.locator('.cal-item', { hasText: 'Cliquable' }).click();
    await expect(page.locator('#itemModal')).toHaveClass(/show/);
    await expect(page.locator('#ed_title')).toHaveValue('Cliquable');
    await page.locator('#itemModal .modal-close').click();
    // La vue est restée sur calendrier (pas reset à backlog)
    await expect(page.locator('#pageTitle')).toHaveText('Calendrier');
  });

  test('click sur un item d\'un autre projet : switch projet + vue reste calendrier', async ({ page }) => {
    await createItemInline(page, { title: 'Item Acme' });
    await createClient(page, { name: 'Globex', key: 'GLO' });
    // Maintenant Globex est actif
    await createItemInline(page, { title: 'Item Globex' });
    await gotoCalendar(page);
    // Click sur l'item Acme depuis le calendrier
    await page.locator('.cal-item', { hasText: 'Item Acme' }).click();
    await expect(page.locator('#itemModal')).toHaveClass(/show/);
    // Le projet actif a été switché
    const activeId = await page.evaluate(() => state.activeClientId);
    const acmeId = await page.evaluate(() => state.clients.find(c => c.name === 'Acme').id);
    expect(activeId).toBe(acmeId);
    await page.locator('#itemModal .modal-close').click();
    await expect(page.locator('#pageTitle')).toHaveText('Calendrier');
  });
});

test.describe('Calendrier — filtres', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
    await createClient(page, { name: 'Acme', key: 'ACM' });
    await createItemInline(page, { title: 'Build P1', type: 'story', priority: 1 });
    await createItemInline(page, { title: 'Bug P3', type: 'bug', priority: 3 });
    await createItemInline(page, { title: 'TMA P2', type: 'task', priority: 2 });
  });

  test('filtre type : seuls items du type sélectionné apparaissent', async ({ page }) => {
    await gotoCalendar(page);
    await page.locator('.calendar-filters select[data-cal-filter="type"]').selectOption('bug');
    await expect(page.locator('.cal-item-title', { hasText: 'Bug P3' })).toBeVisible();
    await expect(page.locator('.cal-item-title', { hasText: 'Build P1' })).toHaveCount(0);
    await expect(page.locator('.cal-item-title', { hasText: 'TMA P2' })).toHaveCount(0);
  });

  test('filtre priorité : seuls items de la priorité sélectionnée', async ({ page }) => {
    await gotoCalendar(page);
    await page.locator('.calendar-filters select[data-cal-filter="prio"]').selectOption('1');
    await expect(page.locator('.cal-item-title', { hasText: 'Build P1' })).toBeVisible();
    await expect(page.locator('.cal-item-title', { hasText: 'Bug P3' })).toHaveCount(0);
  });

  test('filtre epic est désactivé en mode "Tous projets" et activé quand on sélectionne un projet', async ({ page }) => {
    await gotoCalendar(page);
    const epicSelect = page.locator('.calendar-filters select[data-cal-filter="epic"]');
    await expect(epicSelect).toBeDisabled();
    await page.locator('.calendar-filters select[data-cal-filter="project"]').selectOption({ index: 1 });
    await expect(epicSelect).toBeEnabled();
  });

  test('filtre projet : multi-projets, ne montre que ceux du projet choisi', async ({ page }) => {
    // Ajoute un 2e projet avec un item
    await createClient(page, { name: 'Globex', key: 'GLO' });
    await createItemInline(page, { title: 'Item Globex' });
    await gotoCalendar(page);
    // Tous projets : 4 items visibles dans Non planifiés
    await expect(page.locator('.calendar-unplanned-items .cal-item')).toHaveCount(4);
    // Filtre Acme uniquement
    await page.locator('.calendar-filters select[data-cal-filter="project"]').selectOption({ label: 'Acme' });
    await expect(page.locator('.calendar-unplanned-items .cal-item')).toHaveCount(3);
    await expect(page.locator('.cal-item-title', { hasText: 'Item Globex' })).toHaveCount(0);
  });
});

test.describe('Calendrier — exclusions (done + items hors mois) [bloquants Codex]', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
    await createClient(page, { name: 'Acme', key: 'ACM' });
  });

  test('un item done avec dueDate aujourd\'hui n\'apparaît PAS dans le calendrier', async ({ page }) => {
    await createItemInline(page, { title: 'Fini aujourd\'hui' });
    const todayKey = await getTodayKey(page);
    await page.evaluate(({ title, due }) => {
      const item = state.clients[0].items.find(i => i.title === title);
      item.dueDate = due;
      item.status = 'done';
    }, { title: 'Fini aujourd\'hui', due: todayKey });
    await gotoCalendar(page);
    // Pas dans la cellule d'aujourd'hui, pas en overdue, pas dans non planifiés
    await expect(page.locator('.cal-item-title', { hasText: 'Fini aujourd\'hui' })).toHaveCount(0);
  });

  test('un item du mois suivant n\'apparaît PAS dans la cellule grisée du mois courant', async ({ page }) => {
    await createItemInline(page, { title: 'Mois prochain' });
    // Date dans le mois suivant qui pourrait apparaître en cellule grisée du mois courant
    const nextMonthFirstDayKey = await page.evaluate(() => {
      const d = new Date();
      d.setMonth(d.getMonth() + 1);
      d.setDate(1);
      return localDateKey(d);
    });
    await setItemDueDate(page, 'Mois prochain', nextMonthFirstDayKey);
    await gotoCalendar(page);
    // La cellule peut apparaître en .other-month, mais l'item ne doit PAS y être affiché
    await expect(page.locator('.cal-cell.other-month .cal-item-title', { hasText: 'Mois prochain' })).toHaveCount(0);
    // En naviguant au mois suivant, l'item doit bien apparaître dans la bonne cellule
    await page.locator('.calendar-month-nav button[title="Mois suivant"]').click();
    await expect(page.locator(`.cal-cell[data-date="${nextMonthFirstDayKey}"] .cal-item-title`, { hasText: 'Mois prochain' })).toBeVisible();
  });

  test('seuls items hors mois → empty state visible (pas de fausse présence)', async ({ page }) => {
    await createItemInline(page, { title: 'Loin' });
    // Date dans 2 mois pour être sûr qu'elle n'apparaisse même pas en cellule grisée
    const twoMonthsLaterKey = await page.evaluate(() => {
      const d = new Date();
      d.setMonth(d.getMonth() + 2);
      d.setDate(15);
      return localDateKey(d);
    });
    await setItemDueDate(page, 'Loin', twoMonthsLaterKey);
    await gotoCalendar(page);
    // Aucun item visible dans le mois courant, pas d'overdue, pas d'unplanned
    // → l'empty state doit s'afficher
    await expect(page.locator('.calendar-empty')).toBeVisible();
  });
});

test.describe('Calendrier — sécurité date (timezone)', () => {
  test('un item avec dueDate hier ne se retrouve PAS dans la cellule d\'aujourd\'hui (bug timezone Codex)', async ({ page }) => {
    await resetApp(page);
    await createClient(page, { name: 'Acme', key: 'ACM' });
    await createItemInline(page, { title: 'Hier' });
    // Calcule la date "hier" en local (pareil que le code)
    const yesterdayKey = await page.evaluate(() => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return localDateKey(d);
    });
    await setItemDueDate(page, 'Hier', yesterdayKey);
    await gotoCalendar(page);
    const todayKey = await getTodayKey(page);
    // Cellule d'aujourd'hui : ne contient pas l'item "Hier"
    await expect(page.locator(`.cal-cell[data-date="${todayKey}"] .cal-item-title`, { hasText: 'Hier' })).toHaveCount(0);
    // L'item est soit dans la cellule "hier" (si visible dans le mois), soit en overdue
    const inOverdue = await page.locator('.calendar-overdue-items .cal-item-title', { hasText: 'Hier' }).count();
    const inYesterday = await page.locator(`.cal-cell[data-date="${yesterdayKey}"] .cal-item-title`, { hasText: 'Hier' }).count();
    expect(inOverdue + inYesterday).toBeGreaterThan(0);
  });
});

// === Pastille couleur Epic [WI-003 / ATE-21] ===

test.describe('Calendrier — pastille couleur = Epic [WI-003]', () => {
  // #ff5733 = rgb(255, 87, 51) — Epic test ; #6c7888 = rgb(108, 120, 136) — fallback
  const EPIC_COLOR_HEX = '#ff5733';
  const EPIC_COLOR_RGB = 'rgb(255, 87, 51)';
  const FALLBACK_RGB = 'rgb(108, 120, 136)';

  test.beforeEach(async ({ page }) => {
    await resetApp(page);
    await createClient(page, { name: 'Acme', key: 'ACM' });
    await page.evaluate((color) => {
      const c = state.clients[0];
      c.epics = c.epics || [];
      c.epics.push({ id: 'epic-wi003-1', name: 'Refonte UI', color });
    }, EPIC_COLOR_HEX);
  });

  async function assignEpicToItem(page, itemTitle, epicId) {
    await page.evaluate(({ title, eid }) => {
      const item = state.clients[0].items.find(i => i.title === title);
      if (item) item.epicId = eid;
    }, { title: itemTitle, eid: epicId });
  }

  test('AC1 — item avec Epic défini → pastille = couleur Epic', async ({ page }) => {
    await createItemInline(page, { title: 'Avec Epic' });
    await assignEpicToItem(page, 'Avec Epic', 'epic-wi003-1');
    await gotoCalendar(page);
    const pastille = page.locator('.cal-item').filter({ hasText: 'Avec Epic' }).locator('.cal-item-color').first();
    const bg = await pastille.evaluate(el => getComputedStyle(el).backgroundColor);
    expect(bg).toBe(EPIC_COLOR_RGB);
  });

  test('AC2 — item sans Epic → pastille gris fallback', async ({ page }) => {
    // Titre "Item Solo" choisi pour éviter la collision avec l'option "Sans epic"
    // du <select id="ed_epic"> qui ferait échouer le helper createItemInline (matching non strict).
    await createItemInline(page, { title: 'Item Solo' });
    await gotoCalendar(page);
    const pastille = page.locator('.cal-item').filter({ hasText: 'Item Solo' }).locator('.cal-item-color').first();
    const bg = await pastille.evaluate(el => getComputedStyle(el).backgroundColor);
    expect(bg).toBe(FALLBACK_RGB);
  });

  test('AC2 bis — item avec epicId orphelin (Epic supprimé) → fallback gris', async ({ page }) => {
    await createItemInline(page, { title: 'Epic orphelin' });
    await assignEpicToItem(page, 'Epic orphelin', 'epic-introuvable-xxx');
    await gotoCalendar(page);
    const calItem = page.locator('.cal-item').filter({ hasText: 'Epic orphelin' });
    const bg = await calItem.locator('.cal-item-color').first().evaluate(el => getComputedStyle(el).backgroundColor);
    expect(bg).toBe(FALLBACK_RGB);
    // Tooltip ne doit pas contenir de segment Epic (epicName = null)
    const title = await calItem.first().getAttribute('title');
    expect(title).toBe('Acme · Epic orphelin');
  });

  test('AC3 — tooltip avec Epic = "Client · Epic · Titre"', async ({ page }) => {
    await createItemInline(page, { title: 'Tooltip Epic' });
    await assignEpicToItem(page, 'Tooltip Epic', 'epic-wi003-1');
    await gotoCalendar(page);
    const calItem = page.locator('.cal-item').filter({ hasText: 'Tooltip Epic' }).first();
    const title = await calItem.getAttribute('title');
    expect(title).toBe('Acme · Refonte UI · Tooltip Epic');
  });

  test('AC3 bis — tooltip sans Epic = "Client · Titre"', async ({ page }) => {
    await createItemInline(page, { title: 'Tooltip Sans Epic' });
    await gotoCalendar(page);
    const calItem = page.locator('.cal-item').filter({ hasText: 'Tooltip Sans Epic' }).first();
    const title = await calItem.getAttribute('title');
    expect(title).toBe('Acme · Tooltip Sans Epic');
  });

  test('AC4 — couleur cohérente entre 2 zones (overdue + non planifié)', async ({ page }) => {
    // Item 1 : overdue, avec Epic
    await createItemInline(page, { title: 'Overdue Epic' });
    await assignEpicToItem(page, 'Overdue Epic', 'epic-wi003-1');
    await setItemDueDate(page, 'Overdue Epic', '2024-01-15');
    // Item 2 : non planifié, même Epic
    await createItemInline(page, { title: 'NonPlanifie Epic' });
    await assignEpicToItem(page, 'NonPlanifie Epic', 'epic-wi003-1');
    await gotoCalendar(page);
    const overdueBg = await page.locator('.calendar-overdue-items .cal-item').filter({ hasText: 'Overdue Epic' }).locator('.cal-item-color').first().evaluate(el => getComputedStyle(el).backgroundColor);
    const unplannedBg = await page.locator('.calendar-unplanned-items .cal-item').filter({ hasText: 'NonPlanifie Epic' }).locator('.cal-item-color').first().evaluate(el => getComputedStyle(el).backgroundColor);
    expect(overdueBg).toBe(EPIC_COLOR_RGB);
    expect(unplannedBg).toBe(EPIC_COLOR_RGB);
    expect(overdueBg).toBe(unplannedBg);
  });

  test('AC5 — aucune régression : data-client-id, data-item-id, draggable, onclick préservés', async ({ page }) => {
    await createItemInline(page, { title: 'Anti-régression' });
    await assignEpicToItem(page, 'Anti-régression', 'epic-wi003-1');
    await gotoCalendar(page);
    const calItem = page.locator('.cal-item').filter({ hasText: 'Anti-régression' }).first();
    expect(await calItem.getAttribute('draggable')).toBe('true');
    expect(await calItem.getAttribute('data-client-id')).toBeTruthy();
    expect(await calItem.getAttribute('data-item-id')).toBeTruthy();
    const onclick = await calItem.getAttribute('onclick');
    expect(onclick).toContain('openItemFromCalendar');
  });
});
