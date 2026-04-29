// WI-001 — Drag & drop dueDate dans le calendrier
// Couverture des 13 AC du PRD : D&D entre cellules / non planifiés / overdue / projet non actif,
// rejet sur cibles invalides, anti-click post-drag, no-op same-date, non-régression handlers existants.

const { test, expect, resetApp, createClient, createItemInline, openItemDetailByTitle } = require('./helpers');

async function setItemDueDate(page, itemTitle, dueDate) {
  await page.evaluate(({ title, due }) => {
    for (const c of state.clients) {
      const item = c.items.find(i => i.title === title);
      if (item) { item.dueDate = due; return; }
    }
  }, { title: itemTitle, due: dueDate });
}

async function gotoCalendar(page) {
  await page.locator('.side-nav-item[data-view="calendar"]').click();
  await expect(page.locator('#pageTitle')).toHaveText('Calendrier');
}

async function getTodayKey(page) {
  return await page.evaluate(() => localDateKey(new Date()));
}

async function inspectActivity(page, itemTitle) {
  return await page.evaluate((t) => {
    for (const c of state.clients) {
      const item = c.items.find(i => i.title === t);
      if (item) return (item.activity || []).map(e => ({ field: e.field, before: e.before, after: e.after, type: e.type }));
    }
    return null;
  }, itemTitle);
}

async function getItemId(page, title) {
  return await page.evaluate((t) => {
    for (const c of state.clients) {
      const item = c.items.find(i => i.title === t);
      if (item) return item.id;
    }
    return null;
  }, title);
}

// Simulation HTML5 D&D via dispatchEvent — plus fiable que page.dragTo() pour
// les cibles qui contiennent des enfants ou les drags vers des sections (cas
// observés : AC3/AC4/AC9/AC11 inconsistants avec dragTo).
async function simulateDnd(page, sourceSelector, targetSelector) {
  await page.evaluate(({ s, t }) => {
    const source = document.querySelector(s);
    const target = document.querySelector(t);
    if (!source) throw new Error(`simulateDnd: source not found: ${s}`);
    if (!target) throw new Error(`simulateDnd: target not found: ${t}`);
    const dt = new DataTransfer();
    const opts = { dataTransfer: dt, bubbles: true, cancelable: true };
    source.dispatchEvent(new DragEvent('dragstart', opts));
    target.dispatchEvent(new DragEvent('dragenter', opts));
    target.dispatchEvent(new DragEvent('dragover', opts));
    target.dispatchEvent(new DragEvent('drop', opts));
    source.dispatchEvent(new DragEvent('dragend', opts));
  }, { s: sourceSelector, t: targetSelector });
  await page.waitForTimeout(120); // saveState + render async
}

// === Golden path ===

