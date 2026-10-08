const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const source = fs.readFileSync('userscripts/omni-website-shortcuts.user.js', 'utf8');
const start = source.indexOf('  let closePergolaPicker = null;');
const end = source.indexOf('  function ensureBar()', start);
const product = (id, title) => ({ id, title, handle: `blind-${id}`, options: [{ name: 'Size', position: 1 }, { name: 'Colour', position: 2 }], variants: [{ id: id * 10, sku: `BL-${id}`, option1: '4m', option2: 'Black' }] });
const products = [
  product(1, 'Motorised Blind For Tasman Wall Mounted Pergola'),
  product(2, 'Retractable Shade Manual Blind For Tasman Wall Mounted Pergola'),
  product(3, 'Motorised Blind For Tasman Freestanding Pergola'),
  product(4, 'Manual Blind For Pacific Motorised Freestanding Pergola'),
  product(5, 'Retractable Shade Blind For Baltic Free-standing Pergola'),
  product(6, 'Manual Blind For Pacific Wall-Mounted Pergola'),
];
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
    await page.setContent('<style>body{font:14px Arial;background:#eee;margin:24px}button{height:34px;width:100px}</style><button id="trigger">Blinds</button>');
    await page.addScriptTag({ content: `const clean=value=>String(value||'').trim();let blindCatalog=${JSON.stringify(products)};const loadPergolas=async family=>family==='Blinds'?blindCatalog:${JSON.stringify([product(7, 'Tasman Motorised Wall Mounted Louvre Roof Aluminium Pergola')])};let opened=[];let skus=[];const openShortcut=shortcut=>{opened.push(shortcut.url);return {};};window.addEventListener('lc:omni-add-sku',event=>skus.push(event.detail.sku));${source.slice(start, end)}` });
    const open = async () => page.evaluate(() => selectPergola({ label: 'Blinds' }, document.getElementById('trigger')));
    await open();
    const mount = page.getByLabel('Mounting', { exact: true });
    const operation = page.getByRole('combobox', { name: 'Operation', exact: true });
    const blind = page.getByLabel('Blind', { exact: true });
    assert(await mount.isEnabled());
    assert(await operation.isDisabled());
    assert(await blind.isDisabled());
    for (const [mounting, mode, ids] of [['wall', 'motorised', ['1']], ['wall', 'manual', ['2', '6']], ['free', 'motorised', ['3']], ['free', 'manual', ['4', '5']]]) {
      await mount.selectOption(mounting);
      assert.equal(await operation.inputValue(), '');
      assert(await blind.isDisabled(), 'Mount change resets blind selection');
      assert.equal(await page.getByLabel('Size', { exact: true }).count(), 0, 'Old variant controls are cleared');
      await operation.selectOption(mode);
      assert.deepEqual(await blind.locator('option').evaluateAll(options => options.map(option => option.value).filter(Boolean)), ids);
      if (ids.length === 1) assert.equal(await blind.inputValue(), ids[0], 'Single matching blind selects automatically');
      else await blind.selectOption(ids[0]);
      assert(await page.getByLabel('Size', { exact: true }).isEnabled());
      assert(await page.getByLabel('Colour', { exact: true }).isDisabled());
      await page.getByLabel('Size', { exact: true }).selectOption('4m');
      assert(await page.getByLabel('Colour', { exact: true }).isEnabled());
      assert.equal(await page.evaluate(() => skus.length), 0, 'No SKU inserted before all variant choices are made');
    }
    await page.screenshot({ path: '/tmp/lc-blind-picker-desktop.png' });
    await page.getByLabel('Colour', { exact: true }).selectOption('Black');
    assert.equal(await page.locator('#lc-omni-pergola-picker').count(), 0);
    assert.deepEqual(await page.evaluate(() => skus), ['BL-4']);
    assert((await page.evaluate(() => opened[0])).endsWith('/products/blind-4?variant=40'));
    await open();
    await mount.selectOption('wall');
    await operation.selectOption('motorised');
    await page.getByLabel('Size', { exact: true }).selectOption('4m');
    await operation.selectOption('manual');
    assert.equal(await blind.inputValue(), '', 'Operation change clears previous model');
    assert.equal(await page.getByLabel('Size', { exact: true }).count(), 0);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: '/tmp/lc-blind-picker-mobile.png' });
    const bounds = await page.getByRole('dialog').boundingBox();
    assert(bounds.x >= 0 && bounds.x + bounds.width <= 390);
    assert(bounds.y >= 0 && bounds.y + bounds.height <= 844);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#lc-omni-pergola-picker').count(), 0);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'trigger');
    assert.equal(await page.evaluate(() => blindMatches({ title: 'Outdoor Blind' }, 'free', 'manual')), false, 'Unclassified blinds are not assigned an invented mounting');
    const explicitWall = { ...product(8, 'Motorised Blind For Tasman Wall Mounted Pergola'),
      options: [{ name: 'Type', position: 1 }, { name: 'Size', position: 2 }, { name: 'Color', position: 3 }],
      variants: [
        { id: 81, sku: 'POST-4', option1: 'Post To Post', option2: '4m', option3: 'Black' },
        { id: 82, sku: 'POST-5', option1: 'Post To Post', option2: '5m', option3: 'Black' },
        { id: 83, sku: 'WALL-4', option1: 'Post To Wall', option2: '4m', option3: 'Black' },
      ] };
    await page.evaluate(catalog => { blindCatalog = catalog; }, [explicitWall]);
    await open(); await mount.selectOption('wall'); await operation.selectOption('motorised');
    const wallMounting = page.getByLabel('Wall Mounting', { exact: true });
    assert.deepEqual(await wallMounting.locator('option').evaluateAll(opts => opts.map(o => o.value).filter(Boolean)), ['Post To Post', 'Post To Wall']);
    assert(await page.getByLabel('Size', { exact: true }).isDisabled(), 'Select wall mounting before size');
    await wallMounting.selectOption('Post To Post');
    await page.getByLabel('Size', { exact: true }).selectOption('5m');
    await wallMounting.selectOption('Post To Wall');
    assert.equal(await page.getByLabel('Size', { exact: true }).inputValue(), '', 'Changing wall mounting resets size');
    assert(await page.getByLabel('Colour', { exact: true }).isDisabled());
    assert.deepEqual(await page.getByLabel('Size', { exact: true }).locator('option').evaluateAll(opts => opts.map(o => o.value).filter(Boolean)), ['4m'], 'Only website sizes available for Post to Wall remain');
    await page.getByLabel('Size', { exact: true }).selectOption('4m');
    await page.screenshot({ path: '/tmp/lc-blind-wall-mounting.png' });
    await page.getByLabel('Colour', { exact: true }).selectOption('Black');
    assert.equal((await page.evaluate(() => skus)).at(-1), 'WALL-4');
    await open(); await mount.selectOption('wall'); await operation.selectOption('motorised');
    await wallMounting.selectOption('Post To Post'); await page.getByLabel('Size', { exact: true }).selectOption('4m');
    await page.getByLabel('Colour', { exact: true }).selectOption('Black');
    assert.equal((await page.evaluate(() => skus)).at(-1), 'POST-4', 'Same width uses a different SKU for Post to Post');
    const combinedWall = { ...product(9, 'Manual Blind For Tasman Wall Mounted Pergola'), variants: [
      { id: 91, sku: 'MANUAL-POST', option1: 'Post To Post 3m', option2: 'Black' },
      { id: 92, sku: 'MANUAL-WALL', option1: 'Post To Wall 3m', option2: 'Black' },
    ] };
    await page.evaluate(catalog => { blindCatalog = catalog; }, [combinedWall]);
    await open(); await mount.selectOption('wall'); await operation.selectOption('manual');
    await wallMounting.selectOption('Post to Wall');
    await page.getByLabel('Size', { exact: true }).selectOption('3m');
    await page.getByLabel('Colour', { exact: true }).selectOption('Black');
    assert.equal((await page.evaluate(() => skus)).at(-1), 'MANUAL-WALL', 'Combined website size/type becomes separate fields without changing SKU');
    await page.evaluate(() => selectPergola({ label: 'Tasman' }, document.getElementById('trigger')));
    assert.equal(await operation.count(), 0, 'Pergola picker retains its existing layout');
    await mount.selectOption('wall');
    assert.equal(await page.getByRole('combobox', { name: 'Model', exact: true }).inputValue(), '7');
    await page.locator('#lc-omni-pergola-picker #size').selectOption('4m');
    await page.locator('#lc-omni-pergola-picker #colour').selectOption('Black');
    assert.equal((await page.evaluate(() => skus)).at(-1), 'BL-7', 'Pergola SKU insertion is unchanged');
    console.log('PASS: Mounting then operation filters, manual blinds for motorised pergolas, hyphenated names, dependent resets, variant SKU insertion, Escape and mobile framing. Catalogue/browser mocked.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
