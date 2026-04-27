const { test: base, expect } = require('@playwright/test');

// Fixture override : force un nouveau BrowserContext par test (isolation IndexedDB
// stricte, que la fixture par défaut Playwright ne suffit pas à garantir dans notre
// setup) et set `window.__SKIP_SEED__` pour empêcher l'app de seed les 2 clients
// démo dans une DB vide — ce qui polluerait les assertions de count.
const test = base.extend({
  page: async ({ browser }, use) => {
    const context = await browser.newContext();
    await context.addInitScript(() => { window.__SKIP_SEED__ = true; });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

async function resetApp(page) {
  await page.goto('/index.html');
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#syncIndicator').waitFor({ state: 'visible' });
  // Laisse loadState() async + render() finir.
  await page.waitForTimeout(150);
}

async function createClient(page, { name, key }) {
  await page.locator('button[title="Ajouter un projet"]').click();
  await expect(page.locator('#clientModal')).toHaveClass(/show/);
  await page.locator('#clientName').fill(name);
  await page.locator('#clientKey').fill(key);
  await page.locator('#clientModal button.btn-primary').click();
  await expect(page.locator('#clientModal')).not.toHaveClass(/show/);
  await expect(page.locator('#clientList .side-item.active')).toContainText(name);
}

async function createSprint(page, { name, start, end } = {}) {
  await page.locator('button[title="Nouveau sprint"]').click();
  await expect(page.locator('#sprintModal')).toHaveClass(/show/);
  await page.locator('#sprintName').fill(name);
  if (start) await page.locator('#sprintStart').fill(start);
  if (end) await page.locator('#sprintEnd').fill(end);
  await page.locator('#sprintModal button.btn-primary').click();
  await expect(page.locator('#sprintModal')).not.toHaveClass(/show/);
}

// Crée un item via le formulaire inline d'une section.
// `sectionId` : 'backlog' (par défaut) ou l'id du sprint actif (sX).
async function createItemInline(page, { sectionId = 'backlog', title, type = 'task', priority = 2, estimate, due } = {}) {
  const section = page.locator(`[data-section="${sectionId}"]`);
  await section.locator('.add-row').click();
  const form = section.locator(`#form-${sectionId}`);
  await expect(form).toBeVisible();
  await form.locator('.if-type').selectOption(type);
  await form.locator('.if-prio').selectOption(String(priority));
  await form.locator('.if-title').fill(title);
  if (estimate !== undefined) await form.locator('.if-est').fill(String(estimate));
  if (due) await form.locator('.if-due').fill(due);
  await form.locator('button.btn-primary').click();
  await expect(section.getByText(title, { exact: false })).toBeVisible();
}

async function openItemDetailByTitle(page, title) {
  await page.getByText(title, { exact: true }).first().click();
  await expect(page.locator('#itemModal')).toHaveClass(/show/);
}

async function closeItemDetail(page) {
  await page.locator('#itemModal .modal-close').click();
  await expect(page.locator('#itemModal')).not.toHaveClass(/show/);
}

module.exports = {
  test,
  expect,
  resetApp,
  createClient,
  createSprint,
  createItemInline,
  openItemDetailByTitle,
  closeItemDetail,
};
