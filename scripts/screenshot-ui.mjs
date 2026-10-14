import { chromium } from 'playwright';

const out = '/opt/cursor/artifacts';
const base = 'http://127.0.0.1:4173/';

async function shot(page, name) {
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('wrote', name);
}

async function waitReady(page) {
  await page.waitForFunction(
    () => window.externalUi && window.__pathwaysApp && document.querySelector('#game-ui-root'),
    null,
    { timeout: 20000 },
  );
  await page.waitForTimeout(1500);
}

const browser = await chromium.launch({ headless: true });

{
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 200));
  });
  await page.goto(base, { waitUntil: 'networkidle' });
  await waitReady(page);
  await shot(page, 'desktop_base');

  await page.evaluate(() => window.__pathwaysApp?.showBonusSelect?.());
  await shot(page, 'desktop_bonus_select');
  await page.evaluate(() => window.__pathwaysApp?.hideGameOverlays?.());

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('ui-popup-settings-btns', { detail: 'paytable' }));
  });
  await page.waitForTimeout(500);
  await shot(page, 'desktop_paytable');
  await page.close();
}

{
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await page.goto(base, { waitUntil: 'networkidle' });
  await waitReady(page);
  await shot(page, 'mobile_portrait_base');

  await page.evaluate(() => window.__pathwaysApp?.showBonusSelect?.());
  await shot(page, 'mobile_portrait_bonus_select');
  await page.close();
}

await browser.close();
