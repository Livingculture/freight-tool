const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const ts = require(path.resolve(__dirname, '../../workflow-speed-fix/node_modules/typescript'));
const source = fs.readFileSync('userscripts/omni-livingculture-workflow.user.js', 'utf8');
const ast = ts.createSourceFile('workflow.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const names = new Set(['clean', 'escapeHtml', 'chooseHubSpotLeadSource', 'closeHubSpotLeadSourceModal']);
const declarations = [];
function visit(node) {
  if (ts.isFunctionDeclaration(node) && names.has(node.name?.text)) declarations.push(node.getText(ast));
  ts.forEachChild(node, visit);
}
visit(ast);

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    async function open() {
      await page.goto('about:blank');
      await page.setContent('<main></main>');
      await page.addScriptTag({ content: `
        const ensureStyles = () => {};
        const cachedHubSpotLeadSourceOptions = () => ({label:'Lead Source',options:[{value:'store',label:'Showroom'},{value:'repeat',label:'Repeat customer'}]});
        const fetchHubSpotLeadSourceOptions = () => new Promise(resolve => {window.finishRefresh = resolve});
        ${declarations.join('\n')}
        window.selection = chooseHubSpotLeadSource();
        window.mutations = 0;
        new MutationObserver(() => window.mutations++).observe(document.querySelector('select'), {childList:true});
      ` });
    }
    for (const event of ['pointerdown', 'mousedown', 'keydown', 'change']) {
      await open();
      await page.locator('select').dispatchEvent(event);
      await page.evaluate(() => finishRefresh({label:'Fresh',options:[{value:'web',label:'Website'}]}));
      assert.equal(await page.evaluate(() => mutations), 0, `${event}: do not rebuild an active picker`);
      await page.selectOption('select', 'repeat');
      await page.getByRole('button', {name:'Continue',exact:true}).click();
      assert.equal((await page.evaluate(() => selection)).value, 'repeat', 'Selected value resolves against the displayed snapshot');
    }
    await open();
    await page.evaluate(() => finishRefresh({label:'Fresh',options:[{value:'web',label:'Website'}]}));
    assert.equal(await page.locator('option[value="web"]').count(), 1, 'Fresh options load before interaction');
    await page.selectOption('select', 'web');
    await page.getByRole('button', {name:'Continue',exact:true}).click();
    assert.equal((await page.evaluate(() => selection)).value, 'web');
    await open();
    await page.evaluate(() => finishRefresh(cachedHubSpotLeadSourceOptions()));
    assert.equal(await page.evaluate(() => mutations), 0, 'Identical refresh never rebuilds options');
    await page.getByRole('button', {name:'Cancel',exact:true}).click();
    assert.equal(await page.evaluate(() => selection), null);
    console.log('PASS: late refresh cannot replace options after pointer/keyboard interaction; fresh and unchanged lists, selection and cancel verified.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
