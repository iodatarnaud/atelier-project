// WI-004 / ATE-22 — Sync multi-instances : push-guard, pull au focus, toast conflit.
// Mock du Gist côté Playwright via page.route. La sync est pré-configurée en localStorage
// AVANT le boot, ce qui permet à loadState() d'aller fetch via le mock dès le premier load.
const { test, expect } = require('@playwright/test');
const { createClient, createItemInline } = require('./helpers');

const FAKE_TOKEN = 'fake-token-WI-004';
const FAKE_GIST = 'fakegist-WI-004';
const GIST_FILENAME = 'atelier-data.json';

function makePayload(overrides = {}) {
  return {
    clients: [{ id: 'rc1', name: 'Remote', key: 'RMT', counter: 0, items: [], sprints: [], epics: [] }],
    activeClientId: 'rc1',
    lastSavedAt: 1_000_000,
    ...overrides,
  };
}

function gistEnvelope(payload) {
  return {
    files: {
      [GIST_FILENAME]: { content: JSON.stringify(payload, null, 2) },
    },
  };
}

async function setupSyncMock(page, initialPayload, opts = {}) {
  const state = {
    payload: JSON.parse(JSON.stringify(initialPayload)),
    getCount: 0,
    patchCount: 0,
    getShouldFail: false,
  };

  await page.route(`**/api.github.com/gists/${FAKE_GIST}`, async (route) => {
    const req = route.request();
    if (req.method() === 'GET') {
      state.getCount++;
      if (state.getShouldFail) {
        await route.fulfill({ status: 500, contentType: 'text/plain', body: 'mock-failure' });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(gistEnvelope(state.payload)),
      });
      return;
    }
    if (req.method() === 'PATCH') {
      state.patchCount++;
      try {
        const body = req.postDataJSON();
        const fileContent = body && body.files && body.files[GIST_FILENAME] && body.files[GIST_FILENAME].content;
        if (fileContent) state.payload = JSON.parse(fileContent);
      } catch (e) { /* keep previous payload on parse failure */ }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(gistEnvelope(state.payload)),
      });
      return;
    }
    await route.continue();
  });

  if (!opts.skipConfig) {
    await page.addInitScript(({ token, gistId }) => {
      try {
        localStorage.setItem('atelier-config-v1', JSON.stringify({ token, gistId, connected: true }));
        window.__SKIP_SEED__ = true;
      } catch (e) {}
    }, { token: FAKE_TOKEN, gistId: FAKE_GIST });
  }

  return {
    bumpRemote(payload) { state.payload = JSON.parse(JSON.stringify(payload)); },
    getRemote() { return JSON.parse(JSON.stringify(state.payload)); },
    setGetShouldFail(v) { state.getShouldFail = !!v; },
    counts() { return { get: state.getCount, patch: state.patchCount }; },
  };
}

async function gotoApp(page) {
  await page.goto('/index.html');
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#syncIndicator').waitFor({ state: 'visible' });
  await page.waitForTimeout(300);
}

async function fireFocus(page) {
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
}

