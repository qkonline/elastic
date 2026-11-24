// Whole days in a real browser, with the clock moved by hand: the journeys unit tests don't walk.
// Against a build without accounts: `npm run e2e` builds it, serves it, and runs this in Chrome
// (CHROME says where it is, when it isn't in the usual place).
import { existsSync } from 'node:fs';
import { preview } from 'vite';
import puppeteer from 'puppeteer-core';

const SHOTS = process.env.SHOTS;
const executablePath = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((p) => p && existsSync(p));
const server = await preview({ build: { outDir: 'dist-e2e' }, preview: { port: 4180, strictPort: true } });
const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
const failed = [];

/** A new person at their day, at this time of day, with a clock that can be moved on. */
async function day(hour, minute = 0) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  const at = new Date();
  at.setHours(hour, minute, 0, 0);
  await page.evaluateOnNewDocument((t) => {
    const Real = Date;
    window.off = Number(sessionStorage.getItem('off') ?? t - Real.now());
    globalThis.Date = class extends Real {
      constructor(...a) {
        if (a.length) super(...a);
        else super(Real.now() + window.off);
      }
      static now() {
        return Real.now() + window.off;
      }
    };
  }, at.getTime());
  await page.goto('http://localhost:4180/');
  const p = {
    page,
    /** Press a button (or tap a row), by its name. */
    async press(name) {
      const el = await page.waitForFunction(
        (n) => {
          const named = (e) => (e.getAttribute('aria-label') ?? e.textContent.replace(/\s+/g, ' ')).trim();
          return [...document.querySelectorAll('button, [role=radio]')]
            .filter((e) => e.offsetParent && !e.closest('[inert]'))
            .find((e) => named(e) === n || e.textContent.trim() === n);
        },
        { timeout: 4000 },
        name,
      );
      await el.evaluate((e) => e.click());
      await sleep(350);
    },
    /** Time goes by. */
    async later(minutes) {
      await page.evaluate((m) => {
        window.off += m * 60000;
        sessionStorage.setItem('off', String(window.off));
      }, minutes);
      await sleep(1600);
    },
    async add(title, length) {
      await p.press('Add task');
      await page.type('[aria-label="Task name"]', title);
      if (length) await p.press(length);
      await page.keyboard.press('Enter');
      await sleep(500);
    },
    async start() {
      await p.press('Start my day');
      await sleep(300);
      await page.keyboard.press('Escape');
      await sleep(700);
    },
    text: () => page.evaluate(() => document.querySelector('.page').innerText),
    row: (title) =>
      page.evaluate(
        (t) =>
          [...document.querySelectorAll('ol.timeline > li')]
            .filter((r) => r.querySelector('.title')?.textContent.trim() === t)
            .map((r) => r.innerText.replace(/\s+/g, ' ')),
        title,
      ),
    running: () => page.evaluate(() => document.querySelector('.row.active .title')?.textContent.trim() ?? null),
    nudge: () => page.evaluate(() => document.querySelector('.nudge')?.innerText ?? ''),
    async save() {
      await sleep(600);
    },
  };
  await p.press('Skip for now');
  return p;
}

async function journey(name, walk) {
  let p;
  const check = (what, ok, saw = '') => {
    if (ok) passed++;
    else {
      failed.push(`${name}: ${what}${saw ? ` (saw: ${saw})` : ''}`);
    }
    console.log(ok ? '  ok  ' : '  FAIL', what, ok ? '' : saw);
  };
  console.log(name);
  try {
    p = await walk(check);
  } catch (e) {
    check('ran to the end', false, String(e.message ?? e));
  }
  if (SHOTS && p) await p.page.screenshot({ path: `${SHOTS}/${name.replace(/\W+/g, '-')}.png` });
  await p?.page.browserContext().close();
}

await journey('A day that runs long', async (check) => {
  const p = await day(9);
  await p.add('Write', '45m');
  await p.add('Call', '30m');
  await p.start();
  check('the first task starts', (await p.running()) === 'Write');
  await p.later(80);
  await p.press('Done Write');
  check('Done stops the timer there and then', (await p.running()) === null);
  check('and asks when it was finished', /When did you finish Write\?/.test(await p.text()));
  await p.press('Start Call next').catch(() => p.press('Start Call'));
  check('the next one starts', (await p.running()) === 'Call');
  const write = await p.row('Write');
  check(
    'and the finished one stays finished, once',
    write.length === 1 && !/continued|set aside/.test(write[0]),
    write.join(' | '),
  );
  return p;
});

