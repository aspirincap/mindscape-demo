import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { JOURNEYS } from '../src/core/travel.mjs';

// Render standalone HTML from the same catalogue used by the scene action cards.
// Static public assets work in both Node preview and Cloudflare without a second app runtime.
const root = fileURLToPath(new URL('..', import.meta.url));
const vite = await createServer({ root, configFile: false,
  server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom' });
const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
try {
  const { default: Journeys } = await vite.ssrLoadModule('/src/journeys.jsx');
  const css = await readFile(new URL('../src/journeys.css', import.meta.url), 'utf8');
  const document = (scene, title, description) => `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#03080b"><meta name="description" content="${esc(description)}"><title>${esc(title)} · 在野 Go Wild</title><link rel="icon" href="/favicon.svg"><style>${css}</style></head><body><div id="root">${renderToStaticMarkup(React.createElement(Journeys, { scene }))}</div></body></html>\n`;
  await mkdir(new URL('../public/activities/', import.meta.url), { recursive: true });
  for (const journey of JOURNEYS) {
    await writeFile(new URL(`../public/activities/${journey.scene_id}.html`, import.meta.url), document(journey.scene_id, journey.title, journey.intro));
  }
  await writeFile(new URL('../public/journeys.html', import.meta.url), document(null, '旅行行程', '22 个自然目的地的旅行行程、每日安排与出行提醒。'));
  console.log(`Generated ${JOURNEYS.length} standalone destination pages and the journey directory.`);
} finally { await vite.close(); }
