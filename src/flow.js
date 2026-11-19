// A task's actions grouped under the steps of its plan, with the live action added for what it is doing now
// (thinking, running, waiting). The panels draw this model. Uses Scene.stateOf for the live state.
(function (root) {
  const dur = (ms) => {
    if (root.I18N) return root.I18N.dur(ms);
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
      else if (st.kind === 'wait') active.ops.push({ kind: 'ask', t: st.since, live: true, wait: true, step: active, title: '等你批准' }); // hook-reported, the step is not in the log yet
      else if (st.kind === 'stuck') active.ops.push({ kind: 'stuck', t: st.since, live: true, step: active, title: st.why === 'retry' ? '连不上服务器，重试中' : st.why === 'errors' ? `最近 ${st.n} 步出错` : `${dur(now - st.since)}没有动静` });
    } else if (st.kind === 'wait') {
      const t = st.tool;
      active.ops.push({ kind: 'ask', t: st.since, live: true, wait: true, step: active, title: t && t.kind === 'wrap' ? (t.target ? `等你决定：${t.target}` : '做完了，等你回复') : t && t.target ? `等你回答：${t.target}` : '等你回复' });
    }
    return { task, st, live, steps: all.filter((s) => s.ops.length || (s !== pre && s !== tail)), active, plan, now, title: /^(Task|Background) \(from the session/.test(task.prompt || '') && task.title ? task.title : strip(task.prompt) || task.title || '' };
  }

  // --- drawing helpers -----------------------------------------------------------------------

  root.Flow = { model };
})(typeof window !== 'undefined' ? window : globalThis);
