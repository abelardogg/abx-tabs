/**
 * Utilidades compartidas por los scripts de prueba E2E.
 *
 * Playwright NO es dependencia del proyecto: se instala aparte (por ejemplo en
 * un scratchpad) y se le indica dónde está con PW_ROOT.
 *
 *   cd <scratchpad> && npm i playwright && npx playwright install chromium
 *   PW_ROOT=<scratchpad> node tests/e2e/01-load.mjs
 */
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const PW_ROOT = process.env.PW_ROOT ?? process.cwd();
const require = createRequire(path.join(PW_ROOT, 'package.json'));
export const { chromium } = require('playwright');

export const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5173';
export const REPO = process.env.REPO ?? path.resolve(import.meta.dirname, '..', '..');
export const TAB_FILE = path.join(REPO, 'TABS', 'In Flames - Vanishing Light.gp5');
export const SHOTS = process.env.SHOTS ?? path.join(PW_ROOT, 'shots');

fs.mkdirSync(SHOTS, { recursive: true });

/** Lanza el navegador y engancha la captura de consola, pageerror y red. */
export async function openApp({ width = 1800, height = 1000 } = {}) {
  const browser = await chromium.launch({
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--mute-audio',
      '--disable-features=AudioServiceOutOfProcess',
    ],
  });
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();

  const consoleLogs = [];
  const pageErrors = [];
  const requests = [];
  const failedRequests = [];

  page.on('console', msg => {
    consoleLogs.push({ type: msg.type(), text: msg.text() });
  });
  page.on('pageerror', err => {
    pageErrors.push(err.stack ?? String(err));
  });
  page.on('response', res => {
    requests.push({ url: res.url(), status: res.status() });
  });
  page.on('requestfailed', req => {
    failedRequests.push({ url: req.url(), error: req.failure()?.errorText });
  });

  await page.goto(BASE_URL, { waitUntil: 'load' });

  return {
    browser,
    context,
    page,
    logs: { consoleLogs, pageErrors, requests, failedRequests },
  };
}

/** Carga el .gp5 por el input oculto y espera a que el panel maestro renderice. */
export async function loadTabFile(page, { timeout = 60000 } = {}) {
  await page.locator('input[type=file]').setInputFiles(TAB_FILE);
  await page
    .locator('.pane__viewport[data-pane="0"] svg, .pane__viewport[data-pane="0"] canvas')
    .first()
    .waitFor({ state: 'attached', timeout });
}

/** Espera a que el botón de play se habilite (depende de `playerReady`). */
export async function waitPlayerReady(page, timeout = 90000) {
  try {
    await page.waitForFunction(
      () => {
        const btn = document.querySelector('.transport__play');
        return !!btn && !btn.disabled;
      },
      undefined,
      { timeout, polling: 250 },
    );
    return true;
  } catch {
    return false;
  }
}

/** Mide el contenido renderizado dentro de un panel. */
export async function paneRenderStats(page, pane) {
  return page.evaluate(p => {
    const vp = document.querySelector(`.pane__viewport[data-pane="${p}"]`);
    if (!vp) return null;
    const svgs = [...vp.querySelectorAll('svg')];
    const canvases = [...vp.querySelectorAll('canvas')];
    const texts = [...vp.querySelectorAll('svg text')].map(t => t.textContent ?? '');
    return {
      svgCount: svgs.length,
      canvasCount: canvases.length,
      svgChildNodes: svgs.reduce((n, s) => n + s.childElementCount, 0),
      pathCount: vp.querySelectorAll('svg path').length,
      textCount: texts.length,
      // Las primeras etiquetas sirven para distinguir render de pistas distintas.
      sampleTexts: texts.slice(0, 40),
      scrollHeight: vp.scrollHeight,
      clientHeight: vp.clientHeight,
      hint: vp.querySelector('.pane__hint')?.textContent ?? null,
      fontFamilies: [...new Set([...vp.querySelectorAll('svg text')].map(t => getComputedStyle(t).fontFamily))],
    };
  }, pane);
}

/** Números de traste visibles en la tablatura de un panel (texto numérico del SVG). */
export async function paneFrets(page, pane, limit = 60) {
  return page.evaluate(
    ({ p, limit }) => {
      const vp = document.querySelector(`.pane__viewport[data-pane="${p}"]`);
      if (!vp) return [];
      return [...vp.querySelectorAll('svg text')]
        .map(t => (t.textContent ?? '').trim())
        .filter(t => /^\d{1,2}$/.test(t))
        .slice(0, limit);
    },
    { p: pane, limit },
  );
}

export async function transportSnapshot(page) {
  return page.evaluate(() => {
    const play = document.querySelector('.transport__play');
    const scrub = document.querySelector('.transport__scrub input[type=range]');
    return {
      playLabel: play?.textContent?.trim() ?? null,
      playDisabled: play?.disabled ?? null,
      scrubValue: scrub ? Number(scrub.value) : null,
      scrubMax: scrub ? Number(scrub.max) : null,
      time: document.querySelector('.transport__time')?.textContent ?? null,
      bar: document.querySelector('.transport__bar')?.textContent ?? null,
      speed: document.querySelector('.transport__speed output')?.textContent ?? null,
      loadingAudio: !!document.querySelector('.transport__loading'),
    };
  });
}

/** Cursor de alphaTab (barra + beat) dentro de un panel, en px. */
export async function cursorPos(page, pane) {
  return page.evaluate(p => {
    const vp = document.querySelector(`.pane__viewport[data-pane="${p}"]`);
    if (!vp) return null;
    const bar = vp.querySelector('.at-cursor-bar');
    const beat = vp.querySelector('.at-cursor-beat');
    const num = el => {
      if (!el) return null;
      const s = getComputedStyle(el);
      return { left: s.left, top: s.top, width: s.width, transform: s.transform };
    };
    return { bar: num(bar), beat: num(beat), hasCursorWrapper: !!vp.querySelector('.at-cursors') };
  }, pane);
}

export function section(name) {
  console.log(`\n${'='.repeat(70)}\n${name}\n${'='.repeat(70)}`);
}

export function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` -- ${detail}` : ''}`);
  return ok;
}

export function dumpLogs(logs, { assetsOnly = false } = {}) {
  const interesting = logs.requests.filter(
    r => /\/font\/|\/soundfont\/|\.woff2|\.sf2/.test(r.url),
  );
  console.log('\n-- assets --');
  for (const r of interesting) console.log(`  ${r.status}  ${r.url}`);
  if (logs.failedRequests.length) {
    console.log('-- requests fallidas --');
    for (const r of logs.failedRequests) console.log(`  ${r.error}  ${r.url}`);
  }
  if (assetsOnly) return;
  const bad = logs.consoleLogs.filter(l => l.type === 'error' || l.type === 'warning');
  console.log(`\n-- consola: ${logs.consoleLogs.length} msgs, ${bad.length} error/warn --`);
  for (const l of bad) console.log(`  [${l.type}] ${l.text.slice(0, 500)}`);
  console.log(`-- pageerror: ${logs.pageErrors.length} --`);
  for (const e of logs.pageErrors) console.log(`  ${e.slice(0, 1200)}`);
}

export async function shot(page, name) {
  const file = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  [shot] ${file}`);
}
