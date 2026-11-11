// Records a short video of the dashboard fleet map (pt-MZ, 1920x1080) against a running dev server.
// Usage: npm start (in the app root), then `npm run record:map` here. See README.md.
import { chromium } from 'playwright';
import ffmpegPath from 'ffmpeg-static';
import { execFileSync } from 'node:child_process';
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hideCard, overlayInit, showCard } from './demo-kit.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4200';
const OUT = join(HERE, 'output');
const RAW = join(OUT, 'raw-map');
const SIZE = { width: 1920, height: 1080 };
// Same demo instant as the product video. The clock keeps running (install, not setFixedTime)
// because Leaflet's fly-to animations measure elapsed time with Date.now().
const DEMO_NOW = new Date('2026-10-24T11:40:00+02:00');

rmSync(RAW, { recursive: true, force: true });
mkdirSync(RAW, { recursive: true });

// ---------------------------------------------------------------------------------------------
// Interaction helpers. Every helper waits for its target and fails loudly.
// ---------------------------------------------------------------------------------------------
let page;
let cursor = { x: 960, y: 540 };
const marks = [];
let t0 = 0;
const now = () => (Date.now() - t0) / 1000;
const mark = (id, title) => {
  marks.push({ id, title, at: now() });
  console.log(`[${now().toFixed(1)}s] ${id} — ${title}`);
};
const hold = (ms) => page.waitForTimeout(ms);

async function moveTo(locator, { dx = 0.5, dy = 0.5 } = {}) {
  await locator.waitFor({ state: 'visible', timeout: 15000 });
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error(`No bounding box for ${locator}`);
  const target = { x: box.x + box.width * dx, y: box.y + box.height * dy };
  const distance = Math.hypot(target.x - cursor.x, target.y - cursor.y);
  await page.mouse.move(target.x, target.y, { steps: Math.max(12, Math.round(distance / 22)) });
  cursor = target;
}

async function click(locator, opts) {
  await moveTo(locator, opts);
  await hold(250);
  await page.mouse.down();
  await page.mouse.up();
}

async function scrollTo(locator, block = 'start') {
  await locator.waitFor({ state: 'attached', timeout: 15000 });
  await locator.evaluate((el, block) => el.scrollIntoView({ behavior: 'smooth', block }), block);
  await hold(1100);
}

const expectVisible = (locator, timeout = 10000) => locator.waitFor({ state: 'visible', timeout });

/** Puts the map card just below the sticky top bar. */
const scrollMapIntoView = () =>
  page.evaluate(() => {
    const card = document.querySelector('app-fleet-map');
    window.scrollTo({ top: window.scrollY + card.getBoundingClientRect().top - 80 });
  });

/** Scrolls the driver list (not the page) so the row is in the middle of the list. */
const scrollListTo = async (row) => {
  await row.evaluate((el) => {
    const list = el.closest('.fleet-map__list');
    const offset = el.getBoundingClientRect().top - list.getBoundingClientRect().top;
    list.scrollTo({ top: list.scrollTop + offset - list.clientHeight / 2, behavior: 'smooth' });
  });
  await hold(900);
};

