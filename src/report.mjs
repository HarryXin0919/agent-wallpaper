// Today's report: what each assistant did today, in numbers only (no requests, file names or commands), for a
// picture the person can share. "Today" is the local calendar day; a session counts when it was active today.
// Only what the logs hold is counted: the readers keep the last 12 hours, and the latest request of each session.

const DAY = 24 * 3600e3;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// list: [{ task: { t0, tok, brand: { name, color } }, last }], states: what each task is doing now ('done' | …)
export function summarize(list, usage, now, stateOf) {
  const day0 = new Date(now).setHours(0, 0, 0, 0), by = new Map();
  for (const x of list) {
    if (!(x.last >= day0)) continue;
    const b = (x.task && x.task.brand) || { name: 'Claude', color: '#f4a98c' };
    if (!by.has(b.name)) by.set(b.name, { name: b.name, color: b.color, tasks: 0, done: 0, ms: 0, tok: 0 });
    const r = by.get(b.name), from = Math.max(x.task.t0 || x.last, day0);
    r.tasks++; r.ms += Math.max(0, Math.min(x.last, now) - from); r.tok += (x.task.tok && x.task.tok.total) || 0;
    if (stateOf && stateOf(x.task, now).kind === 'done') r.done++;
  }
  // the usage figures cover the whole day, also sessions the readers no longer hold: prefer them where they exist
  const u = usage || {}, claude = by.get('Claude'), codex = by.get('Codex');
  if (claude && u.today && u.today.tok > claude.tok) claude.tok = u.today.tok;
  if (codex && u.codex && u.codex.today && u.codex.today.tok > codex.tok) codex.tok = u.codex.today.tok;
  const rows = [...by.values()].sort((a, b) => b.ms - a.ms);
  return { day: day0, rows, tasks: rows.reduce((a, r) => a + r.tasks, 0), done: rows.reduce((a, r) => a + r.done, 0), ms: rows.reduce((a, r) => a + r.ms, 0), tok: rows.reduce((a, r) => a + r.tok, 0), span: DAY };
}

const TEXT = {
  zh: { title: '今天的 AI 工作', tasks: '个任务', done: '已完成', time: '工作时长', tok: 'tokens', none: '今天还没有任务', h: (h, m) => (h ? `${h} 小时 ${m} 分` : `${m} 分钟`), date: (d) => `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日` },
  en: { title: 'Today with my AI agents', tasks: 'tasks', done: 'finished', time: 'working time', tok: 'tokens', none: 'No tasks yet today', h: (h, m) => (h ? `${h} h ${m} min` : `${m} min`), date: (d) => d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) },
};
const dur = (T, ms) => { const m = Math.round(ms / 60000); return T.h(Math.floor(m / 60), m % 60); };
const tok = (n, lang) => (lang === 'en' ? (n >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'K' : String(n))
  : n >= 1e8 ? (n / 1e8).toFixed(2) + ' 亿' : n >= 1e4 ? Math.round(n / 1e4) + ' 万' : String(n));

// the card as a page, 1200 × 630 (the usual size of a shared picture). `icon`: the app icon as a data URL
export function cardHTML(sum, lang, icon) {
  const T = TEXT[lang === 'en' ? 'en' : 'zh'], max = Math.max(1, ...sum.rows.map((r) => r.ms));
  const rows = sum.rows.slice(0, 5).map((r) => `<div class="r"><span class="n"><i style="background:${esc(r.color)}"></i>${esc(r.name)}</span>
    <div class="bar"><b style="width:${Math.max(3, (r.ms / max) * 100).toFixed(1)}%;background:${esc(r.color)}"></b></div>
    <span class="v">${r.tasks} ${T.tasks} · ${esc(dur(T, r.ms))}${r.tok ? ' · ' + esc(tok(r.tok, lang)) : ''}</span></div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
* { box-sizing: border-box; margin: 0; }
body { width: 1200px; height: 630px; background: #17171a; color: #f2f2f4; font: 22px/1.4 "Segoe UI Variable Text", "Segoe UI", system-ui, "Microsoft YaHei UI", "PingFang SC", sans-serif; padding: 56px 64px; display: flex; flex-direction: column; -webkit-font-smoothing: antialiased; }
.top { display: flex; align-items: center; gap: 18px; }
.top img { width: 56px; height: 56px; border-radius: 14px; }
.top h1 { font: 600 34px/1.2 "Segoe UI Variable Display", "Segoe UI", system-ui, "Microsoft YaHei UI", sans-serif; }
.top p { color: #9d9da6; font-size: 20px; margin-top: 2px; }
.nums { display: flex; gap: 64px; margin: 44px 0 40px; }
.nums div b { display: block; font: 600 64px/1 "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif; letter-spacing: -1.5px; font-variant-numeric: tabular-nums; }
.nums div b small { font-size: 26px; font-weight: 500; letter-spacing: 0; margin-left: 6px; }
.nums div span { color: #9d9da6; font-size: 20px; display: block; margin-top: 10px; }
.rows { display: flex; flex-direction: column; gap: 16px; }
.r { display: grid; grid-template-columns: 210px 1fr 400px; align-items: center; gap: 22px; }
.r .n { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .r .n i { display: inline-block; width: 12px; height: 12px; border-radius: 50%; margin-right: 12px; }
.bar { height: 10px; border-radius: 99px; background: rgba(255, 255, 255, .09); overflow: hidden; } .bar b { display: block; height: 100%; border-radius: 99px; }
.r .v { color: #9d9da6; font-size: 19px; text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.none { color: #9d9da6; margin-top: 60px; font-size: 26px; }
.foot { margin-top: auto; color: #6f6f78; font-size: 17px; display: flex; justify-content: space-between; }
</style></head><body>
<div class="top">${icon ? `<img src="${icon}">` : ''}<div><h1>${esc(T.title)}</h1><p>${esc(T.date(new Date(sum.day)))}</p></div></div>
${sum.tasks ? `<div class="nums"><div><b>${sum.tasks}</b><span>${esc(T.tasks)}${sum.done ? ` · ${sum.done} ${esc(T.done)}` : ''}</span></div>
<div><b>${esc(dur(T, sum.ms))}</b><span>${esc(T.time)}</span></div>${sum.tok ? `<div><b>${esc(tok(sum.tok, lang))}</b><span>${esc(T.tok)}</span></div>` : ''}</div>
<div class="rows">${rows}</div>` : `<div class="none">${esc(T.none)}</div>`}
<div class="foot"><span>Agent Wallpaper</span><span>github.com/HarryXin0919/agent-wallpaper</span></div>
</body></html>`;
}
