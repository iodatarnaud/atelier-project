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