// ---------------------------------------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------------------------------------
async function run() {
  const browser = await chromium.launch({ args: ['--lang=pt-PT'] });
  const context = await browser.newContext({
    viewport: SIZE,
    deviceScaleFactor: 1,
    locale: 'pt-MZ',
    timezoneId: 'Africa/Maputo',
    colorScheme: 'light',
    recordVideo: { dir: RAW, size: SIZE },
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE_URL });
  await context.addInitScript(overlayInit);
  t0 = Date.now();
  page = await context.newPage();
  await page.clock.install({ time: DEMO_NOW });
  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  const map = page.locator('app-fleet-map');
  const list = map.locator('.fleet-map__list');
  const dialog = page.locator('dialog[open]');
  const driverRow = (name) => list.locator('.fleet-map__unit').filter({ hasText: name });
  const speedButton = (label) => map.getByRole('button', { name: label, exact: true });
  const marker = (name) => page.locator(`.leaflet-marker-icon[title^="${name}"]`);

  // Load the dashboard behind the intro card, then scroll the map card into view.
  await page.goto(`${BASE_URL}/dashboard`);
  await showCard(page, {
    title: 'Localização da frota',
    lines: ['Onde está cada motorista, em tempo real', 'FleetOps MZ · Corredor da Beira'],
    fadeIn: false,
  });
  await page.waitForLoadState('networkidle');
  await expectVisible(map.locator('.fleet-pin').first(), 20000);
  // Pause the simulation until the presenter starts it on camera (behind the card, so no cursor).
  await map.getByRole('button', { name: 'Pausar simulação' }).dispatchEvent('click');
  await map.getByRole('button', { name: 'Voltar à hora actual' }).dispatchEvent('click');
  await scrollMapIntoView();
  await page.waitForLoadState('networkidle');
  await page.mouse.move(cursor.x, cursor.y);
  await hold(1500);

  // 0 — Intro
  mark('intro', 'Abertura — Localização da frota');
  await hold(4500);
  await hideCard(page);
  await hold(900);

  // 1 — Overview: region, drivers, legend
  mark('overview', 'Mapa do corredor da Beira e lista de motoristas');
  await moveTo(map.locator('.card__subtitle'));
  await hold(2500);
  await moveTo(map.locator('.fleet-map__canvas'), { dx: 0.35, dy: 0.3 });
  await hold(2000);
  await moveTo(map.locator('.fleet-map__legend'));
  await hold(3000);
  await moveTo(list, { dy: 0.2 });
  await hold(2500);
  await moveTo(map.locator('.fleet-map__outside'));
  await hold(3000);

  // 2 — Simulation clock
  mark('simulation', 'Relógio simulado, velocidade e reinício');
  await moveTo(map.locator('.fleet-map__clock'));
  await hold(1500);
  await click(map.getByRole('button', { name: 'Iniciar simulação' }));
  await hold(1500);
  await click(speedButton('3600×'));
  await moveTo(map.locator('.fleet-map__canvas'), { dx: 0.55, dy: 0.65 });
  await hold(6000);
  await click(map.getByRole('button', { name: 'Pausar simulação' }));
  await hold(1500);
  await click(map.getByRole('button', { name: 'Voltar à hora actual' }));
  await hold(1500);
  await click(speedButton('600×'));
  await click(map.getByRole('button', { name: 'Iniciar simulação' }));
  await hold(1500);

  // 3 — Zoom within the region
  mark('zoom', 'Zoom e limites da região');
  const zoomIn = map.locator('.leaflet-control-zoom-in');
  for (let i = 0; i < 2; i++) {
    await click(zoomIn);
    await hold(900);
  }
  await hold(1500);
  await click(map.getByRole('button', { name: 'Ver toda a frota' }));
  await hold(2500);

  // 4 — Driver popup: contact and quick messages
  mark('popup', 'Popup do motorista — contacto e mensagens rápidas');
  await click(driverRow('Celso Sitoe'));
  await expectVisible(dialog.getByRole('heading', { name: 'Celso Sitoe' }));
  await hold(2000);
  await moveTo(dialog.locator('.driver-popup__location'));
  await hold(2000);
  await moveTo(dialog.locator('.driver-popup__contact a').nth(0));
  await hold(1200);
  await moveTo(dialog.locator('.driver-popup__contact a').nth(1));
  await hold(1200);
  await moveTo(dialog.locator('.driver-popup__contact a').nth(2));
  await hold(1200);
  for (let i = 0; i < 3; i++) {
    await moveTo(dialog.locator('.driver-popup__message').nth(i), { dx: 0.3 });
    await hold(1500);
  }
  await scrollTo(dialog.locator('#driver-popup-trip'), 'start');
  await moveTo(dialog.locator('.driver-popup__facts'));
  await hold(3000);
  await scrollTo(dialog.locator('#driver-popup-actions'), 'start');
  await hold(1500);

  // 5 — Follow on map
  mark('follow', 'Seguir o motorista no mapa');
  await click(dialog.locator('.driver-popup__action', { hasText: 'Seguir no mapa' }));
  await dialog.waitFor({ state: 'hidden' });
  await expectVisible(map.locator('.fleet-map__follow'));
  await click(speedButton('3600×'));
  await moveTo(map.locator('.fleet-map__follow'));
  await hold(7000);
  await click(map.locator('.fleet-map__follow button'));
  await click(speedButton('600×'));
  await click(map.getByRole('button', { name: 'Voltar à hora actual' }));
  await click(map.getByRole('button', { name: 'Ver toda a frota' }));
  await hold(2000);

  // 6 — Delayed driver, opened from the map marker
  mark('delayed', 'Motorista parado — motivo do atraso e partilha da localização');
  await click(marker('Lourenço Cumbe'));
  await expectVisible(dialog.getByRole('heading', { name: 'Lourenço Cumbe' }));
  await hold(2000);
  await moveTo(dialog.locator('.driver-popup__messages'), { dx: 0.3 });
  await hold(3000);
  await scrollTo(dialog.locator('.driver-popup__alert'), 'center');
  await moveTo(dialog.locator('.driver-popup__alert'), { dx: 0.3 });
  await hold(3000);
  await scrollTo(dialog.locator('#driver-popup-actions'), 'start');
  await click(dialog.locator('.driver-popup__action', { hasText: 'Partilhar localização' }));
  await expectVisible(page.locator('.toast').filter({ hasText: 'Copiado' }));
  await hold(2000);
  await moveTo(dialog.locator('.driver-popup__action--danger'));
  await hold(2000);
  await click(dialog.getByRole('button', { name: 'Fechar' }).last());
  await dialog.waitFor({ state: 'hidden' });
  await hold(800);

  // 7 — Available driver: assign a new trip
  mark('idle', 'Motorista disponível — nova viagem');
  // The list re-sorts when a trip changes phase; pause so the row stays put while clicking.
  await click(map.getByRole('button', { name: 'Pausar simulação' }));
  await scrollListTo(driverRow('Jacinto Tivane'));
  await click(driverRow('Jacinto Tivane'));
  await expectVisible(dialog.getByRole('heading', { name: 'Jacinto Tivane' }));
  await hold(2000);
  await moveTo(dialog.locator('.driver-popup__messages'), { dx: 0.3 });
  await hold(2500);
  await scrollTo(dialog.locator('#driver-popup-actions'), 'start');
  await moveTo(dialog.locator('.driver-popup__action', { hasText: 'Nova viagem' }));
  await hold(2500);
  await click(dialog.getByRole('button', { name: 'Fechar' }).last());
  await dialog.waitFor({ state: 'hidden' });
  await hold(800);

  // 8 — Dark theme
  mark('dark', 'Tema escuro');
  await click(page.getByRole('button', { name: 'Mudar para tema escuro' }));
  await click(map.getByRole('button', { name: 'Iniciar simulação' }));
  await scrollMapIntoView();
  await hold(1200);
  await click(map.getByRole('button', { name: 'Ver toda a frota' }));
  await moveTo(map.locator('.fleet-map__canvas'), { dx: 0.5, dy: 0.5 });
  await hold(5000);

  // 9 — Close
  mark('closing', 'Encerramento');
  await page.mouse.move(1880, 1040, { steps: 20 });
  await hold(1500);
  await showCard(page, {
    title: 'FleetOps MZ',
    lines: ['Cada motorista no mapa, a um clique de distância.', 'Demonstração com dados e posições simulados'],
  });
  await hold(4500);
  mark('end', 'Fim');

  const video = page.video();
  await context.close();
  await browser.close();
  return { rawPath: await video.path(), consoleErrors };
}

