// Renders the README's pictures of the settings window from made-up data (no real folders or sessions).
// usage: node tools/settingsframe.mjs   → docs/settings.png, docs/settings-en.png
// (needs playwright-core: npm i -D playwright-core, or PW_FROM=<a package.json that has it>; CHROME=path)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as S from '../src/settings.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = S.apply(S.load(path.join(root, 'out', 'no-such-settings.json')), {
  custom: [{ id: 'c1', name: 'Claude Code (WSL)', kind: 'claude', path: '\\\\wsl$\\Ubuntu\\home\\me\\.claude', color: '#b9a2ff', on: true }],
});
const state = (lang) => ({ cfg, lang, version: JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version, platform: 'win32', fontFiles: [], fontView: [],
  keysOk: { show: true, peek: true, jump: true, pause: true, text: true, settings: true, quit: true },
  info: { claude: { found: true, path: '~\\.claude', today: 3 }, codex: { found: true, path: '~\\.codex', today: 1 }, gemini: { found: true, path: '~\\.gemini', today: 0 }, deepseek: { found: true, path: '~\\.dsh', today: 1 },
    cursor: { found: true, path: '~\\AppData\\Roaming\\Cursor', today: 0 }, custom: { c1: { found: true, today: 2 } } },
  displays: [{ id: '1', primary: true, label: '1', size: '2560×1600' }] });
// the page talks to the program through window.cfg: here every call answers with the made-up state
const stub = (lang) => `<script>window.cfg = new Proxy({}, { get: (_t, k) => k === 'onUpdate' ? () => {} : k === 'update' ? async () => ({ status: 'latest' }) : async () => (${JSON.stringify(state(lang))}) });</script>`;
const src = fs.readFileSync(path.join(root, 'app', 'settings.html'), 'utf8').replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '');
const tmp = path.join(root, 'app', '_frame.html');
const { chromium } = createRequire(process.env.PW_FROM || import.meta.url)('playwright-core');
const b = await chromium.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--allow-file-access-from-files'] });
try {
  for (const [lang, file] of [['zh', 'docs/settings.png'], ['en', 'docs/settings-en.png']]) {
    fs.writeFileSync(tmp, src.replace('<script src="../src/i18n.js"></script>', stub(lang) + '<script src="../src/i18n.js"></script>'));
    const pg = await b.newPage({ viewport: { width: 940, height: 680 }, deviceScaleFactor: 1.5, colorScheme: 'dark' });
    await pg.goto(pathToFileURL(tmp).href); await pg.waitForTimeout(700);
    await pg.screenshot({ path: path.join(root, file) }); await pg.close();
    console.log(file);
  }
  // ALL=1: every page, dark and light, into out/ (for looking the design over; not used by the README)
  if (process.env.ALL) for (const scheme of ['dark', 'light']) {
    fs.writeFileSync(tmp, src.replace('<script src="../src/i18n.js"></script>', stub('zh') + '<script src="../src/i18n.js"></script>'));
    const pg = await b.newPage({ viewport: { width: 940, height: 680 }, deviceScaleFactor: 1, colorScheme: scheme });
    await pg.goto(pathToFileURL(tmp).href); await pg.waitForTimeout(600);
    for (const tab of ['ai', 'look', 'usage', 'behave', 'privacy', 'keys']) { await pg.click(`[data-tab=${tab}]`); await pg.waitForTimeout(300); await pg.screenshot({ path: path.join(root, 'out', `set-${scheme}-${tab}.png`), fullPage: false }); }
    await pg.close();
  }
} finally { await b.close(); try { fs.unlinkSync(tmp); } catch {} }
