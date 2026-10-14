import { chromium } from 'playwright';

const out = '/opt/cursor/artifacts';
const base = 'http://127.0.0.1:4173/';

async function shot(page, name) {
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('wrote', name);
}

const browser = await chromium.launch({ headless: true });

{
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  page.on('console', (m) => { if (m.type()==='error') console.log('CONSOLE', m.text()); });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await shot(page, 'desktop_base');

  await page.evaluate(() => {
    window.__pathwaysBus?.emit('update-win', 12500);
    window.__pathwaysBus?.emit('show-big-win', 12500);
  });
  await page.waitForTimeout(700);
  await shot(page, 'desktop_big_win');
  await page.evaluate(() => window.__pathwaysBus?.emit('hide-big-win'));

  await page.evaluate(() => window.__pathwaysBus?.emit('show-bonus-select'));
  await page.waitForTimeout(500);
  await shot(page, 'desktop_bonus_select');
  await page.evaluate(() => window.__pathwaysBus?.emit('hide-bonus-overlay'));
  await page.evaluate(() => window.__pathwaysBus?.emit('close-popups'));
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await shot(page, 'mobile_portrait_base');

  await page.evaluate(() => {
    window.__pathwaysBus?.emit('update-win', 8800);
    window.__pathwaysBus?.emit('show-big-win', 8800);
  });
  await page.waitForTimeout(700);
  await shot(page, 'mobile_portrait_big_win');
  await page.evaluate(() => window.__pathwaysBus?.emit('hide-big-win'));

  await page.evaluate(() => window.__pathwaysBus?.emit('show-bonus-select'));
  await page.waitForTimeout(500);
  await shot(page, 'mobile_portrait_bonus_select');
  await page.close();
}

await browser.close();
