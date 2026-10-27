// Records the FleetOps MZ product demo (pt-MZ, 1920x1080) against a running dev server.
// Usage: npm start (in the app root), then `npm run record` here. See README.md.
import { chromium } from 'playwright';
import ffmpegPath from 'ffmpeg-static';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4200';
const OUT = join(HERE, 'output');
const RAW = join(OUT, 'raw');
const SIZE = { width: 1920, height: 1080 };
// The app pins "today" to 24 Oct 2026; pinning the wall clock too keeps times and relative labels stable.
const DEMO_NOW = new Date('2026-10-24T11:40:00+02:00');
const LOGO_SVG = readFileSync(join(HERE, '../../public/favicon.svg'), 'utf8');

rmSync(RAW, { recursive: true, force: true });
mkdirSync(RAW, { recursive: true });

// ---------------------------------------------------------------------------------------------
// Recording-only overlays: a visible cursor with click ripple, and the brand title cards.
// They are injected into the page for the video; the application code is not modified.
// ---------------------------------------------------------------------------------------------
const overlayInit = () => {
  // The mock repositories wait MOCK_LATENCY_MS (180 ms) to imitate a network; skip that artificial
  // wait so page changes don't flash loading skeletons. No other app timer uses 180 ms.
  const nativeSetTimeout = window.setTimeout;
  window.setTimeout = (fn, ms, ...args) => nativeSetTimeout(fn, ms === 180 ? 0 : ms, ...args);
  const install = () => {
    if (document.getElementById('demo-cursor')) return;
    const style = document.createElement('style');
    style.textContent = `
      #demo-cursor { position: fixed; left: 0; top: 0; width: 26px; height: 26px; z-index: 2147483600;
        pointer-events: none; transform: translate(-100px, -100px); transition: transform 16ms linear; }
      #demo-cursor svg { filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)); }
      .demo-ripple { position: fixed; z-index: 2147483599; pointer-events: none; width: 44px; height: 44px;
        margin: -22px 0 0 -22px; border-radius: 50%; background: rgba(23,107,101,.28); border: 2px solid rgba(23,107,101,.55);
        animation: demo-ripple 520ms ease-out forwards; }
      @keyframes demo-ripple { from { transform: scale(.3); opacity: 1 } to { transform: scale(1.4); opacity: 0 } }
      html { scrollbar-width: none; } ::-webkit-scrollbar { display: none; }`;
    document.head.appendChild(style);
    const cursor = document.createElement('div');
    cursor.id = 'demo-cursor';
    cursor.innerHTML =
      '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2.5l15.5 9.2-6.8 1.4-3.4 6.4z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    document.body.appendChild(cursor);
    document.addEventListener('mousemove', (e) => (cursor.style.transform = `translate(${e.clientX - 4}px, ${e.clientY - 2}px)`), true);
    document.addEventListener(
      'mousedown',
      (e) => {
        const r = document.createElement('div');
        r.className = 'demo-ripple';
        r.style.left = `${e.clientX}px`;
        r.style.top = `${e.clientY}px`;
        document.body.appendChild(r);
        setTimeout(() => r.remove(), 600);
      },
      true,
    );
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
};

const showCard = (page, { title, lines, fadeIn = true }) =>
  page.evaluate(
    ({ logo, title, lines, fadeIn }) => {
      document.getElementById('demo-card')?.remove();
      const card = document.createElement('div');
      card.id = 'demo-card';
      card.style.cssText = `position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;
        justify-content:center;gap:22px;background:#0f3f3c;color:#fff;font-family:inherit;text-align:center;
        transition:opacity 700ms ease;opacity:${fadeIn ? 0 : 1}`;
      card.innerHTML = `
        <div style="width:120px;height:120px">${logo.replace('<svg', '<svg width="120" height="120"')}</div>
        <div style="font-size:72px;font-weight:700;letter-spacing:-1px">${title}</div>
        ${lines.map((l, i) => `<div style="font-size:${i ? 26 : 34}px;opacity:${i ? 0.7 : 0.92};max-width:1300px">${l}</div>`).join('')}`;
      document.body.appendChild(card);
      requestAnimationFrame(() => requestAnimationFrame(() => (card.style.opacity = '1')));
    },
    { logo: LOGO_SVG, title, lines, fadeIn },
  );

const hideCard = (page) =>
  page.evaluate(() => {
    const card = document.getElementById('demo-card');
    if (!card) return;
    card.style.opacity = '0';
    setTimeout(() => card.remove(), 800);
  });

// ---------------------------------------------------------------------------------------------
// Interaction helpers. Every helper waits for its target and fails loudly, so a broken step
// aborts the recording instead of producing a video with a silent gap.
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

async function typeInto(locator, text) {
  await click(locator);
  await locator.pressSequentially(text, { delay: 18 });
}

async function scrollTo(locator, block = 'start') {
  await locator.waitFor({ state: 'attached', timeout: 15000 });
  await locator.evaluate((el, block) => el.scrollIntoView({ behavior: 'smooth', block }), block);
  await hold(1100);
}

const scrollTop = async () => {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await hold(900);
};

const expectVisible = (locator, timeout = 10000) => locator.waitFor({ state: 'visible', timeout });

const nav = (label) => page.locator('nav.sidebar__nav').getByRole('link', { name: label, exact: true });

async function waitForUrl(path) {
  await page.waitForURL((url) => url.pathname === path, { timeout: 15000 });
  await page.waitForLoadState('networkidle');
}

// ---------------------------------------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------------------------------------
async function run() {
  // --lang makes native inputs (e.g. the date picker) use Portuguese day/month order.
  const browser = await chromium.launch({ args: ['--lang=pt-PT'] });
  const context = await browser.newContext({
    viewport: SIZE,
    deviceScaleFactor: 1,
    locale: 'pt-MZ',
    timezoneId: 'Africa/Maputo',
    colorScheme: 'light',
    recordVideo: { dir: RAW, size: SIZE },
  });
  await context.addInitScript(overlayInit);
  t0 = Date.now();
  page = await context.newPage();
  await page.clock.setFixedTime(DEMO_NOW);
  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  // Load the app behind the intro card so no loading state is ever on screen.
  await page.goto(`${BASE_URL}/dashboard`);
  await showCard(page, {
    title: 'FleetOps MZ',
    lines: ['Gestão de frota, transporte de carga e rentabilidade por viagem', 'Porto da Beira · Corredor da Beira · Moçambique'],
    fadeIn: false,
  });
  await page.waitForLoadState('networkidle');
  await expectVisible(page.getByText('Frota total'));
  await page.mouse.move(cursor.x, cursor.y);
  await hold(600);

  // 0 — Intro
  mark('intro', 'Abertura — marca FleetOps MZ');
  await hold(4000);
  await hideCard(page);
  await hold(900);

  // 1 — Dashboard overview
  mark('dashboard', 'Painel — visão geral da frota');
  await hold(1500);
  for (const label of ['Frota total', 'Viagens em curso', 'Receita do período', 'Margem de contribuição (estimada)']) {
    await moveTo(page.locator('app-kpi-card').filter({ hasText: label }).first());
    await hold(1100);
  }
  await moveTo(page.getByRole('heading', { name: /Alertas operacionais/ }));
  await hold(2000);
  await scrollTo(page.locator('#dash-active-title'), 'center');
  await hold(2500);
  await scrollTop();

  // 2 — Active trips, available vehicles and driver assignments
  mark('trips', 'Viagens em curso, viaturas disponíveis e motoristas');
  await click(nav('Viagens'));
  await waitForUrl('/trips');
  await hold(1200);
  await click(page.getByRole('tab', { name: /Em curso/ }));
  await expectVisible(page.getByRole('link', { name: 'VG-2026-0431', exact: true }));
  await hold(3000);
  await click(nav('Viaturas'));
  await waitForUrl('/vehicles');
  await hold(1000);
  await click(page.getByRole('tab', { name: /Disponível/ }));
  await expectVisible(page.locator('table tbody tr').first());
  await hold(3000);
  await click(nav('Motoristas'));
  await waitForUrl('/drivers');
  await hold(3000);

  // 3 — Dispatch board, Beira → Chimoio
  mark('dispatch', 'Quadro de despacho — viagem Beira → Chimoio');
  await click(nav('Quadro de despacho'));
  await waitForUrl('/dispatch');
  await hold(2000);
  const columnInTransit = page.locator('section.board__column[data-column="in_transit"]');
  await moveTo(columnInTransit.locator('header'));
  await hold(1500);
  const chimoioCard = page.locator('app-dispatch-card').filter({ hasText: 'VG-2026-0431' });
  await moveTo(chimoioCard, { dy: 0.35 });
  await hold(3000);
  await moveTo(page.locator('section.board__column[data-column="delayed"] header'));
  await hold(1500);

  // 4 — Trip details
  mark('trip-detail', 'Detalhe da viagem VG-2026-0431');
  await click(chimoioCard.getByRole('link', { name: /VG-2026-0431/ }));
  await waitForUrl('/trips/trp031');
  await expectVisible(page.getByRole('heading', { name: 'VG-2026-0431' }));
  await hold(2500);
  await moveTo(page.getByRole('heading', { name: 'Atribuição' }));
  await hold(1200);
  await moveTo(page.locator('a.list-row').filter({ hasText: 'Armando Sumbana' }));
  await hold(1800);
  await scrollTo(page.getByRole('heading', { name: 'Carga', exact: true }), 'start');
  await hold(2500);
  await scrollTo(page.getByRole('heading', { name: 'Histórico da viagem' }), 'start');
  await hold(3000);
  await scrollTop();

  // 5 — Delay alert → review → resolution → driver incident record
  mark('incident', 'Alerta de atraso, resolução e registo de ocorrência');
  await click(page.locator('.topbar__bell'));
  const alertItem = page.locator('.notification-item').filter({ hasText: 'VG-2026-0433' });
  await expectVisible(alertItem);
  await moveTo(alertItem);
  await hold(2500);
  await click(alertItem);
  await waitForUrl('/trips/trp033');
  const delayAlert = page.locator('.alert--warning').filter({ hasText: 'Motivo do atraso' });
  await expectVisible(delayAlert);
  await moveTo(delayAlert, { dx: 0.3 });
  await hold(3000);

  await click(page.getByRole('button', { name: 'Alterar estado' }));
  const statusDialog = page.getByRole('dialog');
  await expectVisible(statusDialog);
  await hold(800);
  await click(statusDialog.locator('label.radio').filter({ hasText: 'Em trânsito' }));
  await hold(800);
  await typeInto(
    statusDialog.locator('#trip-status-note'),
    'Peça de travagem substituída em Xai-Xai. Viatura inspeccionada; viagem retomada. Cliente informado.',
  );
  await hold(1000);
  await click(statusDialog.getByRole('button', { name: 'Alterar estado' }));
  await statusDialog.waitFor({ state: 'hidden' });
  await expectVisible(page.locator('app-page-header').getByText('Em trânsito'));
  await hold(2000);
  await scrollTo(page.getByRole('heading', { name: 'Histórico da viagem' }), 'start');
  await expectVisible(page.locator('.timeline__note').filter({ hasText: 'Peça de travagem substituída' }));
  await moveTo(page.locator('.timeline__note').filter({ hasText: 'Peça de travagem substituída' }), { dx: 0.2 });
  await hold(3000);

  await scrollTo(page.getByRole('heading', { name: 'Atribuição' }), 'center');
  await click(page.locator('a.list-row').filter({ hasText: 'Narciso Mazive' }));
  await waitForUrl('/drivers/d08');
  await hold(1500);
  await click(page.getByRole('tab', { name: /Ocorrências/ }));
  await hold(1500);
  await click(page.getByRole('button', { name: 'Registar ocorrência' }));
  const incidentDialog = page.getByRole('dialog');
  await expectVisible(incidentDialog);
  await hold(600);
  await moveTo(incidentDialog.locator('#inc-type'));
  await incidentDialog.locator('#inc-type').selectOption('late_delivery');
  await hold(500);
  await click(incidentDialog.locator('label.radio').filter({ hasText: 'Média' }));
  await moveTo(incidentDialog.locator('#inc-trip'));
  await incidentDialog.locator('#inc-trip').selectOption('trp033');
  await hold(500);
  await typeInto(
    incidentDialog.locator('#inc-desc'),
    'Entrega com atraso causado pela avaria de travões de 21/10. Reparação concluída; viagem retomada.',
  );
  await hold(800);
  await click(incidentDialog.getByRole('button', { name: 'Registar ocorrência' }));
  await incidentDialog.waitFor({ state: 'hidden' });
  await expectVisible(page.locator('.toast').filter({ hasText: 'Ocorrência registada' }));
  await expectVisible(page.locator('.timeline__note').filter({ hasText: 'Reparação concluída; viagem retomada' }));
  await hold(3500);

  // 6 — Fuel and expenses
  mark('costs', 'Combustível e despesas');
  await click(nav('Combustível'));
  await waitForUrl('/fuel');
  await hold(1500);
  for (const label of ['Custo de combustível', 'Consumo médio', 'Registos a verificar']) {
    await moveTo(page.locator('app-kpi-card').filter({ hasText: label }).first());
    await hold(1300);
  }
  await moveTo(page.getByRole('heading', { name: 'Consumo por viatura' }));
  await hold(2000);
  await click(nav('Despesas'));
  await waitForUrl('/expenses');
  await hold(1500);
  await moveTo(page.getByRole('heading', { name: 'Despesas por categoria' }));
  await hold(2500);
  await click(page.getByRole('tab', { name: /Pendentes/ }));
  await scrollTo(page.locator('table'), 'center');
  await hold(3000);
  await scrollTop();

  // 7 — Completed trip profitability
  mark('profitability', 'Viagem concluída — receita, custos directos e margem');
  await click(nav('Viagens'));
  await waitForUrl('/trips');
  await click(page.getByRole('tab', { name: /Entregues/ }));
  await hold(800);
  const search = page.getByPlaceholder(/Pesquisar referência/);
  await typeInto(search, 'VG-2026-0403');
  const row = page.getByRole('link', { name: 'VG-2026-0403' });
  await expectVisible(row);
  await hold(1200);
  await click(row);
  await waitForUrl('/trips/trp003');
  await expectVisible(page.getByRole('heading', { name: 'VG-2026-0403' }));
  await hold(2000);
  await moveTo(page.locator('.kv-list li').filter({ hasText: 'Receita' }).first());
  await hold(2000);
  await moveTo(page.locator('.kv-list li').filter({ hasText: 'Custos directos registados' }).first());
  await hold(2000);
  await moveTo(page.locator('.kv-list__total').filter({ hasText: 'Margem de contribuição' }).first());
  await hold(3000);
  await scrollTo(page.getByRole('heading', { name: 'Custos registados' }), 'start');
  await hold(4000);
  await scrollTop();

  // 8 — Back to the operational dashboard, brand close
  mark('closing', 'Painel operacional e encerramento');
  await click(nav('Painel'));
  await waitForUrl('/dashboard');
  await expectVisible(page.getByText('Frota total'));
  await page.mouse.move(1880, 1040, { steps: 20 });
  await hold(3500);
  await showCard(page, {
    title: 'FleetOps MZ',
    lines: ['Mais controlo sobre cada viagem, cada custo e cada metical.', 'Demonstração com dados fictícios'],
  });
  await hold(4500);
  mark('end', 'Fim');

  const video = page.video();
  await context.close();
  await browser.close();
  const rawPath = await video.path();
  return { rawPath, consoleErrors };
}

const { rawPath, consoleErrors } = await run();

// Trim the blank first frames (before the intro card) and encode a standard H.264 MP4.
const start = Math.max(0, marks.find((m) => m.id === 'intro').at - 0.2);
const end = marks.find((m) => m.id === 'end').at;
const mp4 = join(OUT, 'fleetops-mz-demo-1080p.mp4');
const webm = join(OUT, 'fleetops-mz-demo-raw.webm');
renameSync(rawPath, webm);
execFileSync(
  ffmpegPath,
  ['-y', '-loglevel', 'error', '-ss', start.toFixed(2), '-i', webm, '-t', (end - start).toFixed(2), '-vf', 'fps=30', '-c:v', 'libx264',
    '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4],
  { stdio: 'inherit' },
);

const timeline = marks.map((m) => ({ ...m, at: Math.max(0, +(m.at - start).toFixed(1)) }));
writeFileSync(join(OUT, 'timeline.json'), JSON.stringify({ video: 'fleetops-mz-demo-1080p.mp4', duration: +(end - start).toFixed(1), scenes: timeline, consoleErrors }, null, 2));
console.log(`\nVideo: ${mp4}\nDuration: ${(end - start).toFixed(1)} s`);
if (consoleErrors.length) console.warn('Console errors during recording:', consoleErrors);