const { rawPath, consoleErrors } = await run();

// Trim the blank first frames (before the intro card) and encode a standard H.264 MP4.
const start = Math.max(0, marks.find((m) => m.id === 'intro').at - 0.2);
const end = marks.find((m) => m.id === 'end').at;
const mp4 = join(OUT, 'fleetops-mz-mapa-1080p.mp4');
const webm = join(OUT, 'fleetops-mz-mapa-raw.webm');
renameSync(rawPath, webm);
execFileSync(
  ffmpegPath,
  ['-y', '-loglevel', 'error', '-ss', start.toFixed(2), '-i', webm, '-t', (end - start).toFixed(2), '-vf', 'fps=30', '-c:v', 'libx264',
    '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4],
  { stdio: 'inherit' },
);

const timeline = marks.map((m) => ({ ...m, at: Math.max(0, +(m.at - start).toFixed(1)) }));
writeFileSync(join(OUT, 'timeline-map.json'), JSON.stringify({ video: 'fleetops-mz-mapa-1080p.mp4', duration: +(end - start).toFixed(1), scenes: timeline, consoleErrors }, null, 2));
console.log(`\nVideo: ${mp4}\nDuration: ${(end - start).toFixed(1)} s`);
if (consoleErrors.length) console.warn('Console errors during recording:', consoleErrors);
