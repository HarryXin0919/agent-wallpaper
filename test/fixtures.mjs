// Made-up session logs in the formats Claude Code, Codex and Cursor write, with times relative to `now`.
// Used by the tests and by the launch check in CI (so a screenshot shows tasks in progress).
// usage: node test/fixtures.mjs <dir>   → writes <dir>/claude/projects, <dir>/codex/sessions, <dir>/cursor/state.vscdb
import fs from 'node:fs';
import path from 'node:path';

const iso = (t) => new Date(t).toISOString();
const jl = (recs) => recs.map((r) => JSON.stringify(r)).join('\n') + '\n';

export function claudeLog(now) {
  const t = (s) => iso(now - s * 1000), sid = 'a1b2c3d4-0000-4000-8000-000000000001';
  const u = (s, content, extra) => ({ type: 'user', sessionId: sid, timestamp: t(s), message: { role: 'user', content }, ...extra });
  const a = (s, id, content, extra) => ({ type: 'assistant', sessionId: sid, timestamp: t(s), message: { id, role: 'assistant', model: 'claude-opus-5-5', content, usage: { input_tokens: 1200, cache_creation_input_tokens: 3000, cache_read_input_tokens: 40000, output_tokens: 600 }, ...extra } });
  const todos = (cur) => ['Read the settings page', 'Add theme tokens', 'Wire up the toggle', 'Run the tests'].map((c, i) => ({ content: c, activeForm: c, status: i < cur ? 'completed' : i === cur ? 'in_progress' : 'pending' }));
  return [
    { type: 'custom-title', customTitle: 'Dark mode', sessionId: sid },
    u(600, 'Add a dark mode to the settings page'),
    { ...a(590, 'm1', [{ type: 'thinking', thinking: '' }]), thinkingDurationMs: 4000 },
    a(588, 'm2', [{ type: 'tool_use', id: 'tu1', name: 'TodoWrite', input: { todos: todos(0) } }]),
    u(587, [{ type: 'tool_result', tool_use_id: 'tu1', content: 'ok' }]),
    a(580, 'm3', [{ type: 'tool_use', id: 'tu2', name: 'Read', input: { file_path: 'src/Settings.tsx' } }]),
    u(579, [{ type: 'tool_result', tool_use_id: 'tu2', content: '...' }]),
    a(400, 'm4', [{ type: 'tool_use', id: 'tu3', name: 'TodoWrite', input: { todos: todos(2) } }]),
    u(399, [{ type: 'tool_result', tool_use_id: 'tu3', content: 'ok' }]),
    a(300, 'm5', [{ type: 'tool_use', id: 'tu4', name: 'Edit', input: { file_path: 'src/theme.css', old_string: 'a\nb', new_string: 'a\nb\nc\nd' } }]),
    u(299, [{ type: 'tool_result', tool_use_id: 'tu4', content: 'ok' }]),
    a(60, 'm6', [{ type: 'text', text: 'The toggle is in place; running the tests next.' }]),
    a(20, 'm7', [{ type: 'tool_use', id: 'tu5', name: 'Bash', input: { command: 'npm test', description: 'Run the theme tests' } }]),
  ];
}

