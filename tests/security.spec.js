const { test, expect, resetApp, createClient, createItemInline, openItemDetailByTitle } = require('./helpers');

// Vecteurs d'attaque pour la XSS stockée dans une description.
// Chacun marque un side-effect distinct sur window pour qu'on puisse vérifier
// individuellement qu'aucun n'a été déclenché. On garde un fragment <b>visible</b>
// devant chaque payload pour que la regex de descriptionToHtml matche le chemin
// "HTML autorisé" (sinon elle tomberait sur la branche escapeHtml qui est déjà sûre).
const XSS_PAYLOADS = [
  { name: 'img-onerror',  payload: '<b>visible</b><img src=x onerror="window.__xss_img=1">' },
  { name: 'script-tag',   payload: '<b>visible</b><script>window.__xss_script=1</script>' },
  { name: 'a-javascript', payload: '<b>visible</b><a href="javascript:window.__xss_a=1">click</a>' },
  { name: 'svg-onload',   payload: '<b>visible</b><svg onload="window.__xss_svg=1"></svg>' },
  { name: 'iframe-srcdoc',payload: '<b>visible</b><iframe srcdoc="<script>parent.__xss_iframe=1</script>"></iframe>' },
];

test.describe('Sécurité — XSS dans les descriptions', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
  });

  test('descriptionToHtml neutralise tous les vecteurs XSS au rendu (import/Gist hostile)', async ({ page }) => {
    await createClient(page, { name: 'SecTest', key: 'SEC' });
    await createItemInline(page, { title: 'Item piégé' });

    // Simule le scénario d'attaque réel : un import JSON ou un pull Gist initial
    // écrit dans state.clients une description contenant des payloads XSS, sans
    // passer par le sanitizeHtml du save. Le rendu via descriptionToHtml doit
    // tenir le choc.
    // On bypasse le debounce de saveState() (50ms) en écrivant directement via
    // dbSet pour que le reload qui suit relise bien la description piégée.
    const combined = XSS_PAYLOADS.map(p => p.payload).join('');
    await page.evaluate(async (desc) => {
      state.clients[0].items[0].description = desc;
      await dbSet(STORAGE_KEY, {
        clients: state.clients,
        activeClientId: state.activeClientId,
        lastSavedAt: Date.now()
      });
    }, combined);

    // Reload pour repartir du chemin "lecture depuis IndexedDB → render", qui est
    // exactement ce qui se passe après un import suivi d'un refresh.
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.locator('#syncIndicator').waitFor({ state: 'visible' });
    await page.waitForTimeout(150);

    // Ouvre l'item — c'est ici que descriptionToHtml() alimente innerHTML de #ed_desc.
    await openItemDetailByTitle(page, 'Item piégé');
    await page.waitForTimeout(100); // laisse le rendu finir

    // 1) Aucun side-effect JavaScript n'a été déclenché par les payloads.
    //    Si descriptionToHtml retournait `desc` brut, au moins __xss_img et
    //    __xss_svg seraient à 1 ici (déclenchés au moment du innerHTML).
    const sideEffects = await page.evaluate(() => ({
      img:    window.__xss_img    ?? null,
      script: window.__xss_script ?? null,
      a:      window.__xss_a      ?? null,
      svg:    window.__xss_svg    ?? null,
      iframe: window.__xss_iframe ?? null,
    }));
    expect(sideEffects).toEqual({ img: null, script: null, a: null, svg: null, iframe: null });

    // 2) Le contenu sain (les <b>visible</b>) est préservé — sanitizeHtml ne doit
    //    pas overstrip le texte légitime qui entoure les payloads.
    const edDesc = page.locator('#ed_desc');
    await expect(edDesc).toContainText('visible');

    // 3) Le DOM rendu ne contient aucun tag dangereux et aucun attribut suspect.
    //    sanitizeHtml ne garde que RICH_ALLOWED_TAGS (b, strong, i, em, u, ul, ol,
    //    li, p, br, div, span) et strippe TOUS les attributs.
    const danger = await edDesc.evaluate((root) => {
      const FORBIDDEN_TAGS = ['IMG', 'SCRIPT', 'SVG', 'IFRAME', 'A', 'OBJECT', 'EMBED', 'STYLE', 'LINK'];
      const offenders = [];
      root.querySelectorAll('*').forEach(node => {
        if (FORBIDDEN_TAGS.includes(node.tagName)) {
          offenders.push({ kind: 'tag', tag: node.tagName });
        }
        for (const attr of node.attributes) {
          if (/^on/i.test(attr.name)) {
            offenders.push({ kind: 'event-handler', tag: node.tagName, attr: attr.name });
          }
          if (/javascript:/i.test(attr.value)) {
            offenders.push({ kind: 'js-url', tag: node.tagName, attr: attr.name });
          }
        }
      });
      return offenders;
    });
    expect(danger).toEqual([]);
  });

  test('le formatage riche autorisé (gras, italique, listes) survit à la sanitation', async ({ page }) => {
    // Non-régression : le fix ne doit pas amputer les descriptions légitimes que
    // l'utilisateur édite tous les jours via la barre de mise en forme.
    await createClient(page, { name: 'SecTest2', key: 'SC2' });
    await createItemInline(page, { title: 'Description riche' });

    await page.evaluate(async () => {
      state.clients[0].items[0].description =
        '<b>gras</b> <i>italique</i> <u>souligné</u>' +
        '<ul><li>un</li><li>deux</li></ul>' +
        '<ol><li>premier</li></ol>' +
        '<div>bloc</div><span>inline</span>';
      await dbSet(STORAGE_KEY, {
        clients: state.clients,
        activeClientId: state.activeClientId,
        lastSavedAt: Date.now()
      });
    });

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.locator('#syncIndicator').waitFor({ state: 'visible' });
    await page.waitForTimeout(150);

    await openItemDetailByTitle(page, 'Description riche');

    const edDesc = page.locator('#ed_desc');
    await expect(edDesc.locator('b').first()).toHaveText('gras');
    await expect(edDesc.locator('i').first()).toHaveText('italique');
    await expect(edDesc.locator('u').first()).toHaveText('souligné');
    await expect(edDesc.locator('ul li')).toHaveCount(2);
    await expect(edDesc.locator('ol li')).toHaveCount(1);
    await expect(edDesc.locator('div').first()).toContainText('bloc');
    await expect(edDesc.locator('span').first()).toContainText('inline');
  });
});

