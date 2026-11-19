// Launch check: starts the real program on made-up logs, saves a screenshot and checks what the page drew.
// usage: node test/launch.mjs [out.png]   (CI runs it on Windows and macOS)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { writeAll } from './fixtures.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || path.join(root, 'out', `launch-${process.platform}.png`));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-wallpaper-launch-'));
const P = writeAll(path.join(tmp, 'logs'));
fs.mkdirSync(path.dirname(out), { recursive: true });
const electron = createRequire(import.meta.url)('electron');
const env = { ...process.env, WALL_TEST: path.join(tmp, 'user'), WALL_ROOT: P.claude, WALL_CODEX: P.codex, WALL_CURSOR: P.cursor, WALL_GEMINI: P.gemini, WALL_DEEPSEEK: P.deepseek,
  WALL_CAPTURE: out, WALL_CAPTURE_AFTER: '9000', WALL_EXIT: '1', WALL_NOFOLLOW: '1', WALL_UNCOVERED: '1', WALL_LOG: '1' };
delete env.ELECTRON_RUN_AS_NODE;
// LAUNCH_EXE: check a packaged build instead of the source folder
const child = process.env.LAUNCH_EXE ? spawn(process.env.LAUNCH_EXE, [], { env, stdio: ['ignore', 'pipe', 'pipe'] }) : spawn(electron, [root], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
child.stdout.on('data', (b) => { log += b; }); child.stderr.on('data', (b) => { log += b; });
const timer = setTimeout(() => { child.kill(); }, 60000);
child.on('exit', (code) => {
  clearTimeout(timer);
  fs.writeFileSync(out.replace(/\.png$/, '.log'), log);
  const page = (log.match(/page state (\{.*\})/) || [])[1];
  const state = page ? JSON.parse(page) : null;
  const problems = [];
  if (!fs.existsSync(out)) problems.push('no screenshot');
  if (!state) problems.push('no page state');
  else if (state.snap < 4) problems.push(`expected 4+ tasks, page had ${state.snap}`);
  if (/attach .*"ok":false/.test(log)) problems.push('could not attach to the desktop');
  console.log(state ? `tasks drawn: ${state.snap}, window ${state.W}x${state.H}` : '', '| exit', code);
  if (problems.length) { console.error('LAUNCH CHECK FAILED:', problems.join('; ')); console.error(log.slice(-3000)); process.exit(1); }
  console.log('launch check passed:', out);
});
