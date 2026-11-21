// The settings window. Every change is saved and applied to the wallpaper at once.
(function () {
  const ZH = {
    nav: { ai: 'AI 来源', look: '显示', usage: '用量', behave: '行为与提醒', privacy: '隐私', keys: '快捷键' },
    ai: 'AI 来源', aiLead: '壁纸读取这些 AI 在本机写下的会话记录。每个来源有自己的颜色，面板顶边和名称标签用这个颜色。',
    found: '已找到', notFound: '没有找到', today: (n) => `今天 ${n} 个会话`, exp: '实验', custom: '自定义文件夹',
    addFolder: '添加文件夹', addHint: '另一个 Claude Code 或 Codex 的记录位置，比如 WSL 里的，或第二个账号的',
    notLogs: '这个文件夹里没有找到 Claude Code（projects）或 Codex（sessions）的记录。请对照下面的指南检查所选的文件夹。',
    guide: '怎么添加？', guideHide: '收起指南',
    guideLead: 'Claude Code、Codex、Gemini CLI、DeepSeek Harness 和 Cursor 的默认记录位置会自动读取，无需添加。只有记录存放在其他位置时才需要手动添加，例如装在 WSL 里，或通过环境变量改过存放位置。目前可以添加的是 Claude Code 和 Codex 的记录。',
    steps: (mac) => [
      ['确定记录所在的文件夹', 'Claude Code 的记录在 .claude 文件夹中（内含 projects 子文件夹），Codex 的记录在 .codex 文件夹中（内含 sessions 子文件夹）。常见位置：', true],
      ['点击上方的“添加文件夹”，选中该文件夹', mac
        ? '在选择窗口中按 ⌘⇧G 可直接输入路径。以“.”开头的文件夹默认隐藏，按 ⌘⇧. 即可显示。选 .claude、.codex 本身，或其中的 projects、sessions 均可。'
        : '可以在选择窗口顶部的地址栏直接输入路径，按回车进入。选 .claude、.codex 本身，或其中的 projects、sessions 均可。'],
      ['确认识别结果', '添加后列表中会新增一项，并标明是 Claude Code 还是 Codex。显示“已找到”和今天的会话数，即表示读取正常。若提示没有找到记录，通常是选错了层级，请改选上一级或下一级文件夹。'],
      ['按需调整', '点击名称可以重命名，右侧可以更换颜色或暂时关闭，点击 × 删除。删除只是不再读取，不会改动该文件夹中的任何文件。'],
    ],
    places: (mac) => [
      ...(mac ? [] : [['WSL 中的 Claude Code', '\\\\wsl$\\Ubuntu\\home\\用户名\\.claude'], ['WSL 中的 Codex', '\\\\wsl$\\Ubuntu\\home\\用户名\\.codex']]),
      ['改过位置的 Claude Code', '环境变量 CLAUDE_CONFIG_DIR 指向的文件夹'],
      ['改过位置的 Codex', '环境变量 CODEX_HOME 指向的文件夹'],
      ['从其他电脑复制或同步来的记录', '复制过来的 .claude 或 .codex 文件夹'],
    ],
    wslNote: '其中 Ubuntu 换成你的 WSL 发行版名称，用户名换成 WSL 中的用户名。读取时 WSL 需要处于运行状态。',
    cursorNote: 'Cursor 的记录里没有可靠的时间，操作按壁纸第一次看到它们的时间排列。TRAE 的对话记录是加密的，无法读取，所以不支持。',
    look: '显示', lookLead: '改动会立即出现在壁纸上。',
    lang: '语言', langS: '界面文字的语言', auto: '跟随系统',
    font: '字体', fontS: '每种语言可以分别选字体，各自只管自己的文字；没有选的用系统字体。', fontDefault: '默认（系统字体）', fontImported: '已导入', fontPicks: '常用', fontAll: '全部已安装',
    slot: { latin: '英文和数字', cjk: '中文', ja: '日文假名', ko: '韩文' }, slotS: { ja: '日文里的汉字跟随中文字体' }, fontMore: '更多语言', fontLess: '收起',
    fontAdd: '导入字体…', fontFiles: '已导入的字体', fontFilesS: '已复制到本程序的设置文件夹，原文件可以移动或删除。点 × 移除。',
    fontSample: 'Dark mode 深色模式 · 72%', fontSample2: '正在运行：npm test · 15 分钟', fontSample3: 'かな · カタカナ · 한국어',
    fontErr: { kind: '这个文件不是可用的字体。支持 .ttf、.otf、.woff 和 .woff2。', size: '字体文件超过 60 MB，无法导入。', read: '读取或保存字体文件失败。' },
    pos: '位置', posS: '“自动”会避开桌面图标', posO: { auto: '自动', left: '左', center: '中', right: '右' },
    size: '大小', sizeS: '面板整体缩放',
    dash: '仪表盘屏幕', dashS: '这块屏幕不避让桌面图标，面板放大铺满，适合闲置的副屏', dashNone: '不用',
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
    exactNote: '会修改 Claude Code 的设置文件',
    exact: '准确识别“等你批准”', exactS: '在 Claude Code 的设置（~/.claude/settings.json）里加一个通知钩子：Claude 弹出权限提示时，记一行到 ~/.claude/agent-wallpaper/events.jsonl。不打开时，按“步骤超过 8 秒、命令超过 40 秒没结果”推断。关掉时会删掉这个钩子。',
    nDone: '任务完成时通知', nApprove: '等你批准时通知', nQuota: '额度快用完时通知', nQuotaS: '每个额度周期只提醒一次',
    pushSend: '发送验证码', pushVerify: '验证', pushSentMsg: '验证码已发出。请看手机，把收到的 4 位数字填在右边。', pushBad: '验证码不对，或已超过 10 分钟，请重新发送。',
    pushVerified: '地址已验证', pushNeed: '填写地址并通过验证后，才能打开推送', pushHow: '怎么设置？', pushHide: '收起指南',
    pushSteps: [
      ['在手机上装一个接收提醒的应用', 'iPhone 用 Bark；安卓或其他系统用 ntfy；想发到群里，用企业微信的群机器人。三种任选一种。'],
      ['拿到推送地址', 'Bark：打开应用，复制首页显示的地址，形如 https://api.day.app/一串密钥。ntfy：在应用里订阅一个自己起的、别人猜不到的主题名，地址就是 https://ntfy.sh/主题名。企业微信：群设置 → 添加群机器人，复制它的 Webhook 地址。'],
      ['把地址粘贴到上面的“推送地址”，点“发送验证码”', '程序会向这个地址发一个 4 位数字。'],
      ['在手机上看到验证码，填回这里，点“验证”', '对上之后，推送自动打开。以后改了地址，需要重新验证。'],
    ],
    push: '推送到手机', pushS: '有任务等你批准时，把提醒发到你填写的地址。支持 Bark（iOS）、ntfy 和企业微信群机器人，其他地址按通用的 JSON 方式发送。提醒只发往这个地址。',
    pushUrl: '推送地址', pushUrlS: 'Bark：https://api.day.app/你的密钥；ntfy：https://ntfy.sh/你的主题；企业微信：群机器人的 Webhook 地址。地址里通常带有密钥，只保存在本机的设置文件里。',
    pushDetail: '包含任务标题', pushDetailS: '关闭时只发送“Claude 在等你批准”这样的一句话，不带任何任务内容',
    pushDone: '任务完成时也推送', pushTest: '发送测试推送', pushOk: '已发出，请看手机', pushFail: (s) => ({ address: '地址不可用，请检查', timeout: '连接超时', network: '连不上这个地址' }[s] || `对方返回了错误（${s}）`),
    nAt: '提醒线', test: '发送测试通知',
    upd: '自动检查更新', updS: '每 6 小时到 GitHub 查一次新版本。安装版会在后台下载，退出时自动安装；免安装版和 macOS 版只提醒你去下载。',
    updNow: '立即检查', updInstall: (v) => `重启并更新到 ${v}`, updGet: (v) => `下载 ${v}`,
    updSt: { source: '从源码运行时不检查更新', idle: '', checking: '正在检查…', latest: '已是最新版本', error: '检查失败，稍后会再试', available: (v) => `新版本 ${v} 已发布`, downloading: (v, p) => `正在下载 ${v}（${p}%）`, ready: (v) => `${v} 已下载，退出时安装` },
    privacy: '隐私', privacyLead: '投屏、录屏或别人能看到你的屏幕时使用。',
    priv: '隐私模式', privS: '只显示会话标题和操作类型（读取文件、运行命令……），不显示你的提问原文、文件名、命令和回复内容',
    privNote: '只想临时隐藏所有文字时，用“隐藏文字”快捷键。',
    keys: '快捷键', keysLead: '点一下右边的按键，再按下新的组合键。按 Esc 取消。', taken: '这个组合键已被其他程序占用',
    keyNames: { peek: '全屏查看', jump: '打开等你的任务', show: '显示 / 隐藏壁纸', pause: '暂停 / 继续', text: '隐藏 / 显示文字', settings: '打开设置', quit: '退出' },
    press: '请按下组合键…', version: (v) => `版本 ${v}`,
  };
  const EN = {
    nav: { ai: 'AI sources', look: 'Display', usage: 'Usage', behave: 'Behavior & alerts', privacy: 'Privacy', keys: 'Shortcuts' },
    ai: 'AI sources', aiLead: 'The wallpaper reads the session logs these assistants keep on this computer. Each source has its own color, used for the top edge of its panels and its name tag.',
    found: 'Found', notFound: 'Not found', today: (n) => `${n} session${n === 1 ? "" : "s"} today`, exp: 'Experimental', custom: 'Custom folder',
    addFolder: 'Add a folder', addHint: 'Another Claude Code or Codex log location, such as one inside WSL or a second account',
    notLogs: 'No Claude Code (projects) or Codex (sessions) logs were found in this folder. Check the folder against the guide below.',
    guide: 'How to add one', guideHide: 'Hide the guide',
    guideLead: 'The usual log locations of Claude Code, Codex, Gemini CLI, DeepSeek Harness and Cursor are read automatically and need no adding. Add a folder only when logs are kept somewhere else, for example inside WSL, or moved with an environment variable. Claude Code and Codex logs can be added.',
    steps: (mac) => [
      ['Find the folder with the logs', 'Claude Code keeps its logs in a .claude folder (with a projects folder inside); Codex in a .codex folder (with a sessions folder inside). Common places:', true],
      ['Click "Add a folder" above and choose it', mac
        ? 'In the dialog, press ⌘⇧G to type a path. Folders starting with "." are hidden; press ⌘⇧. to show them. Choosing .claude or .codex itself, or the projects or sessions folder inside, both work.'
        : 'You can type a path into the address bar at the top of the dialog and press Enter. Choosing .claude or .codex itself, or the projects or sessions folder inside, both work.'],
      ['Check what was found', 'A new entry appears in the list, marked Claude Code or Codex. "Found" with today\'s session count means it is being read. If no logs were found, a folder one level up or down is usually the right one.'],
      ['Adjust as you like', 'Click the name to rename it; on the right, change its color, turn it off for now, or remove it with ×. Removing only stops reading it; nothing in that folder is changed.'],
    ],
    places: (mac) => [
      ...(mac ? [] : [['Claude Code inside WSL', '\\\\wsl$\\Ubuntu\\home\\username\\.claude'], ['Codex inside WSL', '\\\\wsl$\\Ubuntu\\home\\username\\.codex']]),
      ['Claude Code in a moved location', 'the folder set by the CLAUDE_CONFIG_DIR environment variable'],
      ['Codex in a moved location', 'the folder set by the CODEX_HOME environment variable'],
      ['Logs copied or synced from another computer', 'the copied .claude or .codex folder'],
    ],
    wslNote: 'Replace Ubuntu with the name of your WSL distribution and username with your user name inside WSL. WSL needs to be running while the wallpaper reads it.',
    cursorNote: "Cursor's records carry no reliable times, so actions are ordered by when the wallpaper first sees them. TRAE encrypts its conversations, so it cannot be supported.",
    look: 'Display', lookLead: 'Changes show on the wallpaper right away.',
    lang: 'Language', langS: 'Language of the on-screen text', auto: 'System',
    font: 'Fonts', fontS: 'Each language can have its own font, which only draws that language; the rest use the system fonts.', fontDefault: 'Default (system font)', fontImported: 'Imported', fontPicks: 'Common', fontAll: 'All installed',
    slot: { latin: 'English and numbers', cjk: 'Chinese', ja: 'Japanese kana', ko: 'Korean' }, slotS: { ja: 'Kanji follow the Chinese font' }, fontMore: 'More languages', fontLess: 'Fewer',
    fontAdd: 'Import a font…', fontFiles: 'Imported fonts', fontFilesS: 'Copied into this program\'s settings folder; the original file can be moved or deleted. × removes one.',
    fontSample: 'Dark mode 深色模式 · 72%', fontSample2: 'Running: npm test · 15 min', fontSample3: 'かな · カタカナ · 한국어',
    fontErr: { kind: 'This file is not a usable font. .ttf, .otf, .woff and .woff2 are supported.', size: 'The font file is over 60 MB and cannot be imported.', read: 'The font file could not be read or saved.' },
    pos: 'Position', posS: '"Auto" keeps clear of desktop icons', posO: { auto: 'Auto', left: 'Left', center: 'Center', right: 'Right' },
    size: 'Size', sizeS: 'Scale of all panels',
    dash: 'Dashboard screen', dashS: 'On this screen the panels fill the whole screen, bigger, without avoiding icons: for a spare screen', dashNone: 'None',
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
    exactNote: 'Changes Claude Code\'s settings file',
    exact: 'Exact "waiting for your approval"', exactS: 'Adds a notification hook to Claude Code\'s settings (~/.claude/settings.json): when Claude shows a permission prompt, one line goes to ~/.claude/agent-wallpaper/events.jsonl. Without it, approval waits are inferred (a step pending over 8 s, a command over 40 s). Turning it off removes the hook.',
    nDone: 'Notify when a task finishes', nApprove: 'Notify when approval is needed', nQuota: 'Notify when a quota runs low', nQuotaS: 'Once per quota period',
    pushSend: 'Send a code', pushVerify: 'Verify', pushSentMsg: 'A code was sent. Look at your phone and enter the 4 digits on the right.', pushBad: 'That code is wrong, or more than 10 minutes old. Send a new one.',
    pushVerified: 'Address verified', pushNeed: 'Enter an address and verify it before push can be turned on', pushHow: 'How to set it up', pushHide: 'Hide the guide',
    pushSteps: [
      ['Install an app that receives the alerts', 'Bark on an iPhone; ntfy on Android or anything else; a WeCom group robot to post into a group. Any one of the three.'],
      ['Get its push address', 'Bark: open the app and copy the address on its first screen, like https://api.day.app/a-long-key. ntfy: subscribe to a topic name of your own that nobody could guess; the address is https://ntfy.sh/that-name. WeCom: group settings → add a group robot, and copy its webhook address.'],
      ['Paste the address into "Push address" above and click "Send a code"', 'The program sends 4 digits to that address.'],
      ['Read the code on your phone, enter it here and click "Verify"', 'When it matches, push turns on. A changed address needs to be verified again.'],
    ],
    push: 'Push to your phone', pushS: 'When a task needs your approval, the alert is sent to the address you enter. Bark (iOS), ntfy and WeCom group robots are recognised; any other address gets a plain JSON POST. The alert goes to this address only.',
    pushUrl: 'Push address', pushUrlS: 'Bark: https://api.day.app/your-key; ntfy: https://ntfy.sh/your-topic; WeCom: the group robot\'s webhook address. The address usually holds a key; it is kept only in the settings file on this computer.',
    pushDetail: 'Include the task title', pushDetailS: 'Off: only a line like "Claude needs your approval" is sent, nothing of the task itself',
    pushDone: 'Also push when a task finishes', pushTest: 'Send a test push', pushOk: 'Sent. Check your phone', pushFail: (s) => ({ address: 'The address is not usable', timeout: 'Timed out', network: 'Could not reach the address' }[s] || `The service answered with an error (${s})`),
    nAt: 'Alert at', test: 'Send a test notification',
    upd: 'Check for updates automatically', updS: 'Looks for a new version on GitHub every 6 hours. The installed build downloads it in the background and installs it when the program quits; the portable and macOS builds only tell you to download it.',
    updNow: 'Check now', updInstall: (v) => `Restart to update to ${v}`, updGet: (v) => `Download ${v}`,
    updSt: { source: 'No update checks when run from source', idle: '', checking: 'Checking…', latest: 'Up to date', error: 'Check failed; it will try again later', available: (v) => `Version ${v} is out`, downloading: (v, p) => `Downloading ${v} (${p}%)`, ready: (v) => `${v} is downloaded and installs on quit` },
    privacy: 'Privacy', privacyLead: 'For screen sharing, recording, or when others can see your screen.',
    priv: 'Privacy mode', privS: 'Shows only session titles and kinds of action (read a file, run a command…): no request text, file names, commands or replies',
    privNote: 'To hide all text for a moment, use the "hide text" shortcut.',
    keys: 'Shortcuts', keysLead: 'Click a shortcut, then press the new key combination. Esc cancels.', taken: 'Another program already uses this combination',
    keyNames: { peek: 'Full view', jump: 'Open the waiting task', show: 'Show / hide the wallpaper', pause: 'Pause / resume', text: 'Hide / show text', settings: 'Open settings', quit: 'Quit' },
    press: 'Press a combination…', version: (v) => `Version ${v}`,
  };
  const COLORS = ['#f4a98c', '#8fc1ff', '#b9a2ff', '#9fe6d2', '#ffd27a', '#ff9fb8'];
  let S = null, tab = 'ai', T = ZH, msg = '', recording = null, guideOpen = false, pushMsg = '', pushSent = false, pushGuide = false;
  const $ = (h) => { const d = document.createElement('div'); d.innerHTML = h.trim(); return d.firstChild; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // an answer from the main process carries the settings and what depends on them; the rest (version, system,
  // update state) stays as it was
  const merge = (r) => { S = Object.assign({}, S, r); };
  async function set(patch) { merge(await window.cfg.set(patch)); draw(); }
  const seg = (path, opts, cur) => `<div class="seg">${(Array.isArray(opts) ? opts : Object.entries(opts)).map(([v, l]) => `<button data-set="${path}" data-v="${esc(v)}" class="${String(cur) === String(v) ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>`;
  const sw = (path, on, dis) => `<button class="sw${on ? ' on' : ''}" data-tog="${path}"${dis ? ' disabled' : ''}></button>`;
  // an explanation, kept behind a small (i) next to its title: shown on hover or keyboard focus
  const info = (text) => (text ? `<button class="info" data-tip="${esc(text)}" aria-label="${esc(text)}"></button>` : '');
  // note: a line that stays visible (for a setting that changes something outside this program)
  const row = (title, sub, ctl, note) => `<div class="row"><div class="l"><b>${esc(title)}${info(sub)}</b>${note ? `<span>${esc(note)}</span>` : ''}</div>${ctl}</div>`;
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
    return `<section><h1>${esc(T.ai)}${info(T.aiLead)}</h1>
      ${one('claude', 'Claude Code')}${one('codex', 'Codex')}${one('gemini', 'Gemini CLI')}${one('deepseek', 'DeepSeek Harness')}${one('cursor', 'Cursor', `<span class="chip">${esc(T.exp)}</span>${info(T.cursorNote)}`)}${customs}
      <div class="addrow"><button class="add" id="add"><b>＋</b><span>${esc(T.addFolder)}</span></button>${info(T.addHint)}</div>
      <div class="msg">${esc(msg)}</div>
      <button class="link" id="guide">${esc(guideOpen ? T.guideHide : T.guide)}</button>${guideOpen ? guide() : ''}</section>`;
  }
  // step-by-step help for adding a folder (opens by itself when a chosen folder had no logs)
  function guide() {
    const mac = S.platform === 'darwin';
    const places = `<table class="places">${T.places(mac).map(([w, p]) => `<tr><td>${esc(w)}</td><td>${/^[\\/~]/.test(p) ? `<code>${esc(p)}</code>` : esc(p)}</td></tr>`).join('')}</table>${mac ? '' : `<div class="s">${esc(T.wslNote)}</div>`}`;
    return `<div class="guide"><p>${esc(T.guideLead)}</p><ol>${T.steps(mac).map(([h, d, withPlaces], i) => `<li><span class="num">${i + 1}</span><div><b>${esc(h)}</b><div class="s">${esc(d)}</div>${withPlaces ? places : ''}</div></li>`).join('')}</ol></div>`;
  }
  // --- fonts, one per language: the default, imported files, common fonts found on this computer, then every
  // installed font that has the language's characters ---
  const PICKS = {
    latin: ['Segoe UI', 'Inter', 'Helvetica Neue', 'Avenir Next', 'SF Pro Text', 'Arial', 'Calibri', 'Verdana', 'Bahnschrift', 'Georgia', 'Cambria', 'Times New Roman', 'Cascadia Code', 'JetBrains Mono', 'Consolas', 'Menlo'],
    cjk: ['Microsoft YaHei UI', 'PingFang SC', 'Source Han Sans SC', 'Noto Sans SC', 'HarmonyOS Sans SC', 'MiSans', 'LXGW WenKai', 'Smiley Sans', 'DengXian', 'KaiTi', 'STKaiti', 'Kaiti SC', 'SimSun', 'Songti SC', 'FangSong', 'Microsoft JhengHei', 'PingFang TC'],
    ja: ['Yu Gothic UI', 'Yu Gothic', 'Meiryo', 'MS Gothic', 'Hiragino Sans', 'Noto Sans JP', 'Source Han Sans JP'],
    ko: ['Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Source Han Sans KR'],
  };
  const PROBE = { cjk: '永国你書', ja: 'あかネノ', ko: '한국어글' }; // characters a font must have to be listed for that language
  const ZHN = { 'Microsoft YaHei UI': '微软雅黑', 'PingFang SC': '苹方', 'PingFang TC': '苹方（繁体）', 'Source Han Sans SC': '思源黑体', 'Noto Sans SC': '思源黑体', 'LXGW WenKai': '霞鹜文楷', 'Smiley Sans': '得意黑',
    DengXian: '等线', KaiTi: '楷体', STKaiti: '华文楷体', 'Kaiti SC': '楷体', SimSun: '宋体', 'Songti SC': '宋体', FangSong: '仿宋', 'Microsoft JhengHei': '微软正黑体' };
  const BASE = "'Segoe UI Variable Text', 'Segoe UI', system-ui, 'Microsoft YaHei UI', 'PingFang SC', sans-serif";
  let picks = null, local = null, localFaces = new Map(), asked = false, pen = null, moreFonts = false;
  const covers = new Map();
  // how a text looks set in a font list; a font that is missing (or lacks those characters) looks like the fallback
  function shape(fonts, text) {
    pen = pen || document.createElement('canvas').getContext('2d');
    pen.font = `72px ${fonts}`;
    const m = pen.measureText(text);
    return [m.width, m.actualBoundingBoxAscent, m.actualBoundingBoxDescent, m.actualBoundingBoxLeft, m.actualBoundingBoxRight].map((x) => Math.round(x * 10)).join(',');
  }
  const differs = (family, text) => ['monospace', 'serif'].some((g) => shape(`"${family}", ${g}`, text) !== shape(g, text));
  const has = (family) => differs(family, 'mmmwwwlli 你好');
  function covered(family, slot) {
    if (!PROBE[slot]) return true;
    const k = slot + '|' + family;
    if (!covers.has(k)) covers.set(k, differs(family, PROBE[slot]));
    return covers.get(k);
  }
  // the full list of installed fonts, where the system lets the page ask for it; each family's faces are kept so
  // the wallpaper can use the real bold and light weights
  async function loadLocal() {
    if (asked || !window.queryLocalFonts) return; asked = true;
    try {
      for (const f of await window.queryLocalFonts()) {
        if (!localFaces.has(f.family)) localFaces.set(f.family, []);
        if (!/italic|oblique/i.test(f.style)) localFaces.get(f.family).push({ n: f.fullName, p: f.postscriptName, s: f.style });
      }
      local = [...localFaces.keys()].sort((a, b) => a.localeCompare(b));
    } catch { local = []; }
    if (tab === 'look') draw();
  }
  function fontSelect(slot) {
    const cur = (S.cfg.font || {})[slot] || 'system';
    const opt = (v, label) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(label)}</option>`;
    const label = (n) => (S.lang !== 'en' && ZHN[n] ? `${ZHN[n]} · ${n}` : n);
    const pick = picks[slot];
    const rest = (local || []).filter((n) => !pick.includes(n) && covered(n, slot));
    const name = cur.startsWith('name:') ? cur.slice(5) : '';
    const extra = name && !pick.includes(name) && !rest.includes(name) ? opt(cur, name) : ''; // chosen earlier, not in a list now
    const imported = (S.fontFiles || []).map((f) => opt('file:' + f.id, f.name)).join('');
    return `<select data-font="${slot}">${opt('system', T.fontDefault)}${imported ? `<optgroup label="${esc(T.fontImported)}">${imported}</optgroup>` : ''}`
      + (pick.length || extra ? `<optgroup label="${esc(T.fontPicks)}">${extra}${pick.map((n) => opt('name:' + n, label(n))).join('')}</optgroup>` : '')
      + (rest.length ? `<optgroup label="${esc(T.fontAll)}">${rest.map((n) => opt('name:' + n, label(n))).join('')}</optgroup>` : '')
      + `<option value="__import">${esc(T.fontAdd)}</option></select>`;
  }
  function fontBox() {
    if (!picks) picks = Object.fromEntries(Object.entries(PICKS).map(([k, list]) => [k, list.filter(has)]));
    loadLocal();
    const f = S.cfg.font || {};
    const more = moreFonts || (f.ja && f.ja !== 'system') || (f.ko && f.ko !== 'system');
    const slots = more ? ['latin', 'cjk', 'ja', 'ko'] : ['latin', 'cjk'];
    const pre = window.FontSlots ? FontSlots.apply(document, S.fontView || [], () => { if (tab === 'look') draw(); }) : '';
    const files = S.fontFiles || [];
    return `<div class="box">
      <div class="row"><div class="l"><b>${esc(T.font)}${info(T.fontS)}</b></div></div>
      ${slots.map((k) => row(T.slot[k], T.slotS[k] || '', fontSelect(k))).join('')}
      ${more && !moreFonts ? '' : `<div class="row"><div class="l"></div><button class="link" id="fontMore">${esc(more ? T.fontLess : T.fontMore)}</button></div>`}
      <div class="sample" style="font-family:${esc(pre)}${BASE}"><b>${esc(T.fontSample)}</b><span>${esc(T.fontSample2)}</span>${more ? `<span class="s3">${esc(T.fontSample3)}</span>` : ''}</div>
      ${files.length ? row(T.fontFiles, T.fontFilesS, `<div class="ctl chips">${files.map((x) => `<button class="btn" data-delfont="${esc(x.id)}">${esc(x.name)} ×</button>`).join('')}</div>`) : ''}
    </div>${msg ? `<div class="msg" style="margin:-6px 0 12px">${esc(msg)}</div>` : ''}`;
  }
  function look() {
    const c = S.cfg;
    const scr = [['primary', T.primary], ['all', T.all]]; // a list: screen ids are numbers and would sort first in an object
    if (S.displays.length > 1) S.displays.forEach((d) => scr.push([d.id, T.screenN(d.label, d.size)]));
    return `<section><h1>${esc(T.look)}${info(T.lookLead)}</h1>
      <div class="box">
        ${row(T.lang, T.langS, seg('lang', { auto: T.auto, zh: '中文', en: 'English' }, c.lang))}
        ${row(T.pos, T.posS, seg('position', T.posO, c.position))}
        ${row(T.size, T.sizeS, `<div style="display:flex;gap:12px;align-items:center"><input type="range" min="80" max="140" step="5" value="${Math.round(c.scale * 100)}" id="scale"><span class="val" id="scaleV">${Math.round(c.scale * 100)}%</span></div>`)}
        ${row(T.screens, T.screensS, seg('screens', scr, c.screens))}
        ${S.displays.length > 1 ? row(T.dash, T.dashS, seg('dashboard', [['none', T.dashNone], ...S.displays.map((d) => [d.id, T.screenN(d.label, d.size)])], c.dashboard)) : ''}
      </div>${fontBox()}<div class="box">
        ${row(T.tasks, T.tasksS, seg('maxTasks', { 1: '1', 2: '2', 3: '3', 4: '4' }, c.maxTasks))}
        ${row(T.glass, T.glassS, seg('glass', T.glassO, c.glass))}
        ${row(T.motion, T.motionS, seg('motion', T.motionO, c.motion))}
      </div></section>`;
  }
  function usage() {
    const u = S.cfg.usage;
    return `<section><h1>${esc(T.usage)}${info(T.usageLead)}</h1>
      <div class="box">${row(T.showUsage, T.showUsageS, sw('usage.show', u.show))}</div>
      <div class="box">${row(T.gH5, '', sw('usage.h5', u.h5, !u.show))}${row(T.gWeek, '', sw('usage.week', u.week, !u.show))}${row(T.gCodex, '', sw('usage.codex', u.codex, !u.show))}</div></section>`;
  }
  // push: the address must be verified (a code sent to it and typed back) before the switch can be turned on
  const pushOk = (c) => !!c.push.url && c.push.verified === c.push.url;
  function pushCheckRow(c) {
    const ok = pushOk(c);
    const left = pushMsg || (ok ? T.pushVerified : pushSent ? T.pushSentMsg : T.pushNeed);
    const right = !ok && pushSent
      ? `<div class="ctl"><input class="text code" id="pushCode" inputmode="numeric" maxlength="4" placeholder="0000" autocomplete="off"><button class="btn" id="pushVerify">${esc(T.pushVerify)}</button><button class="btn" id="pushTest">${esc(T.pushSend)}</button></div>`
      : `<button class="btn" id="pushTest"${c.push.url ? '' : ' disabled'}>${esc(ok ? T.pushTest : T.pushSend)}</button>`;
    return `<div class="row"><div class="l"><span class="${ok && !pushMsg ? 'okline' : ''}">${esc(left)}</span></div>${right}</div>`;
  }
  function behave() {
    const c = S.cfg, n = c.notify;
    return `<section><h1>${esc(T.behave)}${info(T.behaveLead)}</h1>
      <div class="box">${row(T.followOpen, T.followOpenS, sw('follow.open', c.follow.open))}${row(T.followClose, '', sw('follow.close', c.follow.close))}</div>
      <div class="box">${row(T.keep, T.keepS, seg('keepDone', T.keepO, c.keepDone))}${row(T.waitDone, T.waitDoneS, seg('waitDone', T.waitO, c.waitDone))}</div>
      <div class="box">${row(T.exact, T.exactS, sw('exactApproval', c.exactApproval), T.exactNote)}</div>
      <div class="box">${row(T.nDone, '', sw('notify.done', n.done))}${row(T.nApprove, '', sw('notify.approval', n.approval))}${row(T.nQuota, T.nQuotaS, sw('notify.quota', n.quota))}
        ${row(T.nAt, '', seg('notify.quotaAt', { 70: '70%', 80: '80%', 90: '90%' }, n.quotaAt))}
        <div class="row"><div class="l"></div><button class="btn" id="test">${esc(T.test)}</button></div></div>
      <div class="box">${row(T.push, T.pushS, sw('push.on', c.push.on, !pushOk(c)))}
        <div class="row"><div class="l"><b>${esc(T.pushUrl)}${info(T.pushUrlS)}</b></div><input class="text" data-text="push.url" value="${esc(c.push.url)}" placeholder="https://" spellcheck="false" autocomplete="off"></div>
        ${row(T.pushDetail, T.pushDetailS, sw('push.detail', c.push.detail))}${row(T.pushDone, '', sw('push.done', c.push.done))}
        ${pushCheckRow(c)}
        <div class="row"><div class="l"></div><button class="link" id="pushGuide">${esc(pushGuide ? T.pushHide : T.pushHow)}</button></div>
        ${pushGuide ? `<div class="guide in"><ol>${T.pushSteps.map(([h, d], i) => `<li><span class="num">${i + 1}</span><div><b>${esc(h)}</b><div class="s">${esc(d)}</div></div></li>`).join('')}</ol></div>` : ''}</div>
      <div class="box">${row(T.upd, T.updS, sw('updates.check', c.updates.check))}${updRow()}</div></section>`;
  }
  // where the update stands, with the one button that fits
  function updRow() {
    const u = S.update || { status: 'source' }, st = T.updSt[u.status];
    const label = typeof st === 'function' ? st(u.version, u.percent) : st || '';
    const btn = u.status === 'ready' ? `<button class="btn" id="updInstall">${esc(T.updInstall(u.version))}</button>` : u.status === 'available' ? `<button class="btn" id="updGet">${esc(T.updGet(u.version))}</button>` : u.status === 'source' ? '' : `<button class="btn" id="updNow"${['checking', 'downloading'].includes(u.status) ? ' disabled' : ''}>${esc(T.updNow)}</button>`;
    return `<div class="row"><div class="l"><span>${esc(T.version(u.current || S.version))}${label ? ' · ' + esc(label) : ''}</span></div>${btn}</div>`;
  }
  function privacy() {
    return `<section><h1>${esc(T.privacy)}${info(T.privacyLead)}</h1>
      <div class="box">${row(T.priv, T.privS + ' ' + T.privNote, sw('privacy', S.cfg.privacy))}</div></section>`;
  }
  function keys() {
    const k = S.cfg.keys, ok = S.keysOk || {};
    return `<section><h1>${esc(T.keys)}${info(T.keysLead)}</h1><div class="box">
      ${Object.keys(T.keyNames).map((name) => row(T.keyNames[name], ok[name] === false ? T.taken : '', `<button class="key${recording === name ? ' rec' : ''}${ok[name] === false ? ' bad' : ''}" data-key="${name}">${esc(recording === name ? T.press : k[name])}</button>`)).join('')}
      </div></section>`;
  }

  const tip = document.createElement('div'); tip.id = 'tip'; tip.hidden = true; document.body.appendChild(tip);
  function showTip(el) {
    tip.textContent = el.dataset.tip; tip.hidden = false;
    const r = el.getBoundingClientRect(), t = tip.getBoundingClientRect();
    const x = Math.max(12, Math.min(r.left - 12, innerWidth - t.width - 12)), below = r.bottom + 8;
    tip.style.left = x + 'px'; tip.style.top = (below + t.height > innerHeight - 8 ? r.top - t.height - 8 : below) + 'px';
  }
  const tipOf = (e) => (e.target.closest ? e.target.closest('.info') : null);
  document.addEventListener('mouseover', (e) => { const el = tipOf(e); if (el) showTip(el); });
  document.addEventListener('mouseout', (e) => { if (tipOf(e)) tip.hidden = true; });
  document.addEventListener('focusin', (e) => { const el = tipOf(e); if (el && el.matches(':focus-visible')) showTip(el); });
  document.addEventListener('focusout', (e) => { if (tipOf(e)) tip.hidden = true; });
  function draw() {
    tip.hidden = true;
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
    if (b.id === 'pushTest') {
      pushMsg = '…'; draw();
      const r = await window.cfg.testPush(), verified = !!S.cfg.push.url && S.cfg.push.verified === S.cfg.push.url;
      pushSent = r.ok && !verified; pushMsg = r.ok ? (verified ? T.pushOk : '') : T.pushFail(r.status); draw(); return;
    }
    if (b.id === 'pushVerify') {
      const r = await window.cfg.verifyPush((document.getElementById('pushCode') || {}).value || '');
      merge(r); pushMsg = r.verified ? '' : T.pushBad; if (r.verified) pushSent = false; draw(); return;
    }
    if (b.id === 'pushGuide') { pushGuide = !pushGuide; draw(); return; }
    if (b.id === 'fontMore') { moreFonts = !moreFonts; draw(); return; }
    if (b.dataset.delfont) { merge(await window.cfg.removeFont(b.dataset.delfont)); msg = ''; draw(); return; }
    if (b.id === 'updNow') return window.cfg.checkUpdate();
    if (b.id === 'updInstall') return window.cfg.installUpdate();
    if (b.id === 'updGet') return window.cfg.openReleases();
    if (b.id === 'guide') { guideOpen = !guideOpen; draw(); return; }
    if (b.id === 'add') {
      const r = await window.cfg.pickFolder(); if (!r) return;
      if (!r.kind) { msg = T.notLogs; guideOpen = true; draw(); return; }
      msg = '';
      const n = S.cfg.custom.length + 1, used = new Set([S.cfg.sources.claude.color, S.cfg.sources.codex.color, S.cfg.sources.cursor.color, S.cfg.sources.gemini.color, S.cfg.sources.deepseek.color, ...S.cfg.custom.map((x) => x.color)]);
      const color = COLORS.find((c) => !used.has(c)) || COLORS[n % COLORS.length];
      const name = (r.kind === 'claude' ? 'Claude Code' : 'Codex') + (/wsl/i.test(r.path) ? ' (WSL)' : ` ${n + 1}`);
      return set({ custom: [...S.cfg.custom, { id: 'c' + Date.now().toString(36).slice(-5), name, kind: r.kind, path: r.path, color, on: true }] });
    }
  });
  document.addEventListener('input', (e) => { if (e.target.id === 'scale') document.getElementById('scaleV').textContent = e.target.value + '%'; });
  document.addEventListener('change', async (e) => {
    if (e.target.id === 'scale') return set({ scale: Number(e.target.value) / 100 });
    if (e.target.dataset.text) { pushMsg = ''; pushSent = false; return set(patchFor(e.target.dataset.text, e.target.value.trim())); }
    if (e.target.dataset.font) {
      const slot = e.target.dataset.font, v = e.target.value;
      msg = '';
      if (v === '__import') { const r = await window.cfg.importFont(slot); if (r) { merge(r); if (r.fontError) msg = T.fontErr[r.fontError]; } draw(); return; }
      const fam = v.startsWith('name:') ? v.slice(5) : null;
      return set({ font: { [slot]: v }, ...(fam && localFaces.has(fam) ? { fontFaces: { [fam]: localFaces.get(fam) } } : {}) });
    }
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
  window.cfg.onUpdate((u) => { if (!S) return; S.update = u; if (tab === 'behave') draw(); });
  window.cfg.get().then(async (s) => { S = s; S.update = await window.cfg.update(); draw(); });
})();
