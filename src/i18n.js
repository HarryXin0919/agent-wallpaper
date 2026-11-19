// Interface text in Chinese and English. The logs are turned into Chinese action labels (parse.mjs, codex.mjs,
// cursor.mjs); op() turns those into English when English is chosen. Works in the page and in the main process.
(function (root) {
  let lang = 'zh';
  const Z = {
    thinking: (d) => `正在思考 · ${d}`, running: '正在运行：', approve: (op) => `等你批准：${op}`, approveAny: '等你批准',
    doneDecide: '做完了，等你决定', doneReply: '做完了，等你回复', waitAnswer: '等你回答', waitReply: '等你回复',
    retry: '连不上服务器，正在重试', errors: (n) => `可能卡住了 · 最近 ${n} 步出错`, idle: (d) => `${d}没有动静`,
    interrupted: '被你中断', done: '已完成',
    thinkNow: '正在思考', thought: '思考', waitingYou: '在等你', needsLook: '需要你看一眼', run: '运行', sub: '子代理',
    needsApproval: '等你批准', error: '出错', inProgress: '进行中', finished: '完成',
    subOps: (n, d) => `子代理 · ${n} 个操作 · ${d || '进行中'}`, thoughtFor: (d) => `思考 ${d}`,
    taskTok: (t) => `本任务 ${t} tokens`, laneTok: (t) => `${t} tokens`, openIn: (n) => `在 ${n} 中打开 ›`, clear: '清除',
    step: (n) => `第 ${n} 步`, allSteps: '全部步骤', allDone: '已完成', noSteps: '还没有列出步骤', steps: '步', stages: ['了解情况', '动手修改', '运行检查'], stageOf: (i, n) => `阶段 ${i}/${n}`, inferred: '按操作推断', earlier: (n) => `之前 ${n} 个操作`,
    task: '任务',
    usage: 'AI 用量', h5: '5 小时', week: '本周', about: '约', left: (p) => `剩 ${p}%`, used: (p) => `已用 ${p}%`,
    estNote: (a) => `Claude 为估算值，上次实测在 ${a}`, estOld: (a) => `Claude 为估算值，上次实测在 ${a} · 点一下任务栏右下角的 Claude 图标可校准`,
    appNote: (a) => `Claude 额度来自桌面端 ${a}的记录`, noQuota: '暂时拿不到 Claude 额度',
    todayTok: (n) => `${n} 今日 tokens`, apiToday: '今日折合 API 价', live: '实时用量', perMin: '/分', week7: '近 7 天',
    resetMin: (n) => `${n} 分钟后重置`, resetH: (n) => `${n} 小时后重置`, resetD: (n) => `${n} 天后重置`,
    justNow: '刚刚', minAgo: (n) => `${n} 分钟前`, hAgo: (n) => `${n} 小时前`, dAgo: (n) => `${n} 天前`,
    s: (n) => `${n} 秒`, ms: (m, s) => `${m} 分 ${s} 秒`, m: (m) => `${m} 分钟`, hm: (h, m) => `${h} 小时 ${m} 分`,
    // privacy mode: what kind of action, without names
    pk: { read: '读取文件', search: '搜索', edit: '修改文件', write: '写入文件', run: '运行命令', web: '上网', agent: '子代理', ask: '提问', other: '调用工具', plan: '更新任务清单' },
    // tray, notifications
    hide: '隐藏壁纸', show: '显示壁纸', settings: '设置…', clearDone: '清除已完成的会话', restore: '恢复已清除的会话',
    pause: '暂停', resume: '继续', hideText: '隐藏文字', showText: '显示文字', place: (n) => `看不到画面？换一种显示方式（现在：${n}）`, quit: '退出',
    tipHidden: 'Agent Wallpaper（已隐藏，单击显示）', tipPaused: 'Agent Wallpaper（已暂停）', tipOn: 'Agent Wallpaper（单击隐藏）',
    upCheck: '检查更新', upChecking: '正在检查更新…', upDownloading: (v, p) => `正在下载 ${v}（${p}%）`, upInstall: (v) => `重启并更新到 ${v}`, upGet: (v) => `下载新版本 ${v}`,
    upLatestTitle: '已是最新版本', upLatest: (v) => `当前版本 ${v} 就是最新的。`, upAvailTitle: (v) => `Agent Wallpaper ${v} 已发布`, upAvail: '点击打开下载页面。',
    upReadyTitle: (v) => `新版本 ${v} 已下载`, upReady: '退出时会自动安装；点击立即重启并更新。', upErrTitle: '检查更新失败', upErr: '暂时连不上 GitHub，稍后会再试。',
    nDone: (n) => `${n} 的任务完成了`, nApprove: (n) => `${n} 在等你批准`, nQuota: (n, l, p) => `${n} ${l}额度已用 ${p}%`, nQuotaTitle: '额度提醒',
    places: ['方式一', '方式二', '方式三'],
  };
  const E = {
    thinking: (d) => `Thinking · ${d}`, running: 'Running: ', approve: (op) => `Needs your approval: ${op}`, approveAny: 'Needs your approval',
    doneDecide: 'Done — your call', doneReply: 'Done — waiting for your reply', waitAnswer: 'Waiting for your answer', waitReply: 'Waiting for your reply',
    retry: "Can't reach the server, retrying", errors: (n) => `May be stuck · last ${n} steps failed`, idle: (d) => `No activity for ${d}`,
    interrupted: 'Interrupted', done: 'Done',
    thinkNow: 'Thinking', thought: 'Thought', waitingYou: 'Waiting for you', needsLook: 'Needs a look', run: 'Run', sub: 'Subagent',
    needsApproval: 'Needs approval', error: 'Error', inProgress: 'running', finished: 'done',
    subOps: (n, d) => `Subagent · ${n} actions · ${d || 'running'}`, thoughtFor: (d) => `Thought ${d}`,
    taskTok: (t) => `${t} tokens this task`, laneTok: (t) => `${t} tokens`, openIn: (n) => `Open in ${n} ›`, clear: 'Clear',
    step: (n) => `Step ${n}`, allSteps: 'All steps', allDone: 'done', noSteps: 'No steps listed yet', steps: 'steps', stages: ['Looking around', 'Changing files', 'Running checks'], stageOf: (i, n) => `Stage ${i}/${n}`, inferred: 'inferred from actions', earlier: (n) => `${n} earlier actions`,
    task: 'Task',
    usage: 'AI usage', h5: '5-hour', week: 'Week', about: '~', left: (p) => `${p}% left`, used: (p) => `${p}% used`,
    estNote: (a) => `Claude figures are estimates; last measured ${a}`, estOld: (a) => `Claude figures are estimates; last measured ${a} · click the Claude tray icon to recalibrate`,
    appNote: (a) => `Claude quota from the desktop app, recorded ${a}`, noQuota: 'Claude quota unavailable',
    todayTok: (n) => `${n} tokens today`, apiToday: 'API-price equivalent today', live: 'Live', perMin: '/min', week7: 'Last 7 days',
    resetMin: (n) => `resets in ${n} min`, resetH: (n) => `resets in ${n} h`, resetD: (n) => `resets in ${n} d`,
    justNow: 'just now', minAgo: (n) => `${n} min ago`, hAgo: (n) => `${n} h ago`, dAgo: (n) => `${n} d ago`,
    s: (n) => `${n} s`, ms: (m, s) => `${m} min ${s} s`, m: (m) => `${m} min`, hm: (h, m) => `${h} h ${m} min`,
    pk: { read: 'Read a file', search: 'Search', edit: 'Edit a file', write: 'Write a file', run: 'Run a command', web: 'Web', agent: 'Subagent', ask: 'Question', other: 'Tool call', plan: 'Update the task list' },
    hide: 'Hide wallpaper', show: 'Show wallpaper', settings: 'Settings…', clearDone: 'Clear finished tasks', restore: 'Restore cleared tasks',
    pause: 'Pause', resume: 'Resume', hideText: 'Hide text', showText: 'Show text', place: (n) => `Can't see it? Try another placement (now: ${n})`, quit: 'Quit',
    tipHidden: 'Agent Wallpaper (hidden, click to show)', tipPaused: 'Agent Wallpaper (paused)', tipOn: 'Agent Wallpaper (click to hide)',
    upCheck: 'Check for updates', upChecking: 'Checking for updates…', upDownloading: (v, p) => `Downloading ${v} (${p}%)`, upInstall: (v) => `Restart to update to ${v}`, upGet: (v) => `Download version ${v}`,
    upLatestTitle: 'Up to date', upLatest: (v) => `Version ${v} is the latest.`, upAvailTitle: (v) => `Agent Wallpaper ${v} is out`, upAvail: 'Click to open the download page.',
    upReadyTitle: (v) => `Version ${v} is downloaded`, upReady: 'It installs when the program quits; click to restart and update now.', upErrTitle: 'Could not check for updates', upErr: 'GitHub cannot be reached right now; it will try again later.',
    nDone: (n) => `${n} finished a task`, nApprove: (n) => `${n} needs your approval`, nQuota: (n, l, p) => `${n} ${l} quota: ${p}% used`, nQuotaTitle: 'Quota alert',
    places: ['Placement 1', 'Placement 2', 'Placement 3'],
  };
  // action labels from the log readers, Chinese → English (longest prefixes first)
  const OPS = [
    ['运行：给正在运行的命令输入', 'Run: input to a running command'], ['把计划交给你确认', 'Plan for your approval'], ['给另一个会话发消息', 'Message another session'],
    ['在网页里运行脚本', 'Run a script in the page'], ['更新任务清单', 'Update the task list'], ['等子代理做完', 'Wait for subagents'], ['给子代理发消息', 'Message a subagent'],
    ['连不上服务器，重试中', "Can't reach the server, retrying"], ['做完了，等你回复', 'Done — waiting for your reply'], ['等你回复', 'Waiting for your reply'], ['等你批准', 'Needs your approval'],
    ['派出子代理：', 'Subagent: '], ['浏览器打开 ', 'Browser: open '], ['等你决定：', 'Your call: '], ['等你回答：', 'Waiting for your answer: '],
    ['上网搜索“', 'Web search "'], ['操作电脑：', 'Computer: '], ['开新会话：', 'New session: '], ['查看子代理', 'Check subagents'], ['查看图片 ', 'View image '],
    ['查看文件夹', 'List a folder'], ['上网查资料', 'Look it up online'], ['读网页内容', 'Read the page'], ['浏览器截图', 'Browser screenshot'], ['操作网页', 'Use a web page'],
    ['查找文件 ', 'Find files '], ['打开网页 ', 'Open '], ['使用技能 ', 'Skill: '], ['定时任务：', 'Scheduled: '], ['一段脚本', 'A script'], ['脚本 → ', 'Script → '],
    ['发布页面', 'Publish a page'], ['页面：', 'Page: '], ['加载工具', 'Load tools'], ['收尾总结', 'Wrap up'], ['运行脚本', 'Run a script'], ['问你：', 'Asks you: '],
    ['运行：', 'Run: '], ['搜索：', 'Search: '], ['搜索“', 'Search "'], ['读取 ', 'Read '], ['修改 ', 'Edit '], ['写入 ', 'Write '], ['运行 ', 'Run '], ['调用 ', 'Call '],
    ['思考', 'Thought'], ['退出码 ', 'exit code '], ['没改成', 'not applied'], ['出错', 'error'],
  ];
  function op(s) {
    s = String(s == null ? '' : s);
    if (lang !== 'en') return s;
    for (const [z, e] of OPS) if (s.startsWith(z)) { s = e + s.slice(z.length); break; }
    return s.replace(/” 等 (\d+) 个文件$|”$/, (m, n) => (n ? `" (${n} files)` : '"')).replace(/ 等 (\d+) 个文件$/, ' ($1 files)')
      .replace(/^最近 (\d+) 步出错$/, 'Last $1 steps failed').replace(/没有动静$/, ' without activity');
  }
  const T = () => (lang === 'en' ? E : Z);
  function dur(ms) {
    const t = T(), s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return t.s(s);
    const m = Math.floor(s / 60);
    if (m < 60) return m < 10 && s % 60 ? t.ms(m, s % 60) : t.m(m);
    return t.hm(Math.floor(m / 60), m % 60);
  }
  function tok(n) {
    n = n || 0;
    if (lang === 'en') { if (n < 1e3) return String(Math.round(n)); if (n < 1e6) return (n / 1e3).toFixed(n < 1e4 ? 1 : 0) + 'K'; if (n < 1e9) return (n / 1e6).toFixed(n < 1e7 ? 1 : 0) + 'M'; return (n / 1e9).toFixed(2) + 'B'; }
    if (n < 1e4) return String(Math.round(n)); if (n < 1e8) return (n / 1e4).toFixed(n < 1e5 ? 1 : 0) + ' 万'; return (n / 1e8).toFixed(2) + ' 亿';
  }
  const ago = (ms) => { const t = T(); return ms < 90e3 ? t.justNow : ms < 3600e3 ? t.minAgo(Math.round(ms / 60e3)) : ms < 48 * 3600e3 ? t.hAgo(Math.round(ms / 3600e3)) : t.dAgo(Math.round(ms / 86400e3)); };
  const reset = (s) => { const t = T(); return s == null ? '' : s < 3600 ? t.resetMin(Math.max(1, Math.round(s / 60))) : s < 86400 ? t.resetH(Math.round(s / 3600)) : t.resetD(Math.round(s / 86400)); };
  // "auto" follows the system language: Chinese for zh-*, English otherwise
  const pick = (want, locale) => (want === 'zh' || want === 'en' ? want : /^zh/i.test(locale || '') ? 'zh' : 'en');
  root.I18N = { set: (l) => { lang = l === 'en' ? 'en' : 'zh'; }, get lang() { return lang; }, get t() { return T(); }, op, dur, tok, ago, reset, pick };
})(typeof window !== 'undefined' ? window : globalThis);