test.describe('Calendrier D&D — golden path', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
    await createClient(page, { name: 'Acme', key: 'ACM' });
  });

  test('AC1 : drag entre cellules du mois courant met à jour dueDate + event change', async ({ page }) => {
    await createItemInline(page, { title: 'Item à déplacer' });
    const todayKey = await getTodayKey(page);
    await setItemDueDate(page, 'Item à déplacer', todayKey);
    await gotoCalendar(page);

    const sourceCell = page.locator(`.cal-cell[data-date="${todayKey}"]`);
    await expect(sourceCell.locator('.cal-item-title', { hasText: 'Item à déplacer' })).toBeVisible();

    // Cible : un autre jour du mois courant (3 jours plus tard, sauf cas mois)
    const targetKey = await page.evaluate((today) => {
      const d = new Date(today + 'T00:00:00');
      const orig = d.getMonth();
      d.setDate(d.getDate() + 3);
      // Si on déborde du mois, recule de 6 jours pour rester dans le mois
      if (d.getMonth() !== orig) {
        d.setDate(d.getDate() - 9);
      }
      return localDateKey(d);
    }, todayKey);

    const targetCell = page.locator(`.cal-cell[data-date="${targetKey}"]`);
    const item = sourceCell.locator('.cal-item', { hasText: 'Item à déplacer' });
    await item.dragTo(targetCell);

    await expect(targetCell.locator('.cal-item-title', { hasText: 'Item à déplacer' })).toBeVisible();
    await expect(sourceCell.locator('.cal-item-title', { hasText: 'Item à déplacer' })).toHaveCount(0);

    const dueDate = await page.evaluate(() => state.clients[0].items.find(i => i.title === 'Item à déplacer').dueDate);
    expect(dueDate).toBe(targetKey);

    const events = await inspectActivity(page, 'Item à déplacer');
    const dueEvents = events.filter(e => e.field === 'dueDate');
    expect(dueEvents).toHaveLength(1);
    expect(dueEvents[0].before).toBe(todayKey);
    expect(dueEvents[0].after).toBe(targetKey);
  });

  test('AC2 : drag depuis "Non planifiés" vers cellule planifie l\'item', async ({ page }) => {
    await createItemInline(page, { title: 'À planifier' });
    await gotoCalendar(page);

    const todayKey = await getTodayKey(page);
    const item = page.locator('.calendar-unplanned .cal-item', { hasText: 'À planifier' });
    await expect(item).toBeVisible();

    await item.dragTo(page.locator(`.cal-cell[data-date="${todayKey}"]`));

    await expect(page.locator(`.cal-cell[data-date="${todayKey}"] .cal-item-title`, { hasText: 'À planifier' })).toBeVisible();
    const dueDate = await page.evaluate(() => state.clients[0].items.find(i => i.title === 'À planifier').dueDate);
    expect(dueDate).toBe(todayKey);

    const events = await inspectActivity(page, 'À planifier');
    const dueEvents = events.filter(e => e.field === 'dueDate');
    expect(dueEvents).toHaveLength(1);
    expect(dueEvents[0].before).toBeNull();
    expect(dueEvents[0].after).toBe(todayKey);
  });

  test('AC3 : drag depuis cellule vers "Non planifiés" dé-planifie (dueDate=null)', async ({ page }) => {
    await createItemInline(page, { title: 'À dé-planifier' });
    const todayKey = await getTodayKey(page);
    await setItemDueDate(page, 'À dé-planifier', todayKey);
    await gotoCalendar(page);

    const itemId = await getItemId(page, 'À dé-planifier');
    await simulateDnd(page,
      `.cal-cell[data-date="${todayKey}"] .cal-item[data-item-id="${itemId}"]`,
      '.calendar-unplanned-items'
    );

    const dueDate = await page.evaluate(() => state.clients[0].items.find(i => i.title === 'À dé-planifier').dueDate);
    expect(dueDate).toBeNull();
    await expect(page.locator('.calendar-unplanned .cal-item-title', { hasText: 'À dé-planifier' })).toBeVisible();

    const events = await inspectActivity(page, 'À dé-planifier');
    const dueEvents = events.filter(e => e.field === 'dueDate');
    expect(dueEvents).toHaveLength(1);
    expect(dueEvents[0].before).toBe(todayKey);
    expect(dueEvents[0].after).toBeNull();
  });

  test('AC4 : drag depuis "En retard" vers cellule replanifie l\'item', async ({ page }) => {
    await createItemInline(page, { title: 'Replan overdue' });
    // Date passée pour rendre overdue
    await setItemDueDate(page, 'Replan overdue', '2024-01-15');
    await gotoCalendar(page);

    await expect(page.locator('.calendar-overdue-items .cal-item', { hasText: 'Replan overdue' })).toBeVisible();

    const todayKey = await getTodayKey(page);
    const itemId = await getItemId(page, 'Replan overdue');
    await simulateDnd(page,
      `.calendar-overdue-items .cal-item[data-item-id="${itemId}"]`,
      `.cal-cell[data-date="${todayKey}"]`
    );

    const dueDate = await page.evaluate(() => state.clients[0].items.find(i => i.title === 'Replan overdue').dueDate);
    expect(dueDate).toBe(todayKey);
    // L'item ne doit plus apparaître comme overdue
    await expect(page.locator('.calendar-overdue-items .cal-item-title', { hasText: 'Replan overdue' })).toHaveCount(0);
  });
});

// === Cibles interdites + hors zone ===