// === Validation des données externes (import JSON / pull Gist) =================
//
// Ces tests visent la classe d'attaque "JSON hostile" : un attaquant qui
// convaincrait l'utilisateur d'importer un JSON ou de connecter un Gist piégé.
// La défense est normalizeImportedState() qui reconstruit des objets propres
// à partir d'un schéma strict, refusant les ids non-alphanumériques et
// retombant sur des défauts sûrs pour les énums/cosmétiques. Si un payload
// XSS arrive jusqu'au render(), c'est que le validator a un trou.

test.describe('Sécurité — validation des données importées', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
  });

  test('payloads XSS injectés dans id/color/type/status/priority sont neutralisés', async ({ page }) => {
    // Injecte un JSON hostile via normalizeImportedState (le même code path que
    // triggerImport et fetchGist), assigne le résultat à state, render() et
    // simule des clics sur tout ce qui est rendu. Aucun handler XSS ne doit
    // déclencher de side-effect sur window.
    const result = await page.evaluate(() => {
      const hostile = {
        clients: [
          // (a) id non-alphanumérique → le client doit être rejeté entièrement
          { id: "evil'); window.__pwn_id=1; ('", name: 'A vorer', key: 'EVL', counter: 0, items: [], sprints: [], epics: [] },
          // (b) id valide, mais champs cosmétiques piégés sur l'epic et l'item
          {
            id: 'good-client',
            name: 'Légitime',
            key: 'OK1',
            counter: 1,
            color: 'red" onclick="window.__pwn_clientcolor=1" data-x="',
            sprints: [
              { id: 'sprint-x', name: 'Sprint hostile', startDate: null, endDate: null, active: true }
            ],
            epics: [
              { id: 'epic-x', name: 'Epic hostile', color: 'red" onclick="window.__pwn_epiccolor=1" data-x="' }
            ],
            items: [
              {
                id: 'item-x',
                num: 1,
                title: 'Item piégé',
                type: 'task" onclick="window.__pwn_type=1" data-x="',
                priority: '1" onclick="window.__pwn_prio=1" data-x="',
                status: 'todo" onclick="window.__pwn_status=1" data-x="',
                estimate: 'oops; window.__pwn_est=1; ',
                sprintId: 'sprint-x',
                epicId: 'epic-x',
                createdAt: Date.now()
              }
            ]
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
        clientsCount: state.clients.length,
        clientIds: state.clients.map(c => c.id),
        clientColors: state.clients.map(c => c.color ?? null),
        firstClientItemTypes: state.clients[0]?.items.map(i => i.type) ?? [],
        firstClientItemPriorities: state.clients[0]?.items.map(i => i.priority) ?? [],
        firstClientItemStatuses: state.clients[0]?.items.map(i => i.status) ?? [],
        firstEpicColors: state.clients[0]?.epics.map(e => e.color) ?? [],
      };
    });

    // 1) Le client à id non-conforme a été rejeté ; seul le client légitime survit.
    expect(result.clientsCount).toBe(1);
    expect(result.clientIds).toEqual(['good-client']);

    // 2) Tous les champs cosmétiques piégés ont été ramenés à des valeurs sûres :
    //    color → strippée (champ optionnel) ou défaut de l'epic ; type → 'task' ;
    //    priority → 2 ; status → 'todo' ; estimate → 0.
    expect(result.clientColors).toEqual([null]);                  // color invalide → strippée
    expect(result.firstClientItemTypes).toEqual(['task']);
    expect(result.firstClientItemPriorities).toEqual([2]);
    expect(result.firstClientItemStatuses).toEqual(['todo']);
    expect(result.firstEpicColors).toEqual(['#0052cc']);          // défaut

    // 3) Vérification structurelle du DOM rendu : par construction, comme tous
    //    les ids/colors/types ont été ramenés à des valeurs sûres par le
    //    normalizer, les attributs interpolés (onclick="...('${id}')",
    //    style="background:${color}", class="type-${type}") ne peuvent plus
    //    contenir de payload. On vérifie qu'AUCUN onclick ne porte la signature
    //    d'attaque __pwn_, et qu'aucun style/class n'a "fui" hors de ses
    //    guillemets en injectant un onclick.
    const rendered = await page.evaluate(() => {
      const offenders = [];
      document.querySelectorAll('[onclick]').forEach(el => {
        if (/__pwn_/.test(el.getAttribute('onclick'))) {
          offenders.push({ kind: 'onclick-injected', html: el.outerHTML.substring(0, 200) });
        }
      });
      document.querySelectorAll('[style]').forEach(el => {
        const s = el.getAttribute('style');
        if (/__pwn_|onclick/i.test(s)) {
          offenders.push({ kind: 'style-leak', html: el.outerHTML.substring(0, 200) });
        }
      });
      document.querySelectorAll('[class]').forEach(el => {
        const c = el.getAttribute('class');
        if (/__pwn_|onclick=/i.test(c)) {
          offenders.push({ kind: 'class-leak', html: el.outerHTML.substring(0, 200) });
        }
      });
      return offenders;
    });
    expect(rendered).toEqual([]);

    // 4) Aucun side-effect ne doit avoir été déclenché pendant le render.
    //    (Si un payload survivait dans un attribut onload-like, il aurait pu
    //    s'exécuter au render — ce check le détecterait.)
    const sideEffects = await page.evaluate(() => ({
      id:          window.__pwn_id          ?? null,
      clientcolor: window.__pwn_clientcolor ?? null,
      epiccolor:   window.__pwn_epiccolor   ?? null,
      type:        window.__pwn_type        ?? null,
      prio:        window.__pwn_prio        ?? null,
      status:      window.__pwn_status      ?? null,
      est:         window.__pwn_est         ?? null,
    }));
    expect(sideEffects).toEqual({
      id: null, clientcolor: null, epiccolor: null,
      type: null, prio: null, status: null, est: null,
    });
  });

  test('neutralise les tentatives de pollution de prototype (__proto__, constructor)', async ({ page }) => {
    // Un JSON hostile peut contenir des clés "__proto__" / "constructor" dont la
    // copie naïve via Object.assign / spread polluerait Object.prototype et
    // affecterait *tous* les objets de la page. normalizeImportedState lit
    // explicitement ses champs whitelistés sans jamais itérer les clés du raw.
    const polluted = await page.evaluate(() => {
      const text = JSON.stringify({
        __proto__: { polluted: 'yes-root' },
        clients: [
          {
            id: 'good',
            name: 'OK',
            key: 'OK1',
            counter: 0,
            __proto__: { polluted: 'yes-client' },
            items: [
              {
                id: 'i1',
                num: 1,
                title: 'T',
                type: 'task',
                priority: 2,
                status: 'todo',
                createdAt: Date.now(),
                constructor: { prototype: { hijacked: 1 } }
              }
            ],
            sprints: [],
            epics: []
          }
        ],
        activeClientId: 'good',
        lastSavedAt: Date.now()
      });
      const raw = JSON.parse(text);
      const normalized = normalizeImportedState(raw);
      state.clients = normalized.clients;
      state.activeClientId = normalized.activeClientId;
      render();
      return {
        objectPolluted: ({}).polluted ?? null,
        objectHijacked: ({}).hijacked ?? null,
        clientsCount: state.clients.length,
      };
    });

    expect(polluted.objectPolluted).toBe(null);
    expect(polluted.objectHijacked).toBe(null);
    expect(polluted.clientsCount).toBe(1);   // le client légitime passe quand même
  });

  test('préserve les données valides et applique les défauts sains aux champs absents', async ({ page }) => {
    // Non-régression du normalizer : un export normal doit ressortir identique
    // côté champs métier. Les champs absents repartent sur des défauts (status
    // = 'todo', type = 'task', priority = 2, color epic = #0052cc).
    const result = await page.evaluate(() => {
      const valid = {
        clients: [{
          id: 'c1', name: 'Acme', key: 'ACM', counter: 2,
          sprints: [{ id: 's1', name: 'S1', startDate: '2026-04-01', endDate: '2026-04-15', active: true }],
          epics: [{ id: 'e1', name: 'E1', color: '#36b37e' }],
          items: [
            { id: 'i1', num: 1, title: 'Story livrée', type: 'story', priority: 1, status: 'done', estimate: 1.5, sprintId: 's1', epicId: 'e1', createdAt: 1000, completedAt: 2000 },
            // Champs minimum : doit ressortir avec les défauts
            { id: 'i2', num: 2, title: 'Minimal' }
          ]
        }],
        activeClientId: 'c1',
        lastSavedAt: 1234567890
      };
      const n = normalizeImportedState(valid);
      return {
        clientId: n.clients[0].id,
        clientName: n.clients[0].name,
        clientKey: n.clients[0].key,
        sprint: n.clients[0].sprints[0],
        epic: n.clients[0].epics[0],
        item1: n.clients[0].items[0],
        item2: n.clients[0].items[1],
        lastSavedAt: n.lastSavedAt,
      };
    });

    expect(result.clientId).toBe('c1');
    expect(result.clientName).toBe('Acme');
    expect(result.clientKey).toBe('ACM');
    expect(result.sprint).toMatchObject({ id: 's1', name: 'S1', active: true });
    expect(result.epic).toEqual({ id: 'e1', name: 'E1', color: '#36b37e' });
    expect(result.item1).toMatchObject({
      id: 'i1', num: 1, title: 'Story livrée',
      type: 'story', priority: 1, status: 'done', estimate: 1.5,
      sprintId: 's1', epicId: 'e1', createdAt: 1000, completedAt: 2000,
    });
    expect(result.item2).toMatchObject({
      id: 'i2', num: 2, title: 'Minimal',
      type: 'task', priority: 2, status: 'todo', estimate: 0,
      sprintId: null, epicId: null, dueDate: null, description: '',
    });
    expect(result.lastSavedAt).toBe(1234567890);
  });

  test('rejette le fichier si la racine est invalide', async ({ page }) => {
    const cases = await page.evaluate(() => ({
      nullValue:        normalizeImportedState(null),
      stringValue:      normalizeImportedState('not an object'),
      arrayRoot:        normalizeImportedState([{ id: 'c1', name: 'x' }]),
      noClientsArray:   normalizeImportedState({ activeClientId: 'c1' }),
      clientsNotArray:  normalizeImportedState({ clients: 'oups' }),
    }));
    expect(cases.nullValue).toBeNull();
    expect(cases.stringValue).toBeNull();
    expect(cases.arrayRoot).toBeNull();
    expect(cases.noClientsArray).toBeNull();
    expect(cases.clientsNotArray).toBeNull();
  });

  test('données empoisonnées préexistantes en IndexedDB sont neutralisées au boot', async ({ page }) => {
    // Scénario réaliste : un import malveillant a été persisté avant qu'on ajoute
    // la validation, OU quelqu'un a manipulé IndexedDB via DevTools, OU une XSS
    // résiduelle a écrit des payloads. À chaque boot, loadState() doit donc
    // re-normaliser ce qu'il sort de IndexedDB, pas le faire confiance.
    await page.evaluate(async () => {
      await dbSet(STORAGE_KEY, {
        clients: [
          // Client avec id non-alphanumérique → doit être rejeté entièrement
          { id: "x'); window.__pwn_load=1; ('", name: 'Pwn', key: 'PWN', counter: 0, items: [], sprints: [], epics: [] },
          // Client valide, mais epic.color piégé
          {
            id: 'good',
            name: 'OK',
            key: 'OK1',
            counter: 0,
            epics: [{ id: 'e1', name: 'E', color: 'red" onclick="window.__pwn_loadcolor=1" data-x="' }],
            items: [],
            sprints: []
          }
        ],
        activeClientId: 'good',
        lastSavedAt: Date.now(),
        // Champ étranger : avant le fix, le `state = { ...state, ...data }` le
        // copiait dans state. Avec la nouvelle reconstruction explicite, ce
        // champ doit disparaître.
        evilField: 'should-not-leak-into-state'
      });
    });

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.locator('#syncIndicator').waitFor({ state: 'visible' });
    await page.waitForTimeout(150);

    const result = await page.evaluate(async () => {
      // Re-lit IndexedDB pour confirmer que loadState a aussi RÉÉCRIT la
      // version nettoyée — sinon les payloads reviendraient au prochain boot.
      const persisted = await dbGet(STORAGE_KEY);
      return {
        clientsCount: state.clients.length,
        clientIds: state.clients.map(c => c.id),
        epicColors: state.clients[0]?.epics.map(e => e.color) ?? [],
        hasEvilField: 'evilField' in state,
        pwnLoad: window.__pwn_load ?? null,
        pwnLoadColor: window.__pwn_loadcolor ?? null,
        persistedClientIds: persisted.clients.map(c => c.id),
        persistedEpicColors: persisted.clients[0]?.epics.map(e => e.color) ?? [],
        persistedHasEvilField: 'evilField' in persisted,
      };
    });

    // 1) Le client à id non-conforme a été rejeté ; seul 'good' survit.
    expect(result.clientsCount).toBe(1);
    expect(result.clientIds).toEqual(['good']);
    // 2) L'epic.color malveillant a été ramené au défaut.
    expect(result.epicColors).toEqual(['#0052cc']);
    // 3) Le champ étranger n'a pas été copié dans state (plus de spread aveugle).
    expect(result.hasEvilField).toBe(false);
    // 4) Aucun side-effect n'a été déclenché pendant le render.
    expect(result.pwnLoad).toBeNull();
    expect(result.pwnLoadColor).toBeNull();
    // 5) **IndexedDB lui-même a été purgé** — les payloads ne reviendront plus
    //    au prochain boot, et un `evilField` étranger n'est plus persisté.
    expect(result.persistedClientIds).toEqual(['good']);
    expect(result.persistedEpicColors).toEqual(['#0052cc']);
    expect(result.persistedHasEvilField).toBe(false);
  });

  test('IndexedDB locale totalement cassée → reset propre + warn console', async ({ page }) => {
    // Si la donnée locale est si abîmée que normalizeImportedState retourne null
    // (ex: une XSS résiduelle a réécrit data.clients en string), on ne rend pas
    // l'app avec des champs corrompus : on repart d'un état vide propre, et on
    // réécrit le stockage pour ne pas re-déclencher l'erreur au boot suivant.
    const warnings = [];
    page.on('console', msg => { if (msg.type() === 'warning') warnings.push(msg.text()); });

    await page.evaluate(async () => {
      // Le check "if (data && data.clients)" en amont accepte d'entrer dans le
      // bloc, et c'est normalizeImportedState qui retourne null car clients
      // n'est pas un array.
      await dbSet(STORAGE_KEY, {
        clients: 'pas un array — donnée corrompue',
        activeClientId: 'whatever',
        lastSavedAt: Date.now()
      });
    });

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.locator('#syncIndicator').waitFor({ state: 'visible' });
    await page.waitForTimeout(200);

    const result = await page.evaluate(async () => {
      const persisted = await dbGet(STORAGE_KEY);
      return {
        stateClients: state.clients,
        stateActiveClientId: state.activeClientId,
        persistedClients: persisted.clients,
        persistedActiveClientId: persisted.activeClientId,
      };
    });

    // App rendue dans un état vide cohérent (pas de crash).
    expect(result.stateClients).toEqual([]);
    expect(result.stateActiveClientId).toBeNull();
    // IndexedDB a été réécrite avec un état vide propre.
    expect(result.persistedClients).toEqual([]);
    expect(result.persistedActiveClientId).toBeNull();
    // Et un warning a bien été loggé pour signaler le rejet.
    expect(warnings.some(w => /rejected by schema validation/i.test(w))).toBe(true);
  });

  test('borne lastSavedAt — un timestamp astronomique ne peut pas forcer un overwrite', async ({ page }) => {
    // Sinon un Gist hostile pourrait poser lastSavedAt = Number.MAX_SAFE_INTEGER
    // pour gagner systématiquement le last-write-wins et écraser le local.
    const bornes = await page.evaluate(() => {
      const now = Date.now();
      return {
        future:   normalizeImportedState({ clients: [], lastSavedAt: now + 365 * 86400000 }).lastSavedAt,
        negative: normalizeImportedState({ clients: [], lastSavedAt: -1 }).lastSavedAt,
        string:   normalizeImportedState({ clients: [], lastSavedAt: 'oups' }).lastSavedAt,
        valid:    normalizeImportedState({ clients: [], lastSavedAt: 1000 }).lastSavedAt,
      };
    });
    expect(bornes.future).toBe(0);   // hors borne haute → rejeté
    expect(bornes.negative).toBe(0);
    expect(bornes.string).toBe(0);
    expect(bornes.valid).toBe(1000);
  });
});
