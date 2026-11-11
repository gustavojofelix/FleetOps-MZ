// Shared pieces of the demo recorders: a visible cursor with click ripple, and the brand title
// cards. They are injected into the page for the video; the application code is not modified.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const LOGO_SVG = readFileSync(join(HERE, '../../public/favicon.svg'), 'utf8');

export const overlayInit = () => {
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

export const showCard = (page, { title, lines, fadeIn = true }) =>
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

export const hideCard = (page) =>
  page.evaluate(() => {
    const card = document.getElementById('demo-card');
    if (!card) return;
    card.style.opacity = '0';
    setTimeout(() => card.remove(), 800);
  });