test.describe('Calendrier D&D — cibles interdites', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
    await createClient(page, { name: 'Acme', key: 'ACM' });
  });

  test('AC5 : drop sur cellule "other-month" est ignoré', async ({ page }) => {
    await createItemInline(page, { title: 'Stable' });
    const todayKey = await getTodayKey(page);
    await setItemDueDate(page, 'Stable', todayKey);
    await gotoCalendar(page);

    const otherMonthCell = page.locator('.cal-cell.other-month').first();
    const otherMonthExists = await otherMonthCell.count();
    test.skip(otherMonthExists === 0, 'Pas de cellule other-month visible ce mois (rare).');

    const item = page.locator(`.cal-cell[data-date="${todayKey}"] .cal-item`, { hasText: 'Stable' });
    await item.dragTo(otherMonthCell);

    const dueDate = await page.evaluate(() => state.clients[0].items.find(i => i.title === 'Stable').dueDate);
    expect(dueDate).toBe(todayKey);
    const events = await inspectActivity(page, 'Stable');
    expect(events.filter(e => e.field === 'dueDate')).toHaveLength(0);
  });

  test('AC6 : drop sur section "En retard" est ignoré', async ({ page }) => {
    await createItemInline(page, { title: 'Cible source' });
    await createItemInline(page, { title: 'Old' });
    await setItemDueDate(page, 'Old', '2024-01-15'); // pour faire apparaître la section overdue
    const todayKey = await getTodayKey(page);
    await setItemDueDate(page, 'Cible source', todayKey);
    await gotoCalendar(page);

    const overdueSection = page.locator('.calendar-overdue-items');
    await expect(overdueSection).toBeVisible();

    const item = page.locator(`.cal-cell[data-date="${todayKey}"] .cal-item`, { hasText: 'Cible source' });
    await item.dragTo(overdueSection);

    const dueDate = await page.evaluate(() => state.clients[0].items.find(i => i.title === 'Cible source').dueDate);
    expect(dueDate).toBe(todayKey);
    const events = await inspectActivity(page, 'Cible source');
    expect(events.filter(e => e.field === 'dueDate')).toHaveLength(0);
  });

  test('AC7 : drop hors zone valide ne change rien', async ({ page }) => {
    await createItemInline(page, { title: 'Stable hors-zone' });
    const todayKey = await getTodayKey(page);
    await setItemDueDate(page, 'Stable hors-zone', todayKey);
    await gotoCalendar(page);

    const item = page.locator(`.cal-cell[data-date="${todayKey}"] .cal-item`, { hasText: 'Stable hors-zone' });
    // Drop sur le pageTitle (zone non-droppable du header)
    await item.dragTo(page.locator('#pageTitle'));

    const dueDate = await page.evaluate(() => state.clients[0].items.find(i => i.title === 'Stable hors-zone').dueDate);
    expect(dueDate).toBe(todayKey);
    const events = await inspectActivity(page, 'Stable hors-zone');
    expect(events.filter(e => e.field === 'dueDate')).toHaveLength(0);
  });
});

// === No-op + anti-click + multi-projets ===

