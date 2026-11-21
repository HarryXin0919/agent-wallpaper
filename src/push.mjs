// Phone push, off unless the person turns it on and enters an address. An alert ("Claude needs your approval") is
// sent to that address and nowhere else. Three services are recognised by their address; anything else gets a
// plain JSON POST:
//   Bark (iOS)            https://api.day.app/<key>            GET  <address>/<title>/<body>
//   ntfy                  https://ntfy.sh/<topic>              POST <origin>/  {"topic", "title", "message"}
//   WeCom group robot     https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=…   POST {"msgtype":"text","text":{"content"}}
//   other                 any http(s) address                  POST {"title", "message"}
// The address usually holds a secret key, so it is never written to a log.

export function kindOf(address) {
  let u; try { u = new URL(address); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  if (u.hostname === 'api.day.app' || /(^|\.)bark\./i.test(u.hostname)) return 'bark';
  if (u.hostname === 'qyapi.weixin.qq.com') return 'wecom';
  if (/(^|\.)ntfy\./i.test(u.hostname)) return 'ntfy';
  return 'json';
}

// the request for one alert: { url, init } for fetch, or null when the address is not usable
export function request(address, title, body) {
  const kind = kindOf(address);
  if (!kind) return null;
  const u = new URL(address), json = (o) => ({ method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(o) });
  if (kind === 'bark') {
    const base = u.origin + u.pathname.replace(/\/+$/, '');
    return { kind, url: `${base}/${encodeURIComponent(title)}/${encodeURIComponent(body || ' ')}?group=AgentWallpaper`, init: { method: 'GET' } };
  }
  if (kind === 'ntfy') {
    const topic = decodeURIComponent(u.pathname.replace(/^\/+|\/+$/g, ''));
    if (!topic || topic.includes('/')) return null;
    return { kind, url: u.origin + '/', init: json({ topic, title, message: body || title }) };
  }
  if (kind === 'wecom') return { kind, url: u.href, init: json({ msgtype: 'text', text: { content: body ? `${title}\n${body}` : title } }) };
  return { kind, url: u.href, init: json({ title, message: body || '' }) };
}

// sends one alert; `net` is anything with a fetch (Electron's net, so the system's proxy is used). Never throws.
export async function sendPush(net, address, title, body) {
  const r = request(address, title, body);
  if (!r) return { ok: false, status: 'address' };
  try {
    const res = await net.fetch(r.url, { ...r.init, signal: AbortSignal.timeout(10000) });
    return { ok: res.ok, status: res.status, kind: r.kind };
  } catch (e) { return { ok: false, status: e && e.name === 'TimeoutError' ? 'timeout' : 'network', kind: r.kind }; }
}