await journey('Past the wrap-up', async (check) => {
  const p = await day(15);
  for (const t of ['One', 'Two', 'Three']) await p.add(t, '1h');
  await p.add('Pay the rent', 'No time');
  await p.start();
  const likely = async () => /Likely done by\s+([\d:]+ [ap]m)/.exec(await p.text())?.[1];
  await p.press('Done One');
  await p.later(1);
  const was = await likely();
  await p.later(9 * 60);
  const missed = await p.page.$$eval('.flag', (f) => f.filter((x) => x.textContent === 'Missed').length);
  check('what the clock has passed is missed', missed >= 1, String(missed));
  check('it said when it would be done', !!was, was);
  await p.page.evaluate(() => [...document.querySelectorAll('button[aria-label^="Reschedule"]')][0].click());
  await sleep(300);
  await p.press('Someday');
  await p.press('Move to Someday');
  check('a missed task can go to Someday, and come back', /moved to Someday/.test(await p.nudge()), await p.nudge());
  await p.press('Undo');
  check('with Undo', !/Moved to Someday/.test(await p.text()));
  return p;
});

await journey('A late night', async (check) => {
  const p = await day(22);
  await p.add('Late work', '2h');
  await p.start();
  await p.later(150);
  check('past midnight it is still Today', /Today/.test(await p.page.$eval('h1', (h) => h.textContent)));
  check('with its timer', (await p.running()) === 'Late work');
  await p.press('End my day');
  check(
    'End my day asks when it was finished',
    /When time was up/.test(await p.page.$eval('[role=dialog]', (d) => d.innerText)),
  );
  await p.page.evaluate(() => document.querySelector('[role=dialog] .pri').click());
  await sleep(600);
  await p.page.keyboard.press('Escape');
  await sleep(700);
  check('and the new day begins', !(await p.running()));
  return p;
});

await journey('A forgotten timer', async (check) => {
  const p = await day(16);
  await p.add('Deep work', '1h');
  await p.add('Not reached', '30m');
  await p.start();
  await p.later(17 * 60);
  check('the morning opens on today', /Today/.test(await p.page.$eval('h1', (h) => h.textContent)));
  const card = await p.page.$eval('[aria-label="Yesterday wasn\'t ended"]', (e) => e.innerText).catch(() => '');
  check('and asks about yesterday', /Deep work was left running/.test(card) && /Not reached/.test(card), card);
  await p.press('Move it to today');
  check('what was left comes in', (await p.row('Not reached')).length === 1);
  check('and it is not asked again', !(await p.page.$('[aria-label="Yesterday wasn\'t ended"]')));
  await p.page.reload();
  await sleep(1200);
  check('after a reload either', !(await p.page.$('[aria-label="Yesterday wasn\'t ended"]')));
  return p;
});

await journey('A slip of the thumb', async (check) => {
  const p = await day(9);
  for (const t of ['One', 'Two', 'Three']) await p.add(t, '30m');
  await p.start();
  await p.later(10);
  await p.press('Start Three');
  check('the wrong task starts', (await p.running()) === 'Three');
  await p.press('Undo');
  check('Undo puts the right one back', (await p.running()) === 'One');
  const one = await p.row('One');
  check('as if nothing had happened', one.length === 1 && (await p.row('Three')).length === 1, one.join(' | '));
  await p.press('Done One');
  await p.press('Undo');
  check('a Done too', (await p.running()) === 'One');
  await p.save();
  await p.page.reload();
  await sleep(1200);
  check('and it is kept', (await p.running()) === 'One');
  return p;
});

await journey('Adding several', async (check) => {
  const p = await day(9);
  await p.press('Add task');
  await p.page.type('[aria-label="Task name"]', 'First');
  await p.press('30m');
  await p.press('Add another');
  check('New task stays for the next one', !!(await p.page.$('[role=dialog]')));
  await p.page.evaluate(() => {
    const data = new DataTransfer();
    data.setData('text/plain', '- Second\n- Third\n');
    document
      .querySelector('[aria-label="Task name"]')
      .dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await sleep(200);
  await p.press('Add 2 tasks');
  check(
    'pasted lines become tasks',
    (await p.row('First')).length === 1 && (await p.row('Second')).length === 1 && (await p.row('Third')).length === 1,
  );
  check(
    'with their times before the day starts',
    /\d/.test((await p.row('Second'))[0]) && /9:30/.test((await p.row('Second'))[0]),
    (await p.row('Second'))[0],
  );
  check('and what it starts with', /Starts with First/.test(await p.text()));
  return p;
});

await browser.close();
await server.close();
console.log(`${passed} passed, ${failed.length} failed`);
for (const f of failed) console.log('  ' + f);
process.exit(failed.length ? 1 : 0);