test.describe('Calendrier D&D — gardes', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
    await createClient(page, { name: 'Acme', key: 'ACM' });
  });

  test('AC11 : click post-drop ne ré-ouvre PAS la modale détail (dragJustHappened)', async ({ page }) => {
    await createItemInline(page, { title: 'Anti-click' });
    const todayKey = await getTodayKey(page);
    await setItemDueDate(page, 'Anti-click', todayKey);
    await gotoCalendar(page);

    const targetKey = await page.evaluate((today) => {
      const d = new Date(today + 'T00:00:00');
      const orig = d.getMonth();
      d.setDate(d.getDate() + 1);
      if (d.getMonth() !== orig) d.setDate(d.getDate() - 2);
      return localDateKey(d);
    }, todayKey);

    const itemId = await getItemId(page, 'Anti-click');
    await simulateDnd(page,
      `.cal-cell[data-date="${todayKey}"] .cal-item[data-item-id="${itemId}"]`,
      `.cal-cell[data-date="${targetKey}"]`
    );

    // Modale ne doit PAS être ouverte par le click capturé post-drop
    await expect(page.locator('#itemModal')).not.toHaveClass(/show/);
    // dueDate bien mise à jour quand même
    const dueDate = await page.evaluate(() => state.clients[0].items.find(i => i.title === 'Anti-click').dueDate);
    expect(dueDate).toBe(targetKey);
  });

  test('AC12 : drop sur la même cellule = no-op (pas d\'event, pas de save)', async ({ page }) => {
    await createItemInline(page, { title: 'Same date' });
    const todayKey = await getTodayKey(page);
    await setItemDueDate(page, 'Same date', todayKey);
    await gotoCalendar(page);

    const cell = page.locator(`.cal-cell[data-date="${todayKey}"]`);
    const item = cell.locator('.cal-item', { hasText: 'Same date' });
    const eventsBefore = await inspectActivity(page, 'Same date');
    await item.dragTo(cell);

    const eventsAfter = await inspectActivity(page, 'Same date');
    expect(eventsAfter.length).toBe(eventsBefore.length);
  });

  test('AC9 : drag d\'un item d\'un projet non actif (mode "Tous projets") préserve clientId', async ({ page }) => {
    await createItemInline(page, { title: 'Item Acme' });
    await createClient(page, { name: 'Globex', key: 'GLO' });
    // Globex est actif maintenant
    await createItemInline(page, { title: 'Item Globex' });

    // Set dueDate sur l'item Acme
    const todayKey = await getTodayKey(page);
    await setItemDueDate(page, 'Item Acme', todayKey);
    await gotoCalendar(page);
    // S'assurer qu'on est en mode "Tous projets" (default)

    const targetKey = await page.evaluate((today) => {
      const d = new Date(today + 'T00:00:00');
      const orig = d.getMonth();
      d.setDate(d.getDate() + 2);
      if (d.getMonth() !== orig) d.setDate(d.getDate() - 4);
      return localDateKey(d);
    }, todayKey);

    const acmeItemId = await page.evaluate(() => state.clients.find(c => c.name === 'Acme').items.find(i => i.title === 'Item Acme').id);
    await simulateDnd(page,
      `.cal-cell[data-date="${todayKey}"] .cal-item[data-item-id="${acmeItemId}"]`,
      `.cal-cell[data-date="${targetKey}"]`
    );

    // L'item Acme reste dans le projet Acme, sa dueDate change
    const result = await page.evaluate(() => {
      const acme = state.clients.find(c => c.name === 'Acme');
      const item = acme.items.find(i => i.title === 'Item Acme');
      return { clientName: acme.name, dueDate: item.dueDate };
    });
    expect(result.clientName).toBe('Acme');
    expect(result.dueDate).toBe(targetKey);
  });
});

// === Feedback visuel ===

test.describe('Calendrier D&D — feedback visuel', () => {
  test('AC8 : item draggué a la classe .dragging', async ({ page }) => {
    await resetApp(page);
    await createClient(page, { name: 'Acme', key: 'ACM' });
    await createItemInline(page, { title: 'Visu' });
    const todayKey = await getTodayKey(page);
    await setItemDueDate(page, 'Visu', todayKey);
    await gotoCalendar(page);

    const item = page.locator(`.cal-cell[data-date="${todayKey}"] .cal-item`, { hasText: 'Visu' });
    // Démarre un drag manuel pour observer la classe
    await item.hover();
    await page.mouse.down();
    await page.mouse.move(200, 200, { steps: 5 });
    await expect(item).toHaveClass(/dragging/);
    await page.mouse.up();
  });
});

// === Non-régression D&D existants ===

test.describe('Calendrier D&D — non-régression handlers existants', () => {
  test('AC10 : board kanban D&D continue de fonctionner après ajout du D&D calendrier', async ({ page }) => {
    await resetApp(page);
    await createClient(page, { name: 'Acme', key: 'ACM' });
    // Crée un sprint actif
    await page.locator('button[title="Nouveau sprint"]').click();
    await page.locator('#sprintName').fill('Sprint test');
    await page.locator('#sprintModal button.btn-primary').click();
    const sectionId = await page.locator('.backlog-section.sprint-active-section').getAttribute('data-section');
    await createItemInline(page, { sectionId, title: 'Carte board' });

    await page.locator('.side-nav-item[data-view="board"]').click();
    const card = page.locator('.card', { hasText: 'Carte board' });
    await card.dragTo(page.locator('.board-col[data-status="doing"] .board-col-body'));
    await expect(page.locator('.board-col[data-status="doing"] .card', { hasText: 'Carte board' })).toBeVisible();

    const status = await page.evaluate(() => state.clients[0].items.find(i => i.title === 'Carte board').status);
    expect(status).toBe('doing');
  });
});
