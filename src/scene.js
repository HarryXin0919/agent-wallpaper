// What a task is doing right now, worked out from its timeline: thinking, running a step, waiting for you,
// maybe stuck, or done. Used by the panels, the lanes, the small cards and the notifications.
(function (root) {
  function stateOf(task, now) {
    const ev = task.ev.filter((e) => e.t <= now);
    // reported by Claude Code's notification hook (when turned on): a permission prompt is open. Claude Code writes
    // the step it asks about to the log only once you answer, so meanwhile the log shows nothing pending.
    // (a prompt left open over 2 hours: the session was most likely closed with it, like an abandoned task below)
    if (task.exact && task.ask && task.ask <= now && now - task.ask < 2 * 3600e3) return { kind: 'wait', since: task.ask, approval: true, why: 'approve' };
    if (!ev.length) return now - task.t0 > 8 * 60000 ? { kind: 'stuck', since: task.t0, why: 'idle' } : { kind: 'think', since: task.t0 };
    const lastAct = Math.max(task.t0, ...ev.map((e) => Math.max(e.t + (e.dur || 0), e.tEnd && e.tEnd <= now ? e.tEnd : 0)));
    // a turn can stop and later continue (an app event wakes it); only the last stop with nothing after it counts
    let lastStop = -1;
    ev.forEach((e, i) => { if (e.k === 'stop') lastStop = i; });
    const stopped = lastStop >= 0 && ev.slice(lastStop + 1).every((e) => e.k === 'stop' || e.k === 'retry');
    let turnStart = 0, i = lastStop - 1;
    while (i >= 0 && (ev[i].k === 'stop' || ev[i].k === 'retry')) i--; // stops arrive in pairs (end of turn + hook summary)
    for (; i >= 0; i--) if (ev[i].k === 'stop') { turnStart = i + 1; break; }
    const tools = ev.filter((e) => e.k === 'tool');
    if (stopped) {
      const turn = ev.slice(turnStart, lastStop + 1);
      const q = ev[lastStop].interrupted ? null : turn.filter((e) => e.k === 'tool' && ((e.kind === 'wrap' && e.ask) || (e.kind === 'ask' && !(e.tEnd <= now)))).pop();
      return { kind: q ? 'wait' : 'done', since: ev[lastStop].t, tool: q, why: q ? 'answer' : ev[lastStop].interrupted ? 'interrupted' : null };
    }
    if (now - lastAct > 2 * 3600e3) return { kind: 'done', since: lastAct, abandoned: true, why: 'abandoned' };
    const pending = tools.filter((e) => !(e.tEnd <= now) && e.kind !== 'agent');
    const done = tools.filter((e) => e.tEnd && e.tEnd <= now);
    const recent = done.slice(-4);
    const errs = recent.filter((e) => e.err).length;
    const retries = ev.filter((e) => e.k === 'retry' && now - e.t < 120000).length;
    const askP = pending.find((e) => e.kind === 'ask' || e.kind === 'session');
    if (askP) return { kind: 'wait', since: askP.t, tool: askP, why: 'answer' };
    if (retries >= 3) return { kind: 'stuck', since: lastAct, why: 'retry' };
    if (errs >= 2 && done.length && done[done.length - 1].err && !pending.length) return { kind: 'stuck', since: lastAct, why: 'errors', n: errs };
    if (pending.length) {
      const p = pending[pending.length - 1], el = now - p.t;
      // the log itself says this step waits for approval (Gemini CLI)
      if (p.awaiting) return { kind: 'wait', since: p.t, approval: true, tool: p, why: 'approve' };
      // with the hook, a step in the log was already approved (or needed no approval): it is running
      if (task.exact) {
        if (el > 20 * 60000) return { kind: 'stuck', since: p.t, tool: p, why: 'slow' };
        return { kind: 'work', since: p.t, tool: p };
      }
      const slow = p.long || /Claude_Browser__|claude-in-chrome__|computer-use__/.test(p.name || '');
      const limit = p.shell ? 40000 : slow ? 90000 : 8000;
      if (task.mode !== 'bypassPermissions' && !(p.shell && p.long) && el > limit) return { kind: 'wait', since: p.t + limit, approval: true, tool: p, why: 'approve' };
      if (el > 20 * 60000) return { kind: 'stuck', since: p.t, tool: p, why: 'slow' };
      return { kind: 'work', since: p.t, tool: p };
    }
    if (now - lastAct > 8 * 60000) return { kind: 'stuck', since: lastAct, why: 'idle' };
    return { kind: 'think', since: lastAct };
  }

  root.Scene = { stateOf };
})(typeof window !== 'undefined' ? window : globalThis);