test.describe('Sync multi-instances (WI-004 / ATE-22)', () => {
  test('AC11 — boot avec sync configurée : fetch initial OK, label GitHub', async ({ page }) => {
    const initial = makePayload({ lastSavedAt: 1_000_000 });
    const mock = await setupSyncMock(page, initial);
    await gotoApp(page);

    await expect(page.locator('#syncLabel')).toContainText('GitHub');
    expect(mock.counts().get).toBeGreaterThanOrEqual(1);
    expect(mock.counts().patch).toBe(0);
    // Le client remote est bien chargé (state remplacé par remote au boot puisque local vide).
    await expect(page.locator('#clientList .side-item')).toHaveCount(1);
    await expect(page.locator('#clientList .side-item.active')).toContainText('Remote');
  });

  test('AC1 — pull au focus sans dirty : remote plus récent → applique + toast info', async ({ page }) => {
    const initial = makePayload({ lastSavedAt: 1_000_000 });
    const mock = await setupSyncMock(page, initial);
    await gotoApp(page);
    const before = mock.counts().get;

    // Bump remote (autre instance a pushé entre temps).
    mock.bumpRemote(makePayload({
      clients: [{ id: 'rc1', name: 'RemoteUpdated', key: 'RMT', counter: 0, items: [], sprints: [], epics: [] }],
      activeClientId: 'rc1',
      lastSavedAt: 2_000_000,
    }));

    await fireFocus(page);
    await page.waitForTimeout(300);

    // Un GET au moins de plus a été émis.
    expect(mock.counts().get).toBeGreaterThan(before);
    // Toast info visible.
    await expect(page.locator('#toast')).toContainText(/Données mises à jour/);
    // State remplacé : le nom du projet a été mis à jour silencieusement.
    await expect(page.locator('#clientList .side-item.active')).toContainText('RemoteUpdated');
    // Aucun toast conflit.
    await expect(page.locator('#syncConflictToast')).toBeHidden();
  });

  test('AC2 — pull au focus avec dirty : remote plus récent → toast conflit (pas d\'apply auto)', async ({ page }) => {
    const initial = makePayload({ lastSavedAt: 1_000_000 });
    const mock = await setupSyncMock(page, initial);
    await gotoApp(page);

    // Provoque une modif locale = local dirty.
    await createItemInline(page, { sectionId: 'backlog', title: 'Item local non pushé' });
    await page.waitForTimeout(50);
    // ATTENTION : le push-guard va déclencher un GET au bout de 2,5s. Pour bien
    // tester le focus avec local dirty, on bump le remote et on déclenche le focus
    // AVANT que le timer ne sonne.
    mock.bumpRemote(makePayload({
      clients: [{ id: 'rc1', name: 'RemoteWinner', key: 'RMT', counter: 0, items: [], sprints: [], epics: [] }],
      activeClientId: 'rc1',
      lastSavedAt: 3_000_000,
    }));
    await fireFocus(page);
    await page.waitForTimeout(400);

    await expect(page.locator('#syncConflictToast')).toBeVisible();
    await expect(page.locator('#syncConflictToast')).toContainText(/Données distantes plus récentes/);
    // L'item local n'est pas écrasé tant que l'utilisateur n'a pas tranché.
    await expect(page.locator('.backlog-row', { hasText: 'Item local non pushé' })).toBeVisible();
  });

  test('AC3 push-guard erreur GET : push annulé + toast erreur', async ({ page }) => {
    const initial = makePayload({ lastSavedAt: 1_000_000 });
    const mock = await setupSyncMock(page, initial);
    await gotoApp(page);
    const baseline = mock.counts().patch;

    // Force le prochain GET à échouer.
    mock.setGetShouldFail(true);

    await createItemInline(page, { sectionId: 'backlog', title: 'Item push qui rate' });
    // Attend que le debounce (2,5s) expire et que le push-guard tente le GET.
    await page.waitForTimeout(3200);

    // Toast erreur (utilise le toast volatil #toast).
    await expect(page.locator('#toast')).toContainText(/Sync indisponible/);
    // Aucun PATCH n'a été émis.
    expect(mock.counts().patch).toBe(baseline);
  });

  test('AC3 push-guard normal : modif locale → GET puis PATCH OK', async ({ page }) => {
    const initial = makePayload({ lastSavedAt: 1_000_000 });
    const mock = await setupSyncMock(page, initial);
    await gotoApp(page);
    const baselinePatch = mock.counts().patch;

    await createItemInline(page, { sectionId: 'backlog', title: 'Item à pusher' });
    await page.waitForTimeout(3200);

    // Un PATCH au moins a été émis.
    expect(mock.counts().patch).toBeGreaterThan(baselinePatch);
    // Pas de conflit.
    await expect(page.locator('#syncConflictToast')).toBeHidden();
  });

  test('AC3 push-guard conflit : remote bumped pendant l\'édition → toast conflit', async ({ page }) => {
    const initial = makePayload({ lastSavedAt: 1_000_000 });
    const mock = await setupSyncMock(page, initial);
    await gotoApp(page);
    const baselinePatch = mock.counts().patch;

    await createItemInline(page, { sectionId: 'backlog', title: 'Local A' });
    // Avant que le debounce ne sonne, une autre instance a pushé.
    mock.bumpRemote(makePayload({
      clients: [{ id: 'rc1', name: 'RemoteAhead', key: 'RMT', counter: 0, items: [], sprints: [], epics: [] }],
      activeClientId: 'rc1',
      lastSavedAt: 5_000_000,
    }));
    await page.waitForTimeout(3200);

    // Aucun PATCH n'a été émis (push bloqué).
    expect(mock.counts().patch).toBe(baselinePatch);
    // Toast conflit visible avec ses 3 boutons (AC4).
    await expect(page.locator('#syncConflictToast')).toBeVisible();
    await expect(page.locator('[data-testid="sync-reload"]')).toBeVisible();
    await expect(page.locator('[data-testid="sync-keep-local"]')).toBeVisible();
    await expect(page.locator('[data-testid="sync-view-diff"]')).toBeVisible();
  });

  test('AC5 — action "Recharger" : applique remote, ferme conflit, toast info', async ({ page }) => {
    const initial = makePayload({ lastSavedAt: 1_000_000 });
    const mock = await setupSyncMock(page, initial);
    await gotoApp(page);

    await createItemInline(page, { sectionId: 'backlog', title: 'Local sera jeté' });
    mock.bumpRemote(makePayload({
      clients: [{ id: 'rc1', name: 'RemoteRecharge', key: 'RMT', counter: 0, items: [], sprints: [], epics: [] }],
      activeClientId: 'rc1',
      lastSavedAt: 6_000_000,
    }));
    await page.waitForTimeout(3200);
    await expect(page.locator('#syncConflictToast')).toBeVisible();

    await page.locator('[data-testid="sync-reload"]').click();
    await page.waitForTimeout(200);

    await expect(page.locator('#syncConflictToast')).toBeHidden();
    await expect(page.locator('#toast')).toContainText(/Synchronisé/);
    // L'item local a été jeté, le projet remote est appliqué.
    await expect(page.locator('#clientList .side-item.active')).toContainText('RemoteRecharge');
    await expect(page.locator('.backlog-row', { hasText: 'Local sera jeté' })).toHaveCount(0);
  });

  test('AC6 — action "Garder local" : push forcé, conflit fermé, toast confirmation', async ({ page }) => {
    const initial = makePayload({ lastSavedAt: 1_000_000 });
    const mock = await setupSyncMock(page, initial);
    await gotoApp(page);

    await createItemInline(page, { sectionId: 'backlog', title: 'Local gagne' });
    mock.bumpRemote(makePayload({
      clients: [{ id: 'rc1', name: 'RemotePerd', key: 'RMT', counter: 0, items: [], sprints: [], epics: [] }],
      activeClientId: 'rc1',
      lastSavedAt: 7_000_000,
    }));
    await page.waitForTimeout(3200);
    await expect(page.locator('#syncConflictToast')).toBeVisible();
    const baselinePatch = mock.counts().patch;

    await page.locator('[data-testid="sync-keep-local"]').click();
    await page.waitForTimeout(300);

    expect(mock.counts().patch).toBeGreaterThan(baselinePatch);
    await expect(page.locator('#syncConflictToast')).toBeHidden();
    await expect(page.locator('#toast')).toContainText(/Version locale poussée/);
    // L'item local est toujours là.
    await expect(page.locator('.backlog-row', { hasText: 'Local gagne' })).toBeVisible();
  });

  test('AC7 — action "Voir diff" : modale avec compteurs et items divergents', async ({ page }) => {
    // Init local + remote AVEC un item commun à titre divergent.
    const initial = makePayload({
      clients: [{ id: 'rc1', name: 'Shared', key: 'SHR', counter: 1, items: [
        { id: 'i-shared', title: 'Titre remote', type: 'task', priority: 2, status: 'todo' },
      ], sprints: [], epics: [] }],
      activeClientId: 'rc1',
      lastSavedAt: 1_000_000,
    });
    const mock = await setupSyncMock(page, initial);
    await gotoApp(page);

    // Modifie le titre côté local pour le même id → divergence garantie.
    await page.evaluate(() => {
      const c = state.clients[0];
      c.items[0].title = 'Titre local';
      saveState();
    });
    await page.waitForTimeout(100);
    // Bump remote (encore plus récent).
    mock.bumpRemote(makePayload({
      clients: [{ id: 'rc1', name: 'Shared', key: 'SHR', counter: 1, items: [
        { id: 'i-shared', title: 'Titre remote', type: 'task', priority: 2, status: 'todo' },
        { id: 'i-extra', title: 'Item bonus remote', type: 'task', priority: 2, status: 'todo' },
      ], sprints: [], epics: [] }],
      activeClientId: 'rc1',
      lastSavedAt: 8_000_000,
    }));
    await page.waitForTimeout(3200);
    await expect(page.locator('#syncConflictToast')).toBeVisible();

    await page.locator('[data-testid="sync-view-diff"]').click();
    await expect(page.locator('#syncDiffModal')).toHaveClass(/show/);
    await expect(page.locator('#syncDiffBody')).toContainText('Clients');
    await expect(page.locator('#syncDiffBody')).toContainText('Items');
    await expect(page.locator('#syncDiffBody')).toContainText(/i-shared/);
    await expect(page.locator('#syncDiffBody')).toContainText(/Titre local/);
    await expect(page.locator('#syncDiffBody')).toContainText(/Titre remote/);

    // Échap ferme la modale, le toast conflit reste.
    await page.keyboard.press('Escape');
    await expect(page.locator('#syncDiffModal')).not.toHaveClass(/show/);
    await expect(page.locator('#syncConflictToast')).toBeVisible();
  });

  test('AC10 — mode test : aucun GET au focus, aucun listener attaché', async ({ page }) => {
    // Pré-configure mode test ET sync (pour vérifier que la sync est bien désactivée).
    await page.addInitScript(({ token, gistId }) => {
      try {
        localStorage.setItem('atelier-mode-test', '1');
        localStorage.setItem('atelier-config-v1', JSON.stringify({ token, gistId, connected: true }));
      } catch (e) {}
    }, { token: FAKE_TOKEN, gistId: FAKE_GIST });
    const mock = await setupSyncMock(page, makePayload(), { skipConfig: true });

    await page.goto('/index.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(300);
    await expect(page.locator('#testModeBanner')).toBeVisible();

    const before = mock.counts().get;
    await fireFocus(page);
    await page.waitForTimeout(300);
    // Aucun GET supplémentaire en mode test.
    expect(mock.counts().get).toBe(before);
  });

  test('Concurrence focus GET + timer push : le push dirty n\'est pas perdu (CODE_REVIEW P1)', async ({ page }) => {
    // Setup avec un délai injecté sur GET pour étirer la fenêtre `_syncCheckInFlight`.
    // Quand le timer 2,5s du push tombe pendant ce GET, runGuardedPush() doit re-planifier
    // au lieu d'abandonner — sinon `_localDirtySinceTs` resterait non-null.
    const initial = makePayload({ lastSavedAt: 1_000_000 });
    let getDelayMs = 0;
    const state = { payload: JSON.parse(JSON.stringify(initial)), getCount: 0, patchCount: 0 };
    await page.route(`**/api.github.com/gists/${FAKE_GIST}`, async (route) => {
      const req = route.request();
      if (req.method() === 'GET') {
        state.getCount++;
        if (getDelayMs > 0) await new Promise(r => setTimeout(r, getDelayMs));
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(gistEnvelope(state.payload)) });
        return;
      }
      if (req.method() === 'PATCH') {
        state.patchCount++;
        try {
          const body = req.postDataJSON();
          const fc = body && body.files && body.files[GIST_FILENAME] && body.files[GIST_FILENAME].content;
          if (fc) state.payload = JSON.parse(fc);
        } catch (e) {}
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(gistEnvelope(state.payload)) });
        return;
      }
      await route.continue();
    });
    await page.addInitScript(({ token, gistId }) => {
      try {
        localStorage.setItem('atelier-config-v1', JSON.stringify({ token, gistId, connected: true }));
        window.__SKIP_SEED__ = true;
      } catch (e) {}
    }, { token: FAKE_TOKEN, gistId: FAKE_GIST });
    await gotoApp(page);

    // Active le délai sur les prochains GET pour étirer le focus GET.
    getDelayMs = 1500;
    const baselinePatch = state.patchCount;

    await createItemInline(page, { sectionId: 'backlog', title: 'Item à ne pas perdre' });
    // Déclenche un focus juste après la modif. Le focus arme `_syncCheckInFlight=true`
    // pendant ~1500ms. Le timer push (2,5s) tombe pendant, donc runGuardedPush()
    // doit re-planifier (et NON abandonner).
    await page.waitForTimeout(150);
    await fireFocus(page);
    // Attend que les 2 GET (focus + push retry) + le PATCH se terminent.
    await page.waitForTimeout(5000);

    expect(state.patchCount).toBeGreaterThan(baselinePatch);
    await expect(page.locator('#syncConflictToast')).toBeHidden();
  });

  test('beforeunload pendant GET focus en vol : aucun PATCH keepalive émis (CODE_REVIEW#2 P1)', async ({ page }) => {
    // Scénario : local dirty → focus déclenche un GET (`_syncCheckInFlight=true`) →
    // l'utilisateur ferme l'onglet pendant que le GET est en vol. `beforeunload` doit
    // être inhibé (verdict du GET pas encore connu, on n'écrase pas le remote).
    const initial = makePayload({ lastSavedAt: 1_000_000 });
    let getDelayMs = 0;
    const state = { payload: JSON.parse(JSON.stringify(initial)), getCount: 0, patchCount: 0 };
    await page.route(`**/api.github.com/gists/${FAKE_GIST}`, async (route) => {
      const req = route.request();
      if (req.method() === 'GET') {
        state.getCount++;
        if (getDelayMs > 0) await new Promise(r => setTimeout(r, getDelayMs));
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(gistEnvelope(state.payload)) });
        return;
      }
      if (req.method() === 'PATCH') {
        state.patchCount++;
        try {
          const body = req.postDataJSON();
          const fc = body && body.files && body.files[GIST_FILENAME] && body.files[GIST_FILENAME].content;
          if (fc) state.payload = JSON.parse(fc);
        } catch (e) {}
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(gistEnvelope(state.payload)) });
        return;
      }
      await route.continue();
    });
    await page.addInitScript(({ token, gistId }) => {
      try {
        localStorage.setItem('atelier-config-v1', JSON.stringify({ token, gistId, connected: true }));
        window.__SKIP_SEED__ = true;
      } catch (e) {}
    }, { token: FAKE_TOKEN, gistId: FAKE_GIST });
    await gotoApp(page);

    getDelayMs = 1500;
    await createItemInline(page, { sectionId: 'backlog', title: 'Item dirty avant unload' });
    await page.waitForTimeout(150);
    // Lance le GET focus (mettra ~1500 ms à revenir).
    await fireFocus(page);
    await page.waitForTimeout(100); // laisse `_syncCheckInFlight` passer à true
    const baselinePatch = state.patchCount;

    // Dispatch un beforeunload synthétique pendant que le GET est en vol.
    await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')));
    await page.waitForTimeout(200);

    // Aucun PATCH keepalive n'a dû être émis (le handler beforeunload doit être inhibé).
    expect(state.patchCount).toBe(baselinePatch);
  });

  test('Déduplication focus + visibilitychange : un seul GET par réveil', async ({ page }) => {
    const initial = makePayload({ lastSavedAt: 1_000_000 });
    const mock = await setupSyncMock(page, initial);
    await gotoApp(page);
    const before = mock.counts().get;

    // Tire les 2 events quasi simultanément.
    await page.evaluate(() => {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(300);

    // Au plus 1 GET de plus (le 2e doit être bloqué par `_syncCheckInFlight`).
    expect(mock.counts().get - before).toBeLessThanOrEqual(1);
  });
});