export function claudeDoneLog(now) {
  const t = (s) => iso(now - s * 1000), sid = 'a1b2c3d4-0000-4000-8000-000000000002';
  return [
    { type: 'user', sessionId: sid, timestamp: t(3000), message: { role: 'user', content: 'Write the release notes' } },
    { type: 'assistant', sessionId: sid, timestamp: t(2900), message: { id: 'd1', role: 'assistant', content: [{ type: 'tool_use', id: 'x1', name: 'Write', input: { file_path: 'CHANGELOG.md', content: 'one\ntwo' } }], usage: { input_tokens: 10, output_tokens: 20 } } },
    { type: 'user', sessionId: sid, timestamp: t(2899), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x1', content: 'ok' }] } },
    { type: 'assistant', sessionId: sid, timestamp: t(2890), message: { id: 'd2', role: 'assistant', content: [{ type: 'text', text: 'Done.' }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } } },
  ];
}

export function codexLog(now) {
  const t = (s) => iso(now - s * 1000), ms = (s) => now - s * 1000, tid = '01a1ffff-0000-7000-8000-000000000001', turn = 'turn-1';
  const ev = (s, payload) => ({ timestamp: t(s), type: 'event_msg', payload });
  const item = (s0, s1, it) => ev(s1, { type: 'item_completed', thread_id: tid, turn_id: turn, item: it, started_at_ms: ms(s0), completed_at_ms: ms(s1) });
  return [
    { timestamp: t(900), type: 'session_meta', payload: { id: tid, source: 'vscode', cwd: '/work', originator: 'Codex Desktop' } },
    { timestamp: t(900), type: 'turn_context', payload: { approval_policy: 'never', model: 'gpt' } },
    ev(899, { type: 'task_started', turn_id: turn }),
    item(898, 898, { type: 'UserMessage', id: 'u1', content: [{ type: 'text', text: '# Files mentioned by the user:\n\n## a.png: /tmp/a.png\n\n## My request:\nThe upload test fails one run in five. Fix it.' }] }),
    { timestamp: t(880), type: 'response_item', payload: { type: 'reasoning', id: 'r1' } },
    { timestamp: t(879), type: 'response_item', payload: { type: 'custom_tool_call', call_id: 'c1', name: 'exec', input: 'text(await tools.exec_command({cmd:"pytest tests/test_upload.py -x"}))' } },
    item(879, 870, { type: 'CommandExecution', id: 'e1', command: ['pwsh', '-Command', 'pytest tests/test_upload.py -x'], status: 'completed', exit_code: 1 }),
    { timestamp: t(869), type: 'response_item', payload: { type: 'custom_tool_call_output', call_id: 'c1', output: [] } },
    { timestamp: t(600), type: 'response_item', payload: { type: 'custom_tool_call', call_id: 'c2', name: 'exec', input: 'text(await tools.apply_patch("*** Begin Patch\\n*** Update File: api/upload.py\\n@@\\n-a\\n+b\\n*** End Patch"))' } },
    item(600, 598, { type: 'FileChange', id: 'f1', changes: { '/work/api/upload.py': { type: 'update', unified_diff: '@@ -1,2 +1,3 @@\n-a\n+b\n+c\n' } }, status: 'completed' }),
    { timestamp: t(597), type: 'response_item', payload: { type: 'custom_tool_call_output', call_id: 'c2', output: [] } },
    { timestamp: t(596), type: 'token_usage_record', payload: { response_id: 'resp1', usage: { input_tokens: 50000, cached_input_tokens: 45000, output_tokens: 800, total_tokens: 50800 } } },
    ev(595, { type: 'token_count', info: {}, rate_limits: { primary: { used_percent: 41, window_minutes: 10080, resets_at: Math.round(now / 1000) + 4 * 86400 }, secondary: null, plan_type: 'plus' } }),
    item(590, 589, { type: 'AgentMessage', id: 'am1', content: [{ type: 'Text', text: 'The temp file closed too early; running the test 20 times now.' }] }),
    { timestamp: t(30), type: 'response_item', payload: { type: 'custom_tool_call', call_id: 'c3', name: 'exec', input: 'text(await tools.exec_command({cmd:"pytest tests/test_upload.py --count 20"}))' } },
  ];
}

// a Cursor database with one conversation in progress (built with node:sqlite)
export function cursorDb(file, now) {
  const { DatabaseSync } = process.getBuiltinModule('node:sqlite');
  if (fs.existsSync(file)) fs.unlinkSync(file);
  const db = new DatabaseSync(file);
  db.exec('create table cursorDiskKV (key text unique on conflict replace, value blob)');
  const put = db.prepare('insert into cursorDiskKV (key, value) values (?, ?)');
  const cid = 'cccc0000-1111-4222-8333-444444444444';
  const bubbles = [
    ['b1', { type: 1, text: 'Why does the build fail on CI?' }],
    ['b2', { type: 2, thinking: { text: '' }, thinkingDurationMs: 3000 }],
    ['b3', { type: 2, toolFormerData: { toolCallId: 't1', name: 'read_file_v2', status: 'completed', params: JSON.stringify({ targetFile: 'ci.yml' }) } }],
    ['b4', { type: 2, toolFormerData: { toolCallId: 't2', name: 'todo_write', status: 'completed', params: JSON.stringify({ todos: [{ content: 'Read the CI log', status: 'completed' }, { content: 'Fix the cache key', status: 'in_progress' }] }) } }],
    ['b5', { type: 2, toolFormerData: { toolCallId: 't3', name: 'run_terminal_command_v2', status: 'running', params: JSON.stringify({ command: 'npm run build' }) } }],
  ];
  put.run(`composerData:${cid}`, JSON.stringify({ composerId: cid, name: 'CI build', status: 'generating', createdAt: now - 400e3, lastUpdatedAt: now - 5e3, fullConversationHeadersOnly: bubbles.map(([id, b]) => ({ bubbleId: id, type: b.type })) }));
  for (const [id, b] of bubbles) put.run(`bubbleId:${cid}:${id}`, JSON.stringify(b));
  db.close();
  return cid;
}

export function geminiLog(now) {
  const t = (s) => iso(now - s * 1000);
  return [
    { sessionId: 'g-0001', projectHash: 'abc', startTime: t(700), lastUpdated: t(10), kind: 'main' },
    { id: 'u1', timestamp: t(700), type: 'user', content: [{ text: 'Add a dark theme to the docs site' }] },
    { id: 'g1', timestamp: t(690), type: 'gemini', content: '', thoughts: [{ subject: 'Plan', description: '', timestamp: t(685) }],
      toolCalls: [{ id: 'tc1', name: 'read_file', args: { absolute_path: '/site/theme.css' }, status: 'success', timestamp: t(684) }], tokens: { input: 9000, output: 300, cached: 6000, thoughts: 120, total: 9420 } },
    { id: 'g2', timestamp: t(400), type: 'gemini', content: '', toolCalls: [{ id: 'tc2', name: 'replace', args: { file_path: '/site/theme.css', old_string: 'a', new_string: 'a\nb' }, status: 'scheduled', timestamp: t(400) }] },
    { $patch: { id: 'g2', toolCalls: [{ id: 'tc2', status: 'success', result: [] }] } },
    { id: 'g3', timestamp: t(15), type: 'gemini', content: '', toolCalls: [{ id: 'tc3', name: 'run_shell_command', args: { command: 'npm run build', description: 'Build the site' }, status: 'awaiting_approval', timestamp: t(15) }] },
  ];
}

export function writeAll(dir, now = Date.now()) {
  const cp = path.join(dir, 'claude', 'projects', 'demo-project');
  fs.mkdirSync(cp, { recursive: true });
  fs.writeFileSync(path.join(cp, 'a1b2c3d4-0000-4000-8000-000000000001.jsonl'), jl(claudeLog(now)));
  fs.writeFileSync(path.join(cp, 'a1b2c3d4-0000-4000-8000-000000000002.jsonl'), jl(claudeDoneLog(now)));
  const xp = path.join(dir, 'codex', 'sessions', '2026', '11', '18');
  fs.mkdirSync(xp, { recursive: true });
  fs.writeFileSync(path.join(xp, 'rollout-2026-11-18T10-00-00-01a1ffff-0000-7000-8000-000000000001.jsonl'), jl(codexLog(now)));
  fs.writeFileSync(path.join(dir, 'codex', 'session_index.jsonl'), JSON.stringify({ id: '01a1ffff-0000-7000-8000-000000000001', thread_name: 'Flaky upload test' }) + '\n');
  const gp = path.join(dir, 'gemini', 'tmp', 'abc', 'chats');
  fs.mkdirSync(gp, { recursive: true });
  fs.writeFileSync(path.join(gp, 'session-2026-11-19T10-00-g0001.jsonl'), jl(geminiLog(now)));
  fs.mkdirSync(path.join(dir, 'cursor'), { recursive: true });
  cursorDb(path.join(dir, 'cursor', 'state.vscdb'), now);
  return { claude: path.join(dir, 'claude', 'projects'), codex: path.join(dir, 'codex'), cursor: path.join(dir, 'cursor', 'state.vscdb'), gemini: path.join(dir, 'gemini') };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) {
  console.log(JSON.stringify(writeAll(path.resolve(process.argv[2] || 'test-fixtures'))));
}
