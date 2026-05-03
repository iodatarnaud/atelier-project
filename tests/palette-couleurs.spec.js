// WI-012 (ATE-26) — Tests E2E palette 10 couleurs (clients / epics / sprints).
// 6 tests obligatoires pour les ACs PRD#2 :
//   T1 — count 10 swatches × 3 modales (epic + client + sprint)
//   T2 — sprint sans couleur : dot sidebar fallback statut (rétro-compat US3)
//   T3 — sprint avec couleur custom : sélection + désélection (nullable) + persistance
//   T4 — sprint actif coloré distinct (ring `--story` obligatoire)
//   T5 — sécurité : import hostile color XSS → null + DOM propre
//   T6 — sécurité : import hex hors palette → null (palette stricte)
const { test, expect, resetApp, createClient, createSprint, snapshotSave, waitForSave } = require('./helpers');

// Palette WI-012 itération #2 (post-VALIDATION_UI Arnaud) : 10 teintes
// distinctes, un seul vert + un seul violet. `#0052cc` reste premier
// (DEFAULT_EPIC_COLOR historique).
const EXPECTED_COLORS = ['#0052cc', '#2e7d32', '#f57c00', '#d32f2f', '#00838f', '#6a1b9a', '#c2185b', '#795548', '#455a64', '#f9a825'];

test.use({ viewport: { width: 1440, height: 900 } });

