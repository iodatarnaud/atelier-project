const { test, expect, resetApp, createClient, createItemInline, openItemDetailByTitle } = require('./helpers');

test.beforeEach(async ({ page }) => {
  await resetApp(page);
  await createClient(page, { name: 'Acme', key: 'ACM' });
});

test.describe('Durée réelle WI — saisie + agrégation', () => {
  test('saisit actualHours sur un item terminé → globalStats affiche les jours réels', async ({ page }) => {
    // Crée un item, le passe en done, saisit la durée réelle (8h = 1j).
    await createItemInline(page, { title: 'Item livré', estimate: 1 });
    await openItemDetailByTitle(page, 'Item livré');
    await page.locator('#ed_status').selectOption('done');
    await page.locator('#ed_actual').fill('8');
    await page.locator('#itemModal .modal-actions .btn-primary').click();
    await expect(page.locator('#itemModal')).not.toHaveClass(/show/);

    // L'agrégation header doit afficher "· 1 j réalisés / 1 j estimés (terminés)" :
    // - 8h / 8 = 1j réalisés
    // - estimate = 1 → 1j estimés (somme estimate des items done)
    await expect(page.locator('#globalStats')).toContainText('1 j réalisés');
    await expect(page.locator('#globalStats')).toContainText('1 j estimés (terminés)');
  });

  test('agrège plusieurs items terminés en jours (8h/j), ignore les non-done', async ({ page }) => {
    // Item 1 done : 12h
    await createItemInline(page, { title: 'Item A' });
    await openItemDetailByTitle(page, 'Item A');
    await page.locator('#ed_status').selectOption('done');
    await page.locator('#ed_actual').fill('12');
    await page.locator('#itemModal .modal-actions .btn-primary').click();
    await expect(page.locator('#itemModal')).not.toHaveClass(/show/);

    // Item 2 done : 4h
    await createItemInline(page, { title: 'Item B' });
    await openItemDetailByTitle(page, 'Item B');
    await page.locator('#ed_status').selectOption('done');
    await page.locator('#ed_actual').fill('4');
    await page.locator('#itemModal .modal-actions .btn-primary').click();
    await expect(page.locator('#itemModal')).not.toHaveClass(/show/);

    // Item 3 NON done : 99h (doit être ignoré dans l'agrégation)
    await createItemInline(page, { title: 'Item C en cours' });
    await openItemDetailByTitle(page, 'Item C en cours');
    await page.locator('#ed_status').selectOption('doing');
    await page.locator('#ed_actual').fill('99');
    await page.locator('#itemModal .modal-actions .btn-primary').click();
    await expect(page.locator('#itemModal')).not.toHaveClass(/show/);

    // Agrégation attendue : (12 + 4) / 8 = 2j réalisés (item C ignoré car status !== done).
    // estimate non saisi sur les 3 items → 0j estimés sur les terminés.
    // L'item doing avec actualHours=99 doit être strictement ignoré (filtre status === 'done').
    await expect(page.locator('#globalStats')).toContainText('2 j réalisés');
    await expect(page.locator('#globalStats')).toContainText('0 j estimés (terminés)');
    await expect(page.locator('#globalStats')).not.toContainText('99');
  });

  test('aucun item terminé → pas d\'affichage de la comparaison réalisés/estimés (header propre)', async ({ page }) => {
    await createItemInline(page, { title: 'Item neuf', estimate: 0.5 });
    // Item status=todo → realHoursDone === 0 ET estDaysDone === 0 → donePart caché.
    await expect(page.locator('#globalStats')).not.toContainText('j réalisés');
    await expect(page.locator('#globalStats')).not.toContainText('j estimés');
  });
});
