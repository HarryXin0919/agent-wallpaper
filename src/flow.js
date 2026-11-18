// Flowchart view: the task list's steps are frames laid out left to right; inside the current step every
// action is a small card linked by arrows. Uses Scene.stateOf for the live state. No dependencies.
(function (root) {
  const TAU = Math.PI * 2;
  const FONT = '"Segoe UI Variable Text","Segoe UI","Microsoft YaHei UI",sans-serif';
  const C = {
    text: [228, 224, 216], dim: [150, 156, 166], line: [236, 229, 216], card: '#171b21', cardLive: '#1c2129',
    edit: [222, 122, 88], web: [128, 168, 204], sub: [140, 196, 182], wait: [228, 184, 96], err: [206, 140, 156], think: [176, 192, 220], green: [150, 196, 150],
  };
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a))})`;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dur = (ms) => {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return `${s} 秒`;
    const m = Math.floor(s / 60);
    if (m < 60) return m < 10 && s % 60 ? `${m} 分 ${s % 60} 秒` : `${m} 分钟`;
    return `${Math.floor(m / 60)} 小时 ${m % 60} 分`;
  };
  const strip = (s) => String(s || '').replace(/<\/?[a-zA-Z_][^>]*>/g, '\n').replace(/[*`#>]/g, '').split('\n').map((l) => l.trim())
    .find((l) => l && !/^(Task|Background) \(from the session/.test(l) && !/[:：]$/.test(l)) || '';

  // --- model: steps (from the task list) and the actions inside each --------------------------
  const SKIP = /^(更新任务清单|加载工具|收尾总结)$/;
  function kindOf(e) {
    if (e.k === 'think') return 'think';
    if (e.kind === 'edit') return /^写入/.test(e.op) ? 'write' : 'edit';
    if (e.kind === 'web') return 'web';
    if (e.kind === 'agent') return 'agent';
    if (e.kind === 'ask' || e.kind === 'session') return 'ask';
    if (e.kind === 'search') return 'search';
    if (e.kind === 'read') return 'read';
    return 'run';
  }
  function model(task, now) {
    const ev = task.ev.filter((e) => e.t <= now);
    const st = root.Scene.stateOf(task, now);
    const planEv = ev.filter((e) => e.plan && e.plan.length);
    const plan = planEv.length ? planEv[planEv.length - 1].plan : null;
    const steps = plan ? plan.map((p, i) => ({ i, title: p.active || p.text, status: p.status, ops: [], t0: null, t1: null })) : [];
    const pre = { i: -1, title: '开始', status: 'completed', ops: [], t0: task.t0 };
    const tail = { i: steps.length, title: '收尾', status: 'in_progress', ops: [] };
    let cur = pre;
    let lastThink = null, thinkAcc = 0;
    const add = (step, op) => { step.ops.push(op); if (step.t0 == null) step.t0 = op.t; step.t1 = Math.max(step.t1 || 0, op.tEnd || op.t); };
    for (const e of ev) {
      if (e.plan && e.plan.length) {
        const k = e.plan.findIndex((p) => p.status === 'in_progress');
        if (k >= 0 && steps[k]) cur = steps[k];
        else if (e.plan.every((p) => p.status === 'completed')) cur = tail;
        lastThink = null;
        continue;
      }
      if (e.k === 'think') { thinkAcc += e.dur || 0; continue; } // shown as a tag on the next card
      if (e.k === 'say') { cur.say = e.text; cur.sayT = e.t; continue; }
      if (e.k !== 'tool' || !e.op || SKIP.test(e.op)) continue;
      lastThink = null;
      const op = { kind: kindOf(e), t: e.t, tEnd: e.tEnd && e.tEnd <= now ? e.tEnd : null, err: e.err && e.tEnd <= now, title: e.op, e, step: cur, thought: thinkAcc };
      thinkAcc = 0;
      if (e.kind === 'agent') op.sub = (e.sub || []).filter((x) => x.t <= now && (x.k === 'tool' || (x.k === 'think' && x.dur > 300))).map((x) => ({ kind: kindOf(x), t: x.t, title: x.k === 'think' ? '思考' : (x.op || x.target || ''), dur: x.dur, done: !!x.tEnd }));
      add(cur, op);
    }
    // what is happening right now becomes the last card of the current step
    const live = st.kind !== 'done';
    const all = [pre, ...steps, tail];
    const active = cur;
    if (st.kind === 'think') active.ops.push({ kind: 'think', t: st.since, live: true, dur: now - st.since, step: active, thought: thinkAcc });
    else if (st.kind === 'work' || (st.kind === 'wait' && st.why === 'approve') || st.kind === 'stuck') {
      const op = active.ops.find((o) => o.e === st.tool);
      if (op) { op.live = true; op.wait = st.kind === 'wait'; op.stuck = st.kind === 'stuck'; }
      else if (st.kind === 'stuck') active.ops.push({ kind: 'stuck', t: st.since, live: true, step: active, title: st.why === 'retry' ? '连不上服务器，重试中' : st.why === 'errors' ? `最近 ${st.n} 步出错` : `${dur(now - st.since)}没有动静` });
    } else if (st.kind === 'wait') {
      const t = st.tool;
      active.ops.push({ kind: 'ask', t: st.since, live: true, wait: true, step: active, title: t && t.kind === 'wrap' ? (t.target ? `等你决定：${t.target}` : '做完了，等你回复') : t && t.target ? `等你回答：${t.target}` : '等你回复' });
    }
    return { task, st, live, steps: all.filter((s) => s.ops.length || (s !== pre && s !== tail)), active, plan, now, title: /^(Task|Background) \(from the session/.test(task.prompt || '') && task.title ? task.title : strip(task.prompt) || task.title || '' };
  }

  // --- drawing helpers -----------------------------------------------------------------------
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function fit(ctx, s, size, maxW, weight) {
    ctx.font = `${weight || 400} ${size}px ${FONT}`;
    s = String(s || '').replace(/\s+/g, ' ').trim();
    if (ctx.measureText(s).width <= maxW) return s;
    while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s + '…';
  }
  function txt(ctx, s, x, y, size, color, a, maxW, weight, align) {
    const t = fit(ctx, s, size, maxW, weight);
    ctx.fillStyle = rgba(color, a); ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle'; ctx.fillText(t, x, y);
    return ctx.measureText(t).width;
  }
  // small line icons, drawn at (x, y) center, size ~14
  function icon(ctx, kind, x, y, color, a) {
    ctx.save(); ctx.translate(x, y); ctx.strokeStyle = rgba(color, a); ctx.fillStyle = rgba(color, a); ctx.lineWidth = 1.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    switch (kind) {
      case 'read': ctx.moveTo(-4, -6); ctx.lineTo(2, -6); ctx.lineTo(5, -3); ctx.lineTo(5, 6); ctx.lineTo(-4, 6); ctx.closePath(); ctx.moveTo(-1.5, 0); ctx.lineTo(2.5, 0); ctx.moveTo(-1.5, 3); ctx.lineTo(2.5, 3); break;
      case 'write': ctx.moveTo(-4, -6); ctx.lineTo(2, -6); ctx.lineTo(5, -3); ctx.lineTo(5, 6); ctx.lineTo(-4, 6); ctx.closePath(); ctx.moveTo(0.5, -1); ctx.lineTo(0.5, 4); ctx.moveTo(-2, 1.5); ctx.lineTo(3, 1.5); break;
      case 'edit': ctx.moveTo(-5, 5); ctx.lineTo(-4.4, 2); ctx.lineTo(3, -5.4); ctx.lineTo(5.4, -3); ctx.lineTo(-2, 4.4); ctx.closePath(); ctx.moveTo(1.2, -3.6); ctx.lineTo(3.6, -1.2); break;
      case 'run': ctx.moveTo(-5, -3.5); ctx.lineTo(-1.5, 0); ctx.lineTo(-5, 3.5); ctx.moveTo(0.5, 4); ctx.lineTo(5, 4); break;
      case 'search': ctx.arc(-1, -1, 4, 0, TAU); ctx.moveTo(2, 2); ctx.lineTo(5.5, 5.5); break;
      case 'web': ctx.arc(0, 0, 5.5, 0, TAU); ctx.moveTo(-5.5, 0); ctx.lineTo(5.5, 0); ctx.moveTo(0, -5.5); ctx.bezierCurveTo(-3, -2, -3, 2, 0, 5.5); ctx.moveTo(0, -5.5); ctx.bezierCurveTo(3, -2, 3, 2, 0, 5.5); break;
      case 'agent': ctx.arc(-3.5, -3.5, 2, 0, TAU); ctx.moveTo(5.5, 0); ctx.arc(3.5, 0, 2, 0, TAU); ctx.moveTo(-1.5, 3.5); ctx.arc(-3.5, 3.5, 2, 0, TAU); ctx.moveTo(-1.6, -2.6); ctx.lineTo(1.6, -0.8); ctx.moveTo(-1.6, 2.6); ctx.lineTo(1.6, 0.8); break;
      case 'ask': ctx.moveTo(-5, -4); ctx.lineTo(5, -4); ctx.lineTo(5, 3); ctx.lineTo(0, 3); ctx.lineTo(-3, 6); ctx.lineTo(-3, 3); ctx.lineTo(-5, 3); ctx.closePath(); break;
      case 'stuck': ctx.arc(0, 0, 5, 0, TAU); ctx.moveTo(0, -2.5); ctx.lineTo(0, 0.8); ctx.moveTo(0, 3); ctx.lineTo(0, 3.2); break;
      case 'think': ctx.stroke(); ctx.beginPath(); for (const dx of [-4, 0, 4]) { ctx.moveTo(dx + 1.3, 0); ctx.arc(dx, 0, 1.3, 0, TAU); } ctx.fill(); ctx.restore(); return;
      case 'start': ctx.arc(0, 0, 5, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 1.8, 0, TAU); ctx.fill(); ctx.restore(); return;
    }
    ctx.stroke(); ctx.restore();
  }
  const tint = (k) => ({ edit: C.edit, write: C.edit, web: C.web, agent: C.sub, ask: C.wait, stuck: C.err, think: C.think }[k] || C.dim);
  function arrow(ctx, x1, y1, x2, y2, a, color, flow, T) {
    const mx = (x1 + x2) / 2;
    ctx.strokeStyle = rgba(color || C.dim, a); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x1, y1);
    if (Math.abs(y2 - y1) < 1) ctx.lineTo(x2 - 4, y2); else ctx.bezierCurveTo(mx, y1, mx, y2, x2 - 4, y2);
    ctx.stroke();
    ctx.fillStyle = rgba(color || C.dim, a);
    ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - 6, y2 - 3.5); ctx.lineTo(x2 - 6, y2 + 3.5); ctx.closePath(); ctx.fill();
    if (flow) { // a bead travelling along the live connector
      const u = (T / 1400) % 1, v = 1 - u;
      const px = Math.abs(y2 - y1) < 1 ? x1 + (x2 - x1) * u : v * v * v * x1 + 3 * v * v * u * mx + 3 * v * u * u * mx + u * u * u * x2;
      const py = Math.abs(y2 - y1) < 1 ? y1 : v * v * v * y1 + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u * u * u * y2;
      ctx.fillStyle = rgba(C.line, 0.85 * Math.sin(u * Math.PI)); ctx.beginPath(); ctx.arc(px, py, 2.2, 0, TAU); ctx.fill();
    }
  }

  // --- one card ------------------------------------------------------------------------------
  const CW = 178, CH = 50;
  function card(ctx, op, x, y, now, T, words, A) {
    const k = op.kind, col = op.err ? C.err : op.wait ? C.wait : op.stuck ? C.err : tint(k);
    const live = !!op.live;
    if (live) { // soft halo
      const g = ctx.createRadialGradient(x + CW / 2, y + CH / 2, 10, x + CW / 2, y + CH / 2, CW * 0.75);
      const b = 0.5 + 0.5 * Math.sin(T / (op.wait ? 900 : 520));
      g.addColorStop(0, rgba(op.wait ? C.wait : C.line, (op.wait ? 0.14 : 0.08) + 0.06 * b)); g.addColorStop(1, rgba(C.line, 0));
      ctx.fillStyle = g; ctx.fillRect(x - CW * 0.4, y - CH, CW * 1.8, CH * 3);
    }
    ctx.fillStyle = live ? C.cardLive : C.card; rr(ctx, x, y, CW, CH, 10); ctx.fill();
    ctx.lineWidth = live ? 1.3 : 1;
    ctx.strokeStyle = live ? rgba(op.wait ? C.wait : C.line, (0.45 + 0.25 * Math.sin(T / 520)) * A) : op.err ? rgba(C.err, 0.5 * A) : rgba(C.line, 0.09 * A);
    rr(ctx, x, y, CW, CH, 10); ctx.stroke();
    // icon chip
    ctx.fillStyle = rgba(col, 0.13 * A); rr(ctx, x + 10, y + 13, 24, 24, 7); ctx.fill();
    icon(ctx, k === 'think' && live ? 'think' : k, x + 22, y + 25, col, (live ? 1 : 0.85) * A);
    if (live && k === 'think') { // three dots breathing
      for (let i = 0; i < 3; i++) { ctx.fillStyle = rgba(C.think, (0.35 + 0.6 * Math.max(0, Math.sin(T / 300 - i * 0.7))) * A); ctx.beginPath(); ctx.arc(x + 18 + i * 4, y + 25, 1.4, 0, TAU); ctx.fill(); }
    }
    if (op.thought > 1500 && k !== 'think') { // how long it thought before this step
      const label = words ? `思考 ${dur(op.thought)}` : '';
      ctx.font = `500 10px ${FONT}`;
      const tw2 = words ? ctx.measureText(label).width : 0;
      ctx.fillStyle = '#12161b'; rr(ctx, x + 12, y - 8, tw2 + 22, 16, 8); ctx.fill();
      ctx.strokeStyle = rgba(C.think, 0.35 * A); ctx.lineWidth = 1; rr(ctx, x + 12, y - 8, tw2 + 22, 16, 8); ctx.stroke();
      for (let i = 0; i < 3; i++) { ctx.fillStyle = rgba(C.think, 0.8 * A); ctx.beginPath(); ctx.arc(x + 19 + i * 3.2, y, 1, 0, TAU); ctx.fill(); }
      if (words) txt(ctx, label, x + 29, y + 0.5, 10, C.think, 0.85 * A, 120, 500);
    }
    if (!words) return;
    let title = op.title, detail = '';
    if (k === 'think') { title = live ? '正在思考' : '思考'; detail = dur(op.dur || 0); }
    else {
      const e = op.e || {};
      const spent = (op.tEnd || now) - op.t;
      if (op.wait && !op.kind.match(/ask/)) detail = '等你批准';
      else if (op.err) detail = '出错';
      else if (live) detail = `进行中 · ${dur(now - op.t)}`;
      else if (e.plus != null) detail = '';
      else if (spent > 1500) detail = dur(spent);
      else detail = '完成';
      if (op.sub) detail = live || !e.subDone ? `${op.sub.length} 个操作 · 进行中` : `${op.sub.length} 个操作 · ${dur((e.subEnd || now) - op.t)}`;
    }
    const tx = x + 42, tw = CW - 50;
    const vt = String(title).replace(/^(运行：|派出子代理：)/, '');
    txt(ctx, vt, tx, y + 18, 12.5, C.text, (live ? 0.95 : 0.78) * A, tw, live ? 600 : 500);
    const verb = /^运行：/.test(title) ? '运行' : /^派出子代理/.test(title) ? '子代理' : '';
    let dx = tx;
    if (verb) dx += txt(ctx, verb + (detail ? ' · ' : ''), dx, y + 35, 11, col, 0.75 * A, 60) ;
    if (op.e && op.e.plus != null && !live && !op.err) {
      dx += txt(ctx, `+${op.e.plus}`, dx, y + 35, 11, C.green, 0.8 * A, 50, 600);
      if (op.e.minus) dx += txt(ctx, ` −${op.e.minus}`, dx, y + 35, 11, C.edit, 0.8 * A, 50, 600);
    }
    if (detail) txt(ctx, detail, dx + (op.e && op.e.plus != null && !live ? 6 : 0), y + 35, 11, op.wait ? C.wait : op.err ? C.err : C.dim, (live ? 0.85 : 0.6) * A, tw - (dx - tx));
  }

  // --- the whole flow in a box ----------------------------------------------------------------
  // Steps before the current one fold into short summary cards; the current one shows its cards in rows;
  // the ones still to come are faint dashed outlines. The view keeps the current step in sight.
  function draw(ctx, task, now, box, opts) {
    opts = opts || {};
    const words = opts.text !== false, T = opts.anim || now, A = opts.alpha == null ? 1 : opts.alpha;
    const m = model(task, now);
    const st = m.st;
    const fadeA = st.kind === 'done' ? A * clamp(1 - Math.max(0, now - st.since - 3600e3) / (11 * 3600e3), 0.25, 1) : A;
    const COLS = Math.max(2, Math.min(4, Math.floor((box.w * 0.62 - 32) / (CW + 30)))), GX = 30, GY = 22, PAD = 18, HEAD = 58;
    const MAXCARDS = COLS * 4;
    // measure every block first
    const steps = [];
    const activeIdx = m.steps.indexOf(m.active);
    m.steps.forEach((s, i) => {
      const isCur = s === m.active && st.kind !== 'done' || (st.kind === 'done' && i === m.steps.length - 1);
      if (isCur) {
        const shown = s.ops.slice(-MAXCARDS), hidden = s.ops.length - shown.length;
        const rows = Math.max(1, Math.ceil(shown.length / COLS));
        const sub = shown.find((o) => o.sub && o.sub.length);
        steps.push({ type: 'cur', s, shown, hidden, rows, w: PAD * 2 + COLS * CW + (COLS - 1) * GX, h: HEAD + rows * CH + (rows - 1) * GY + PAD + 6 + (hidden ? 22 : 0), sub });
      } else if (i < activeIdx || s.status === 'completed' || (st.kind === 'done')) steps.push({ type: 'done', s, w: 214, h: 104 });
      else steps.push({ type: 'todo', s, w: 176, h: 64 });
    });
    if (st.kind === 'done') steps.push({ type: 'end', w: 150, h: 64 });
    const GAP = 54;
    const cur = steps.find((b) => b.type === 'cur') || steps[steps.length - 1];
    // zoom so the current step fills a good part of the screen
    const hasNext = steps.indexOf(cur) < steps.length - 1, hasPrev = steps.indexOf(cur) > 0;
    const needW = 196 + (hasPrev ? 150 + GAP : 0) + GAP + cur.w + (hasNext ? GAP + 176 : 0) + 40; // request + folded past + current + next
    const sc = clamp(Math.min((box.h * 0.66) / (cur.h + (cur.sub ? 110 : 0)), box.w / needW, 1.35), 0.6, 1.35);
    const LW = box.w / sc, LH = box.h / sc;
    // the request stays pinned on the left; older finished steps fold into one chip until everything fits
    const startB = { type: 'start', w: 196, h: 104 };
    const width = (bs) => bs.reduce((a, b) => a + b.w, 0) + GAP * (bs.length - 1);
    let blocks = [startB, ...steps];
    const ci = steps.indexOf(cur);
    let fold = 0;
    while (width(blocks) > LW - 20 && fold < ci) {
      fold++;
      const folded = steps.slice(0, fold);
      const f = { type: 'fold', n: folded.length, ops: folded.reduce((a, b) => a + (b.s ? b.s.ops.length : 0), 0), first: folded[0].s ? folded[0].s.i : 0, last: folded[folded.length - 1].s ? folded[folded.length - 1].s.i : 0, w: 150, h: 64 };
      blocks = [startB, f, ...steps.slice(fold)];
    }
    // drop upcoming steps that do not fit, keeping the next one
    while (width(blocks) > LW - 20 && blocks[blocks.length - 1] !== cur && blocks[blocks.length - 2] !== cur) blocks.pop();
    const total = width(blocks);
    let x = Math.max(10, (LW - total) / 2);
    if (total > LW - 20) x = Math.min(10, LW - 30 - total);
    for (const b of blocks) { b.x = x; x += b.w + GAP; }
    const cy = LH / 2 - (cur.sub ? 55 : 0);
    for (const b of blocks) b.y = cy - b.h / 2;

    ctx.save();
    ctx.translate(box.x, box.y); ctx.scale(sc, sc);
    ctx.beginPath(); ctx.rect(-10, -10, LW + 20, LH + 20); ctx.clip();
    // arrows between blocks
    for (let i = 1; i < blocks.length; i++) {
      const a = blocks[i - 1], b = blocks[i];
      const live = b === cur && st.kind !== 'done';
      arrow(ctx, a.x + a.w, cy, b.x, cy, (b.type === 'todo' ? 0.18 : 0.45) * fadeA, null, live, T);
    }
    for (const b of blocks) {
      if (b.type === 'start') {
        ctx.fillStyle = C.card; rr(ctx, b.x, b.y, b.w, b.h, 14); ctx.fill();
        ctx.strokeStyle = rgba(C.line, 0.22 * fadeA); ctx.lineWidth = 1; rr(ctx, b.x, b.y, b.w, b.h, 14); ctx.stroke();
        icon(ctx, 'start', b.x + 22, b.y + 24, C.line, 0.9 * fadeA);
        if (words) {
          txt(ctx, '你的要求', b.x + 36, b.y + 24, 11, C.dim, 0.7 * fadeA, 120);
          wrap(ctx, m.title, b.x + 16, b.y + 50, 13.5, C.text, 0.9 * fadeA, b.w - 30, 2, 600);
        }
      } else if (b.type === 'done' || b.type === 'end') {
        const s = b.s;
        ctx.fillStyle = 'rgba(255,255,255,0.025)'; rr(ctx, b.x, b.y, b.w, b.h, 14); ctx.fill();
        ctx.strokeStyle = rgba(C.line, 0.12 * fadeA); ctx.lineWidth = 1; rr(ctx, b.x, b.y, b.w, b.h, 14); ctx.stroke();
        // check mark
        ctx.strokeStyle = rgba(C.green, 0.85 * fadeA); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(b.x + 15, b.y + 23); ctx.lineTo(b.x + 19, b.y + 27); ctx.lineTo(b.x + 26, b.y + 19); ctx.stroke();
        if (words) {
          if (b.type === 'end') { txt(ctx, st.why === 'interrupted' ? '被你中断' : '完成', b.x + 34, b.y + 23, 13, C.text, 0.85 * fadeA, 100, 600); txt(ctx, `用时 ${dur(st.since - task.t0)}`, b.x + 16, b.y + 46, 11, C.dim, 0.7 * fadeA, b.w - 24); }
          else {
            txt(ctx, s.i >= 0 && s.i < (m.plan || []).length ? `第 ${s.i + 1} 步` : s.title, b.x + 34, b.y + 23, 11, C.dim, 0.75 * fadeA, 120);
            if (s.i >= 0 && s.i < (m.plan || []).length) wrap(ctx, s.title, b.x + 16, b.y + 46, 12.5, C.text, 0.8 * fadeA, b.w - 28, 2, 500);
            const edits = s.ops.filter((o) => o.kind === 'edit' || o.kind === 'write').length;
            const spent = s.t0 && s.t1 ? ` · ${dur(s.t1 - s.t0)}` : '';
            const nOps = s.ops.filter((o) => o.kind !== 'think').length;
            txt(ctx, nOps ? `${nOps} 个操作${edits ? ` · 改 ${edits} 处` : ''}${spent}` : '和上一步一起完成', b.x + 16, b.y + 86, 11, C.dim, 0.6 * fadeA, b.w - 28);
          }
        }
      } else if (b.type === 'fold') {
        ctx.fillStyle = 'rgba(255,255,255,0.02)'; rr(ctx, b.x, b.y, b.w, b.h, 12); ctx.fill();
        ctx.strokeStyle = rgba(C.line, 0.1 * fadeA); ctx.lineWidth = 1; rr(ctx, b.x, b.y, b.w, b.h, 12); ctx.stroke();
        ctx.strokeStyle = rgba(C.green, 0.7 * fadeA); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(b.x + 14, b.y + 22); ctx.lineTo(b.x + 18, b.y + 26); ctx.lineTo(b.x + 25, b.y + 18); ctx.stroke();
        if (words) {
          const range = b.first < 0 ? (b.last < 0 ? '开始' : `开始 – 第 ${b.last + 1} 步`) : b.first === b.last ? `第 ${b.first + 1} 步` : `第 ${b.first + 1}–${b.last + 1} 步`;
          txt(ctx, range, b.x + 32, b.y + 22, 11.5, C.text, 0.7 * fadeA, b.w - 40, 600);
          txt(ctx, `共 ${b.ops} 个操作`, b.x + 14, b.y + 45, 11, C.dim, 0.55 * fadeA, b.w - 24);
        }
      } else if (b.type === 'todo') {
        ctx.setLineDash([4, 4]); ctx.strokeStyle = rgba(C.line, 0.16 * fadeA); ctx.lineWidth = 1; rr(ctx, b.x, b.y, b.w, b.h, 12); ctx.stroke(); ctx.setLineDash([]);
        if (words) { txt(ctx, `第 ${b.s.i + 1} 步`, b.x + 14, b.y + 18, 10.5, C.dim, 0.45 * fadeA, 80); txt(ctx, b.s.title, b.x + 14, b.y + 38, 12, C.text, 0.4 * fadeA, b.w - 26); }
      } else if (b.type === 'cur') {
        const s = b.s, live = st.kind !== 'done';
        ctx.fillStyle = 'rgba(255,255,255,0.03)'; rr(ctx, b.x, b.y, b.w, b.h, 16); ctx.fill();
        ctx.strokeStyle = rgba(st.kind === 'wait' ? C.wait : C.line, (live ? 0.3 : 0.14) * fadeA); ctx.lineWidth = 1.2; rr(ctx, b.x, b.y, b.w, b.h, 16); ctx.stroke();
        // header: step, title, progress, time in this step
        if (words) {
          const n = (m.plan || []).length, done = (m.plan || []).filter((p) => p.status === 'completed').length;
          const head = s.i >= 0 && s.i < n ? `第 ${s.i + 1} 步` : s.title;
          const w1 = txt(ctx, head, b.x + PAD, b.y + 22, 11.5, live ? C.line : C.dim, 0.8 * fadeA, 120, 600);
          if (n) txt(ctx, `${done}/${n}`, b.x + b.w - PAD, b.y + 22, 11.5, C.dim, 0.75 * fadeA, 60, 600, 'right');
          if (s.i >= 0 && s.i < n) txt(ctx, s.title, b.x + PAD + w1 + 10, b.y + 22, 14, C.text, 0.9 * fadeA, b.w - PAD * 2 - w1 - 70, 600);
          if (s.say && live) txt(ctx, '“' + strip(s.say) + '”', b.x + PAD, b.y + 43, 11.5, C.dim, 0.65 * fadeA, b.w - PAD * 2);
        }
        if (m.plan && m.plan.length) { // thin progress line under the header
          const n = m.plan.length, segW = (b.w - PAD * 2 - (n - 1) * 3) / n;
          m.plan.forEach((p, i) => { ctx.fillStyle = rgba(p.status === 'completed' ? C.green : p.status === 'in_progress' ? C.line : C.dim, (p.status === 'pending' ? 0.15 : p.status === 'in_progress' ? 0.45 + 0.3 * Math.sin(T / 650) : 0.6) * fadeA); rr(ctx, b.x + PAD + i * (segW + 3), b.y + 52, segW, 2.5, 1.2); ctx.fill(); });
        }
        if (b.hidden && words) txt(ctx, `之前还有 ${b.hidden} 个操作`, b.x + PAD, b.y + HEAD + 4, 11, C.dim, 0.5 * fadeA, 200);
        const top = b.y + HEAD + 8 + (b.hidden ? 22 : 0);
        const pos = b.shown.map((op, i) => { const r = Math.floor(i / COLS), c = i % COLS; return { op, x: b.x + PAD + c * (CW + GX), y: top + r * (CH + GY) }; });
        // arrows between cards (row by row, with a wrap curve at the end of each row)
        for (let i = 1; i < pos.length; i++) {
          const p = pos[i - 1], q = pos[i];
          const a = 0.32 * fadeA, live2 = q.op.live;
          if (q.y === p.y) arrow(ctx, p.x + CW, p.y + CH / 2, q.x, q.y + CH / 2, a, null, live2, T);
          else { // wrap: down from the last card, then left along the gap, into the next row's first card
            ctx.strokeStyle = rgba(C.dim, a); ctx.lineWidth = 1.2; ctx.beginPath();
            const gy = p.y + CH + GY / 2;
            ctx.moveTo(p.x + CW / 2, p.y + CH); ctx.quadraticCurveTo(p.x + CW / 2, gy, p.x + CW / 2 - 12, gy); ctx.lineTo(q.x - 10, gy);
            ctx.quadraticCurveTo(q.x - 16, gy, q.x - 16, gy + 8); ctx.lineTo(q.x - 16, q.y + CH / 2 - 8); ctx.quadraticCurveTo(q.x - 16, q.y + CH / 2, q.x - 6, q.y + CH / 2); ctx.stroke();
            ctx.fillStyle = rgba(C.dim, a); ctx.beginPath(); ctx.moveTo(q.x, q.y + CH / 2); ctx.lineTo(q.x - 6, q.y + CH / 2 - 3.5); ctx.lineTo(q.x - 6, q.y + CH / 2 + 3.5); ctx.closePath(); ctx.fill();
          }
        }
        for (const p of pos) card(ctx, p.op, p.x, p.y, now, T, words, fadeA);
        // a subagent: its own dashed frame under the step, with its actions as small chips
        const sp = pos.find((p) => p.op.sub && p.op.sub.length);
        if (sp) {
          const op = sp.op, chips = op.sub.slice(-8);
          const fx = b.x + PAD, fy = b.y + b.h + 34, fw = b.w - PAD * 2, fh = 70;
          ctx.setLineDash([5, 4]); ctx.strokeStyle = rgba(C.sub, 0.45 * fadeA); ctx.lineWidth = 1; rr(ctx, fx, fy, fw, fh, 12); ctx.stroke(); ctx.setLineDash([]);
          ctx.strokeStyle = rgba(C.sub, 0.5 * fadeA); ctx.beginPath(); ctx.moveTo(sp.x + 26, sp.y + CH); ctx.bezierCurveTo(sp.x + 26, fy - 10, sp.x + 26, fy - 10, sp.x + 26, fy); ctx.stroke();
          if (words) txt(ctx, `子代理 · ${String(op.title).replace(/^派出子代理：/, '')}`, fx + 14, fy + 16, 11, C.sub, 0.85 * fadeA, fw - 28, 600);
          let cx = fx + 14;
          chips.forEach((c, i) => {
            const label = fit(ctx, c.title.replace(/^运行：/, ''), 11, 120);
            ctx.font = `400 11px ${FONT}`;
            const w = Math.min(150, (words ? ctx.measureText(label).width : 0) + 30);
            if (cx + w > fx + fw - 10) return;
            const last = i === chips.length - 1 && !(op.e && op.e.subDone);
            ctx.fillStyle = rgba(C.sub, (last ? 0.16 : 0.08) * fadeA); rr(ctx, cx, fy + 32, w, 24, 8); ctx.fill();
            if (last) { ctx.strokeStyle = rgba(C.sub, (0.5 + 0.3 * Math.sin(T / 500)) * fadeA); rr(ctx, cx, fy + 32, w, 24, 8); ctx.stroke(); }
            icon(ctx, c.kind, cx + 13, fy + 44, C.sub, 0.9 * fadeA);
            if (words) txt(ctx, label, cx + 24, fy + 44, 11, C.text, 0.7 * fadeA, w - 28);
            cx += w + 8;
          });
        }
      }
    }
    ctx.restore();
    return { st, model: m };
  }
  function wrap(ctx, s, x, y, size, color, a, maxW, lines, weight) {
    ctx.font = `${weight || 400} ${size}px ${FONT}`;
    const out = []; let cur = '';
    for (const ch of String(s || '').replace(/\s+/g, ' ')) {
      if (ctx.measureText(cur + ch).width > maxW && cur) { out.push(cur); cur = ''; if (out.length === lines) break; }
      cur += ch;
    }
    if (out.length < lines && cur) out.push(cur); else if (cur && out.length === lines) out[lines - 1] = out[lines - 1].replace(/.$/, '…');
    ctx.fillStyle = rgba(color, a); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    out.forEach((l, i) => ctx.fillText(l, x, y + i * size * 1.4));
  }
  // workflow-canvas background: deep ink with a faint dot grid
  function canvasBg(ctx, w, h) {
    const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#0f1216'); g.addColorStop(1, '#141820');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.055)';
    for (let y = 12; y < h; y += 24) for (let x = 12; x < w; x += 24) ctx.fillRect(x, y, 1.2, 1.2);
    const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, w, h);
  }
  root.Flow = { model, draw, canvasBg };
})(typeof window !== 'undefined' ? window : globalThis);