test.describe('Palette 10 couleurs — clients / epics / sprints (WI-012 / ATE-26)', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
    await createClient(page, { name: 'Palette', key: 'PAL' });
  });

  test('T1 — 10 swatches dans modales epic ET client ET sprint', async ({ page }) => {
    // Modale epic
    await page.locator('button[title="Nouvel epic"]').click();
    await expect(page.locator('#epicModal')).toHaveClass(/show/);
    const epicCount = await page.locator('#epicColors .epic-color-swatch').count();
    expect(epicCount).toBe(10);
    await page.locator('#epicModal .modal-close').click();

    // Modale client (édition projet existant)
    await page.locator('button[title="Ajouter un projet"]').click();
    await expect(page.locator('#clientModal')).toHaveClass(/show/);
    const clientCount = await page.locator('#clientColors .epic-color-swatch').count();
    expect(clientCount).toBe(10);
    await page.locator('#clientModal .modal-close').click();

    // Modale sprint
    await page.locator('button[title="Nouveau sprint"]').click();
    await expect(page.locator('#sprintModal')).toHaveClass(/show/);
    const sprintCount = await page.locator('#sprintColors .epic-color-swatch').count();
    expect(sprintCount).toBe(10);

    // Vérifie aussi l'ordre canonique (ordre source de vérité COLORS).
    const sprintHexes = await page.locator('#sprintColors .epic-color-swatch').evaluateAll(
      els => els.map(el => el.dataset.color)
    );
    expect(sprintHexes).toEqual(EXPECTED_COLORS);
  });

  test('T7 Codex — swatches epic/client non-nullable : reclic garde une sélection', async ({ page }) => {
    await page.locator('button[title="Nouvel epic"]').click();
    await expect(page.locator('#epicModal')).toHaveClass(/show/);
    await expect(page.locator('#epicColors .epic-color-swatch.selected')).toHaveCount(1);
    await page.locator('#epicColors .epic-color-swatch.selected').click();
    await expect(page.locator('#epicColors .epic-color-swatch.selected')).toHaveCount(1);
    await page.locator('#epicModal .modal-close').click();

    await page.locator('button[title="Ajouter un projet"]').click();
    await expect(page.locator('#clientModal')).toHaveClass(/show/);
    await expect(page.locator('#clientColors .epic-color-swatch.selected')).toHaveCount(1);
    await page.locator('#clientColors .epic-color-swatch.selected').click();
    await expect(page.locator('#clientColors .epic-color-swatch.selected')).toHaveCount(1);
  });

  test('T2 — sprint sans couleur : dot sidebar = couleur statut legacy (rétro-compat US3)', async ({ page }) => {
    // Sprint créé sans color → fallback statut. Active par défaut.
    await createSprint(page, { name: 'Sprint legacy' });

    const dot = page.locator('[data-sprint-id] .sprint-dot').first();
    await expect(dot).toBeVisible();

    const styleInfo = await dot.evaluate(el => {
      const cs = getComputedStyle(el);
      return {
        background: cs.backgroundColor,
        boxShadow: cs.boxShadow,
        inlineStyle: el.getAttribute('style') || '',
      };
    });

    // Sprint actif sans couleur → background = var(--story) (vert résolu).
    // Pas de box-shadow (legacy).
    expect(styleInfo.boxShadow === 'none' || styleInfo.boxShadow === '').toBe(true);
    // Le style inline doit référencer var(--story), pas un hex.
    expect(styleInfo.inlineStyle).toContain('var(--story)');
    expect(styleInfo.inlineStyle).not.toMatch(/#[0-9a-f]{6}/i);
  });

  test('T3 — sprint avec couleur custom : sélection + désélection + persistance', async ({ page }) => {
    // Étape 1 : créer un sprint avec couleur (jaune ambré, 10e couleur).
    await page.locator('button[title="Nouveau sprint"]').click();
    await expect(page.locator('#sprintModal')).toHaveClass(/show/);
    await page.locator('#sprintName').fill('Sprint coloré');
    // Click sur la swatch #f9a825 (10e — jaune ambré, palette itération #2).
    await page.locator('#sprintColors .epic-color-swatch[data-color="#f9a825"]').click();
    await expect(page.locator('#sprintColors .epic-color-swatch.selected')).toHaveAttribute('data-color', '#f9a825');
    const t0 = await snapshotSave(page);
    await page.locator('#sprintModal button.btn-primary').click();
    await expect(page.locator('#sprintModal')).not.toHaveClass(/show/);
    await waitForSave(page, { from: t0 });

    // State persisté : sprint a bien color: #f9a825.
    const stored = await page.evaluate(() => {
      const c = state.clients.find(c => c.id === state.activeClientId);
      const s = c.sprints[c.sprints.length - 1];
      return { name: s.name, color: s.color };
    });
    expect(stored).toEqual({ name: 'Sprint coloré', color: '#f9a825' });

    // Étape 2 : ré-ouvrir le sprint et désélectionner (nullable: true).
    await page.locator('[data-sprint-id]').first().hover();
    await page.locator('[data-sprint-id]').first().locator('.side-action.menu').click({ force: true });
    await page.locator('#actionMenu .action-menu-item', { hasText: 'Modifier' }).click();
    await expect(page.locator('#sprintModal')).toHaveClass(/show/);
    await expect(page.locator('#sprintColors .epic-color-swatch.selected')).toHaveAttribute('data-color', '#f9a825');
    // Click une 2e fois sur la swatch sélectionnée → désélectionne.
    await page.locator('#sprintColors .epic-color-swatch[data-color="#f9a825"]').click();
    await expect(page.locator('#sprintColors .epic-color-swatch.selected')).toHaveCount(0);
    const t1 = await snapshotSave(page);
    await page.locator('#sprintModal button.btn-primary').click();
    await expect(page.locator('#sprintModal')).not.toHaveClass(/show/);
    await waitForSave(page, { from: t1 });

    const afterDeselect = await page.evaluate(() => {
      const c = state.clients.find(c => c.id === state.activeClientId);
      const s = c.sprints[c.sprints.length - 1];
      return { color: s.color };
    });
    expect(afterDeselect.color).toBeNull();

    // Étape 3 : reload page, vérifie que `color: null` survit (rétro-compat).
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.locator('#syncIndicator').waitFor({ state: 'visible' });
    await page.waitForTimeout(150);
    const reloaded = await page.evaluate(() => {
      const c = state.clients.find(c => c.id === state.activeClientId);
      const s = c.sprints[c.sprints.length - 1];
      return { color: s.color };
    });
    expect(reloaded.color).toBeNull();
  });

  test('T4 — sprint actif coloré : ring `--story` distinct du futur coloré (P1#1 Codex)', async ({ page }) => {
    // Crée 2 sprints avec couleurs DIFFÉRENTES : un actif, un futur.
    // Sprint 1 (auto-actif).
    await page.locator('button[title="Nouveau sprint"]').click();
    await page.locator('#sprintName').fill('Actif coloré');
    await page.locator('#sprintColors .epic-color-swatch[data-color="#2e7d32"]').click();
    const t0 = await snapshotSave(page);
    await page.locator('#sprintModal button.btn-primary').click();
    await expect(page.locator('#sprintModal')).not.toHaveClass(/show/);
    await waitForSave(page, { from: t0 });

    // Sprint 2 (créé après → premier devient inactif, celui-ci devient actif).
    // On veut que Sprint 1 reste actif → on désactive Sprint 2 manuellement.
    await page.locator('button[title="Nouveau sprint"]').click();
    await page.locator('#sprintName').fill('Futur coloré');
    await page.locator('#sprintColors .epic-color-swatch[data-color="#6a1b9a"]').click();
    const t1 = await snapshotSave(page);
    await page.locator('#sprintModal button.btn-primary').click();
    await expect(page.locator('#sprintModal')).not.toHaveClass(/show/);
    await waitForSave(page, { from: t1 });

    // Re-active "Actif coloré" via state direct (logique métier :
    // quand on crée un nouveau sprint, il devient actif, l'autre devient futur).
    const t2 = await snapshotSave(page);
    await page.evaluate(() => {
      const c = state.clients.find(c => c.id === state.activeClientId);
      c.sprints.forEach(s => { s.active = (s.name === 'Actif coloré'); });
      saveState();
      render();
    });
    await waitForSave(page, { from: t2 });

    // Capture les styles des deux dots.
    const styles = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('[data-sprint-id]'));
      const result = {};
      for (const item of items) {
        const dot = item.querySelector('.sprint-dot');
        const name = item.textContent.trim();
        const cs = getComputedStyle(dot);
        result[name.split('\n')[0].trim().split(' ')[0]] = {
          background: cs.backgroundColor,
          boxShadow: cs.boxShadow,
          inlineStyle: dot.getAttribute('style'),
        };
      }
      return result;
    });

    // Dot actif coloré : couleur custom + ring --story (box-shadow non-none).
    const actif = Object.values(styles).find(s => s.inlineStyle.includes('#2e7d32'));
    const futur = Object.values(styles).find(s => s.inlineStyle.includes('#6a1b9a'));
    expect(actif).toBeDefined();
    expect(futur).toBeDefined();
    // Actif a un box-shadow ring var(--story) inline.
    expect(actif.inlineStyle).toContain('box-shadow:0 0 0 2px var(--story)');
    // Futur n'a PAS de ring.
    expect(futur.inlineStyle).not.toContain('box-shadow');
    // Distinguabilité runtime : box-shadow computed différent.
    expect(actif.boxShadow).not.toBe(futur.boxShadow);
  });

  test('T8 Codex — sprint terminé coloré : couleur conservée + statut visible', async ({ page }) => {
    await page.locator('button[title="Nouveau sprint"]').click();
    await page.locator('#sprintName').fill('Terminé coloré');
    await page.locator('#sprintColors .epic-color-swatch[data-color="#c2185b"]').click();
    const t0 = await snapshotSave(page);
    await page.locator('#sprintModal button.btn-primary').click();
    await expect(page.locator('#sprintModal')).not.toHaveClass(/show/);
    await waitForSave(page, { from: t0 });

    await page.evaluate(async () => {
      const client = state.clients.find(c => c.id === state.activeClientId);
      const sprint = client.sprints.find(s => s.name === 'Terminé coloré');
      sprint.completed = true;
      sprint.active = false;
      await saveState();
      render();
    });

    const row = page.locator('[data-sprint-id]', { hasText: 'Terminé coloré' });
    const styleInfo = await row.locator('.sprint-dot').evaluate(el => {
      const cs = getComputedStyle(el);
      return {
        inlineStyle: el.getAttribute('style') || '',
        opacity: cs.opacity,
        boxShadow: cs.boxShadow,
      };
    });
    const nameDecoration = await row.locator('span').nth(1).evaluate(el => getComputedStyle(el).textDecorationLine);

    expect(styleInfo.inlineStyle).toContain('#c2185b');
    expect(styleInfo.inlineStyle).toContain('opacity:0.55');
    expect(styleInfo.boxShadow === 'none' || styleInfo.boxShadow === '').toBe(true);
    expect(nameDecoration).toContain('line-through');
  });

  test('T5 — sécurité : import sprint avec color XSS → null + aucun payload dans le DOM', async ({ page }) => {
    const result = await page.evaluate(() => {
      const hostile = {
        clients: [
          {
            id: 'good-client',
            name: 'Légitime',
            key: 'OK1',
            counter: 0,
            color: '#0052cc',
            sprints: [
              {
                id: 'sprint-xss',
                name: 'Sprint piégé',
                startDate: null,
                endDate: null,
                active: true,
                completed: false,
                // Payload XSS : essaie de fermer l'attribut style et injecter onclick.
                color: 'red" onclick="window.__pwn_sprintcolor=1" data-x="'
              }
            ],
            epics: [],
            items: []
          }
        ],
        activeClientId: 'good-client',
        lastSavedAt: Date.now()
      };
      const normalized = normalizeImportedState(hostile);
      state.clients = normalized.clients;
      state.activeClientId = normalized.activeClientId;
      render();
      return {
        sprintColor: state.clients[0].sprints[0].color,
        bodyHtmlContainsPwn: document.body.innerHTML.includes('__pwn_sprintcolor'),
        pwnFlag: typeof window.__pwn_sprintcolor !== 'undefined',
      };
    });

    // 1) color invalide → null (palette stricte + non-hex).
    expect(result.sprintColor).toBeNull();
    // 2) Payload n'apparaît nulle part dans le DOM rendu.
    expect(result.bodyHtmlContainsPwn).toBe(false);
    // 3) Aucun side-effect global déclenché.
    expect(result.pwnFlag).toBe(false);
  });

  test('T6 — sécurité : import sprint hex hors palette → null (palette stricte)', async ({ page }) => {
    const result = await page.evaluate(() => {
      // Helper exposé dans __atelierInternals + fonction _normalizeSprint top-level.
      const sprint = _normalizeSprint({
        id: 'sprint-hors',
        name: 'Sprint hors palette',
        startDate: null,
        endDate: null,
        active: false,
        completed: false,
        color: '#ff00ff'  // hex valide mais hors COLORS
      });
      // Cas positif : uppercase d'une couleur canonique lowercase → renvoie la
      // canonique (palette itération #2 = tout lowercase). Vérifie comparaison
      // case-insensitive + stockage canonique du helper.
      const sprintUpper = _normalizeSprint({
        id: 'sprint-upper',
        name: 'Sprint upper',
        startDate: null,
        endDate: null,
        active: false,
        completed: false,
        color: '#F9A825'  // uppercase de #f9a825 (jaune ambré)
      });
      // Cas DEFAULT_EPIC_COLOR cohérent avec COLORS[0].
      return {
        outOfPalette: sprint.color,
        canonicalFromUppercase: sprintUpper.color,
        defaultEqualsFirst: window.__atelierInternals?.DEFAULT_EPIC_COLOR === window.__atelierInternals?.COLORS?.[0],
      };
    });

    expect(result.outOfPalette).toBeNull();
    expect(result.canonicalFromUppercase).toBe('#f9a825');
    expect(result.defaultEqualsFirst).toBe(true);
  });

  // P1 CODE_REVIEW#2 Codex — itération #3 : prouve qu'un import / state local
  // contenant des couleurs de l'ancienne palette pré-itération #2 ressort avec
  // les nouvelles canoniques (zéro perte silencieuse de couleur), tout en
  // gardant la stricte allowlist (hex hostile / hors allowlist toujours rejeté).
  test('T9 — migration legacy WI-012 itération #2 → #3 : anciennes couleurs préservées via remap', async ({ page }) => {
    const result = await page.evaluate(() => {
      // Cas 1 : import complet d'un état "v0.20.0-style" avec client + epic
      // en couleurs historiques. Doit ressortir avec canoniques nouvelle palette.
      const legacy = {
        clients: [{
          id: 'c-legacy',
          name: 'Legacy',
          key: 'LEG',
          counter: 1,
          color: '#36b37e',  // ancien vert → #2e7d32
          sprints: [],
          epics: [
            { id: 'e-legacy-1', name: 'Old violet', color: '#8777d9' },  // → #6a1b9a
            { id: 'e-legacy-2', name: 'Old orange', color: '#ff8b00' },  // → #f57c00
            { id: 'e-legacy-3', name: 'Old red', color: '#e5493a' },     // → #d32f2f
            { id: 'e-legacy-4', name: 'Old light-blue', color: '#4bade8' } // → #00838f
          ],
          items: []
        }],
        activeClientId: 'c-legacy',
        lastSavedAt: Date.now()
      };
      const normalized = normalizeImportedState(legacy);

      // Cas 2 : tous les remaps explicites via le helper direct.
      const mappings = {
        '#36b37e': normalizePaletteColor('#36b37e', { fallback: null }),
        '#8777d9': normalizePaletteColor('#8777d9', { fallback: null }),
        '#ff8b00': normalizePaletteColor('#ff8b00', { fallback: null }),
        '#e5493a': normalizePaletteColor('#e5493a', { fallback: null }),
        '#4bade8': normalizePaletteColor('#4bade8', { fallback: null }),
        '#e9a83a': normalizePaletteColor('#e9a83a', { fallback: null }),
        '#cd1f1f': normalizePaletteColor('#cd1f1f', { fallback: null }),
      };

      // Cas 3 : case-insensitive sur la migration (uppercase legacy → canonique).
      const uppercaseLegacy = normalizePaletteColor('#36B37E', { fallback: null });

      // Cas 4 : l'allowlist reste stricte — hex hostile / hors palette / hors
      // legacy → toujours fallback.
      const hostileSprint = _normalizeSprint({
        id: 'sx', name: 'X', startDate: null, endDate: null,
        active: false, completed: false,
        color: '#ff00ff'  // hors COLORS ET hors LEGACY → null
      }).color;

      return {
        clientColor: normalized.clients[0].color,
        epicColors: normalized.clients[0].epics.map(e => e.color),
        mappings,
        uppercaseLegacy,
        hostileSprint,
      };
    });

    // Cas 1 : import legacy → canoniques nouvelle palette.
    expect(result.clientColor).toBe('#2e7d32');
    expect(result.epicColors).toEqual(['#6a1b9a', '#f57c00', '#d32f2f', '#00838f']);

    // Cas 2 : table de migration complète exposée par le helper.
    expect(result.mappings).toEqual({
      '#36b37e': '#2e7d32',
      '#8777d9': '#6a1b9a',
      '#ff8b00': '#f57c00',
      '#e5493a': '#d32f2f',
      '#4bade8': '#00838f',
      '#e9a83a': '#f9a825',
      '#cd1f1f': '#d32f2f',
    });

    // Cas 3 : migration case-insensitive.
    expect(result.uppercaseLegacy).toBe('#2e7d32');

    // Cas 4 : allowlist reste stricte (sécurité).
    expect(result.hostileSprint).toBeNull();
  });
});
