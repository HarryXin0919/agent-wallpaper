// The settings window. Every change is saved and applied to the wallpaper at once.
(function () {
  const ZH = {
    nav: { ai: 'AI 来源', look: '显示', usage: '用量', behave: '行为与提醒', privacy: '隐私', keys: '快捷键' },
    ai: 'AI 来源', aiLead: '壁纸读取这些 AI 在本机写下的会话记录。每个来源有自己的颜色，面板顶边和名称标签用这个颜色。',
    found: '已找到', notFound: '没有找到', today: (n) => `今天 ${n} 个会话`, exp: '实验', custom: '自定义文件夹',
    addFolder: '添加文件夹', addHint: '另一个 Claude Code 或 Codex 的记录位置，比如 WSL 里的，或第二个账号的',
    notLogs: '这个文件夹里没有找到 Claude Code（projects）或 Codex（sessions）的记录。',
    cursorNote: 'Cursor 的记录里没有可靠的时间，操作按壁纸第一次看到它们的时间排列。TRAE 的对话记录是加密的，无法读取，所以不支持。',
    look: '显示', lookLead: '改动会立即出现在壁纸上。',
    lang: '语言', langS: '界面文字的语言', auto: '跟随系统',
    pos: '位置', posS: '“自动”会避开桌面图标', posO: { auto: '自动', left: '左', center: '中', right: '右' },
    size: '大小', sizeS: '面板整体缩放',
    screens: '屏幕', screensS: '显示在哪块屏幕上', primary: '主屏幕', all: '所有屏幕', screenN: (n, s) => `屏幕 ${n} · ${s}`,
    tasks: '同时显示的任务', tasksS: '同时在做的任务超过这个数时，多出来的缩成小卡片',
    glass: '玻璃深浅', glassS: '“自动”在动态壁纸上用深色玻璃', glassO: { auto: '自动', dark: '深', light: '浅' },
    motion: '动画', motionS: '“减少”只保留进度变化', motionO: { full: '完整', reduced: '减少', off: '关闭' },
    usage: '用量', usageLead: '最上面的用量面板显示套餐额度还剩多少。',
    showUsage: '显示用量面板', showUsageS: '关掉后，任务面板会占用整块空白区域',
    gH5: 'Claude 5 小时额度', gWeek: 'Claude 每周额度', gCodex: 'Codex 额度',
    behave: '行为与提醒', behaveLead: '什么时候出现、保留多久，以及什么时候提醒你。',
    followOpen: '打开 Claude 时自动出现', followOpenS: '开机时在“启动”文件夹放一个快捷方式，等 Claude 桌面端打开时再显示壁纸',
    followClose: '退出 Claude 时一起关闭',
    keep: '完成后保持清晰', keepS: '之后慢慢变淡，12 小时后消失', keepO: { 15: '15 分钟', 60: '1 小时', 180: '3 小时' },
    waitDone: '等你回复多久算完成', waitDoneS: '做完一轮、在等你回复的任务，超过这个时间就当作已完成', waitO: { 1: '1 小时', 2: '2 小时', 6: '6 小时' },
    nDone: '任务完成时通知', nApprove: '等你批准时通知', nQuota: '额度快用完时通知', nQuotaS: '每个额度周期只提醒一次',
    nAt: '提醒线', test: '发送测试通知',
    privacy: '隐私', privacyLead: '投屏、录屏或别人能看到你的屏幕时使用。',
    priv: '隐私模式', privS: '只显示会话标题和操作类型（读取文件、运行命令……），不显示你的提问原文、文件名、命令和回复内容',
    privNote: '只想临时隐藏所有文字时，用“隐藏文字”快捷键。',
    keys: '快捷键', keysLead: '点一下右边的按键，再按下新的组合键。按 Esc 取消。', taken: '这个组合键已被其他程序占用',
    keyNames: { show: '显示 / 隐藏壁纸', pause: '暂停 / 继续', text: '隐藏 / 显示文字', settings: '打开设置', quit: '退出' },
    press: '请按下组合键…', version: (v) => `版本 ${v}`,
  };
  const EN = {
    nav: { ai: 'AI sources', look: 'Display', usage: 'Usage', behave: 'Behavior & alerts', privacy: 'Privacy', keys: 'Shortcuts' },
    ai: 'AI sources', aiLead: 'The wallpaper reads the session logs these assistants keep on this computer. Each source has its own color, used for the top edge of its panels and its name tag.',
    found: 'Found', notFound: 'Not found', today: (n) => `${n} session${n === 1 ? "" : "s"} today`, exp: 'Experimental', custom: 'Custom folder',
    addFolder: 'Add a folder', addHint: 'Another Claude Code or Codex log location, such as one inside WSL or a second account',
    notLogs: 'No Claude Code (projects) or Codex (sessions) logs were found in this folder.',
    cursorNote: "Cursor's records carry no reliable times, so actions are ordered by when the wallpaper first sees them. TRAE encrypts its conversations, so it cannot be supported.",
    look: 'Display', lookLead: 'Changes show on the wallpaper right away.',
    lang: 'Language', langS: 'Language of the on-screen text', auto: 'System',
    pos: 'Position', posS: '"Auto" keeps clear of desktop icons', posO: { auto: 'Auto', left: 'Left', center: 'Center', right: 'Right' },
    size: 'Size', sizeS: 'Scale of all panels',
    screens: 'Screens', screensS: 'Where the wallpaper appears', primary: 'Main screen', all: 'All screens', screenN: (n, s) => `Screen ${n} · ${s}`,
    tasks: 'Tasks shown at once', tasksS: 'When more tasks are running, the rest become small cards',
    glass: 'Glass', glassS: '"Auto" uses dark glass over live wallpapers', glassO: { auto: 'Auto', dark: 'Dark', light: 'Light' },
    motion: 'Animation', motionS: '"Reduced" keeps only progress changes', motionO: { full: 'Full', reduced: 'Reduced', off: 'Off' },
    usage: 'Usage', usageLead: 'The usage panel at the top shows how much plan quota is left.',
    showUsage: 'Show the usage panel', showUsageS: 'Without it, the task panels use the whole empty area',
    gH5: 'Claude 5-hour quota', gWeek: 'Claude weekly quota', gCodex: 'Codex quota',
    behave: 'Behavior & alerts', behaveLead: 'When it appears, how long finished tasks stay, and when to alert you.',
    followOpen: 'Appear when Claude opens', followOpenS: 'Adds a Startup shortcut that shows the wallpaper once the Claude desktop app opens',
    followClose: 'Close when Claude quits',
    keep: 'Finished tasks stay clear for', keepS: 'Then they fade, and disappear after 12 hours', keepO: { 15: '15 min', 60: '1 hour', 180: '3 hours' },
    waitDone: 'A waiting turn counts as done after', waitDoneS: 'A task that finished a turn and waits for your reply', waitO: { 1: '1 hour', 2: '2 hours', 6: '6 hours' },
    nDone: 'Notify when a task finishes', nApprove: 'Notify when approval is needed', nQuota: 'Notify when a quota runs low', nQuotaS: 'Once per quota period',
    nAt: 'Alert at', test: 'Send a test notification',
    privacy: 'Privacy', privacyLead: 'For screen sharing, recording, or when others can see your screen.',
    priv: 'Privacy mode', privS: 'Shows only session titles and kinds of action (read a file, run a command…): no request text, file names, commands or replies',
    privNote: 'To hide all text for a moment, use the "hide text" shortcut.',
    keys: 'Shortcuts', keysLead: 'Click a shortcut, then press the new key combination. Esc cancels.', taken: 'Another program already uses this combination',
    keyNames: { show: 'Show / hide the wallpaper', pause: 'Pause / resume', text: 'Hide / show text', settings: 'Open settings', quit: 'Quit' },
    press: 'Press a combination…', version: (v) => `Version ${v}`,
  };
  const COLORS = ['#f4a98c', '#8fc1ff', '#b9a2ff', '#9fe6d2', '#ffd27a', '#ff9fb8'];
  let S = null, tab = 'ai', T = ZH, msg = '', recording = null;
  const $ = (h) => { const d = document.createElement('div'); d.innerHTML = h.trim(); return d.firstChild; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  async function set(patch) { S = await window.cfg.set(patch); draw(); }
  const seg = (path, opts, cur) => `<div class="seg">${(Array.isArray(opts) ? opts : Object.entries(opts)).map(([v, l]) => `<button data-set="${path}" data-v="${esc(v)}" class="${String(cur) === String(v) ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>`;
  const sw = (path, on, dis) => `<button class="sw${on ? ' on' : ''}" data-tog="${path}"${dis ? ' disabled' : ''}></button>`;
  const row = (title, sub, ctl) => `<div class="row"><div class="l"><b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div>${ctl}</div>`;
  const colors = (path, cur) => `<div class="colors">${COLORS.map((c) => `<button data-set="${path}" data-v="${c}" style="background:${c}" class="${c === cur ? 'on' : ''}"></button>`).join('')}</div>`;

  function sources() {
    const c = S.cfg, inf = S.info;
    const one = (id, name, extra) => {
      const s = c.sources[id], i = inf[id];
      const status = i.found ? `<em>${esc(T.found)}</em>${i.today != null ? ` · ${esc(T.today(i.today))}` : ''}${i.path ? ` · ${esc(i.path)}` : ''}` : `<em class="no">${esc(T.notFound)}</em>`;
      return `<div class="src${s.on ? '' : ' off'}"><span class="dot" style="background:${s.color}"></span><div class="grow"><div class="n">${esc(name)}${extra || ''}</div><div class="s">${status}</div></div>${colors(`sources.${id}.color`, s.color)}${sw(`sources.${id}.on`, s.on, !i.found && !s.on)}</div>`;
    };
    const customs = c.custom.map((x, k) => {
      const i = inf.custom[x.id] || {};
      return `<div class="src${x.on ? '' : ' off'}"><span class="dot" style="background:${x.color}"></span><div class="grow"><div class="n"><input class="name" data-name="${k}" value="${esc(x.name)}"><span class="chip">${esc(T.custom)} · ${x.kind === 'claude' ? 'Claude Code' : 'Codex'}</span></div><div class="s">${i.found ? `<em>${esc(T.found)}</em>${i.today != null ? ` · ${esc(T.today(i.today))}` : ''}` : `<em class="no">${esc(T.notFound)}</em>`} · ${esc(x.path)}</div></div>${colors(`custom.${k}.color`, x.color)}${sw(`custom.${k}.on`, x.on)}<button class="del" data-del="${k}" title="×">×</button></div>`;
    }).join('');
    return `<section><h1>${esc(T.ai)}</h1><div class="lead">${esc(T.aiLead)}</div>
      ${one('claude', 'Claude Code')}${one('codex', 'Codex')}${one('cursor', 'Cursor', `<span class="chip">${esc(T.exp)}</span>`)}${customs}
      <button class="add" id="add"><b>＋</b><span>${esc(T.addFolder)} — ${esc(T.addHint)}</span></button>
      <div class="msg">${esc(msg)}</div><div class="note">${esc(T.cursorNote)}</div></section>`;
  }
  function look() {
    const c = S.cfg;
    const scr = [['primary', T.primary], ['all', T.all]]; // a list: screen ids are numbers and would sort first in an object
    if (S.displays.length > 1) S.displays.forEach((d) => scr.push([d.id, T.screenN(d.label, d.size)]));
    return `<section><h1>${esc(T.look)}</h1><div class="lead">${esc(T.lookLead)}</div>
      <div class="box">
        ${row(T.lang, T.langS, seg('lang', { auto: T.auto, zh: '中文', en: 'English' }, c.lang))}
        ${row(T.pos, T.posS, seg('position', T.posO, c.position))}
        ${row(T.size, T.sizeS, `<div style="display:flex;gap:12px;align-items:center"><input type="range" min="80" max="140" step="5" value="${Math.round(c.scale * 100)}" id="scale"><span class="val" id="scaleV">${Math.round(c.scale * 100)}%</span></div>`)}
        ${row(T.screens, T.screensS, seg('screens', scr, c.screens))}
      </div><div class="box">
        ${row(T.tasks, T.tasksS, seg('maxTasks', { 1: '1', 2: '2', 3: '3', 4: '4' }, c.maxTasks))}
        ${row(T.glass, T.glassS, seg('glass', T.glassO, c.glass))}
        ${row(T.motion, T.motionS, seg('motion', T.motionO, c.motion))}
      </div></section>`;
  }
  function usage() {
    const u = S.cfg.usage;
    return `<section><h1>${esc(T.usage)}</h1><div class="lead">${esc(T.usageLead)}</div>
      <div class="box">${row(T.showUsage, T.showUsageS, sw('usage.show', u.show))}</div>
      <div class="box">${row(T.gH5, '', sw('usage.h5', u.h5, !u.show))}${row(T.gWeek, '', sw('usage.week', u.week, !u.show))}${row(T.gCodex, '', sw('usage.codex', u.codex, !u.show))}</div></section>`;
  }
  function behave() {
    const c = S.cfg, n = c.notify;
    return `<section><h1>${esc(T.behave)}</h1><div class="lead">${esc(T.behaveLead)}</div>
      <div class="box">${row(T.followOpen, T.followOpenS, sw('follow.open', c.follow.open))}${row(T.followClose, '', sw('follow.close', c.follow.close))}</div>
      <div class="box">${row(T.keep, T.keepS, seg('keepDone', T.keepO, c.keepDone))}${row(T.waitDone, T.waitDoneS, seg('waitDone', T.waitO, c.waitDone))}</div>
      <div class="box">${row(T.nDone, '', sw('notify.done', n.done))}${row(T.nApprove, '', sw('notify.approval', n.approval))}${row(T.nQuota, T.nQuotaS, sw('notify.quota', n.quota))}
        ${row(T.nAt, '', seg('notify.quotaAt', { 70: '70%', 80: '80%', 90: '90%' }, n.quotaAt))}
        <div class="row"><div class="l"></div><button class="btn" id="test">${esc(T.test)}</button></div></div></section>`;
  }
  function privacy() {
    return `<section><h1>${esc(T.privacy)}</h1><div class="lead">${esc(T.privacyLead)}</div>
      <div class="box">${row(T.priv, T.privS, sw('privacy', S.cfg.privacy))}</div><div class="note">${esc(T.privNote)}</div></section>`;
  }
  function keys() {
    const k = S.cfg.keys, ok = S.keysOk || {};
    return `<section><h1>${esc(T.keys)}</h1><div class="lead">${esc(T.keysLead)}</div><div class="box">
      ${Object.keys(T.keyNames).map((name) => row(T.keyNames[name], ok[name] === false ? T.taken : '', `<button class="key${recording === name ? ' rec' : ''}${ok[name] === false ? ' bad' : ''}" data-key="${name}">${esc(recording === name ? T.press : k[name])}</button>`)).join('')}
      </div></section>`;
  }

  function draw() {
    T = S.lang === 'en' ? EN : ZH;
    document.documentElement.lang = S.lang === 'en' ? 'en' : 'zh-CN';
    const nav = document.getElementById('nav');
    nav.innerHTML = `<div class="logo"><i></i>Agent Wallpaper</div>${Object.entries(T.nav).map(([id, l]) => `<button data-tab="${id}" class="${tab === id ? 'on' : ''}">${esc(l)}</button>`).join('')}<div class="ver">${esc(T.version(S.version))}<br>github.com/HarryXin0919/agent-wallpaper</div>`;
    const main = document.getElementById('main'), top = main.scrollTop;
    main.innerHTML = { ai: sources, look, usage, behave, privacy, keys }[tab]();
    main.scrollTop = top;
  }
  // what a click on a control changes: "a.b.c" with a value → { a: { b: { c: value } } }; custom folders are a list
  function patchFor(path, v) {
    const parts = path.split('.');
    if (parts[0] === 'custom') { const list = S.cfg.custom.map((x) => ({ ...x })); list[+parts[1]][parts[2]] = v; return { custom: list }; }
    const out = {}; let o = out;
    parts.forEach((p, i) => { if (i === parts.length - 1) o[p] = v; else o = o[p] = {}; });
    return out;
  }
  const num = (path, v) => (/^(maxTasks|keepDone|waitDone|notify\.quotaAt)$/.test(path) ? Number(v) : v);
  const getAt = (path) => path.split('.').reduce((o, p) => (o == null ? o : o[p]), S.cfg);

  document.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.tab) { tab = b.dataset.tab; msg = ''; recording = null; draw(); return; }
    if (b.dataset.set) return set(patchFor(b.dataset.set, num(b.dataset.set, b.dataset.v)));
    if (b.dataset.tog) return set(patchFor(b.dataset.tog, !getAt(b.dataset.tog)));
    if (b.dataset.del) { const list = S.cfg.custom.filter((_, i) => i !== +b.dataset.del); return set({ custom: list }); }
    if (b.dataset.key) { recording = recording === b.dataset.key ? null : b.dataset.key; draw(); return; }
    if (b.id === 'test') return window.cfg.testNotify();
    if (b.id === 'add') {
      const r = await window.cfg.pickFolder(); if (!r) return;
      if (!r.kind) { msg = T.notLogs; draw(); return; }
      msg = '';
      const n = S.cfg.custom.length + 1, used = new Set([S.cfg.sources.claude.color, S.cfg.sources.codex.color, S.cfg.sources.cursor.color, ...S.cfg.custom.map((x) => x.color)]);
      const color = COLORS.find((c) => !used.has(c)) || COLORS[n % COLORS.length];
      const name = (r.kind === 'claude' ? 'Claude Code' : 'Codex') + (/wsl/i.test(r.path) ? ' (WSL)' : ` ${n + 1}`);
      return set({ custom: [...S.cfg.custom, { id: 'c' + Date.now().toString(36).slice(-5), name, kind: r.kind, path: r.path, color, on: true }] });
    }
  });
  document.addEventListener('input', (e) => { if (e.target.id === 'scale') document.getElementById('scaleV').textContent = e.target.value + '%'; });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'scale') return set({ scale: Number(e.target.value) / 100 });
    if (e.target.dataset.name != null) { const list = S.cfg.custom.map((x) => ({ ...x })); list[+e.target.dataset.name].name = e.target.value.trim() || list[+e.target.dataset.name].name; return set({ custom: list }); }
  });
  // recording a shortcut: modifiers plus one key, in Electron's accelerator form
  document.addEventListener('keydown', (e) => {
    if (!recording) return;
    e.preventDefault();
    if (e.key === 'Escape') { recording = null; draw(); return; }
    if (/^(Control|Shift|Alt|Meta)$/.test(e.key)) return;
    const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super'].filter(Boolean);
    if (!mods.length) return;
    const key = e.code.startsWith('Key') ? e.code.slice(3) : e.code.startsWith('Digit') ? e.code.slice(5) : /^F\d+$/.test(e.code) ? e.code : e.key.length === 1 ? e.key.toUpperCase() : e.code;
    const name = recording; recording = null;
    set({ keys: { [name]: [...mods, key].join('+') } });
  });
  window.cfg.get().then((s) => { S = s; draw(); });
})();
