# Agent Wallpaper

**A live desktop wallpaper for Windows that shows what Claude Code and Codex are doing.**

[中文说明](README.zh-CN.md)

![Agent Wallpaper: a Claude Code task and a Codex task in progress, with the usage panel above](docs/screenshot.png)

Agent Wallpaper sits behind your desktop icons and draws each running task as frosted-glass panels: the request, the task's step-by-step plan as a progress bar, and the latest actions it took (files read, edits with lines added and removed, commands run, time spent thinking). Above them, a usage panel shows how much of your Claude and Codex plan quota is left.

It reads the session logs Claude Code and Codex already write on your computer. It never changes them, changes no settings, and the window itself makes no network requests.

> The on-screen text is in Chinese for now. English is planned; contributions are welcome.

## Features

- **Claude Code and Codex side by side.** Claude tasks are marked in coral, Codex tasks in blue. When several tasks run at once, each gets its own lane.
- **Progress you can read at a glance.** The plan the agent keeps (Claude's task list, Codex's plan) becomes a progress bar with the current step and how long it has taken.
- **Every action as a card.** Reads, searches, edits (+/− lines), commands, subagents, web lookups and thinking time, newest last; the running one glows.
- **States:** thinking, running a command, waiting for your approval, maybe stuck, done.
- **Usage panel:** Claude's 5-hour and weekly quota, Codex's quota, tokens used today and a live tokens-per-minute figure.
- **Click a card** to open that session in the Claude or Codex desktop app.
- **Stays out of the way.** Panels go only into the largest empty part of the desktop (icon positions are re-read every 30 seconds). It works over Wallpaper Engine and other live wallpapers, and it pauses when a full-screen window covers the desktop.
- **Follows the Claude app.** It can open when the Claude desktop app opens and close when it closes.

## Requirements

- Windows 10 or 11 (it uses Win32 calls to sit behind the desktop icons)
- Node.js 18 or later
- Claude Code and/or Codex, used on the same computer

## Install

```powershell
git clone https://github.com/HarryXin0919/agent-wallpaper.git
cd agent-wallpaper
npm install
npm start
```

To open the wallpaper whenever the Claude desktop app opens, add a Startup shortcut once:

```powershell
npm run startup:add
```

`npm run startup:remove` takes it away again.

## Controls

The tray icon: left-click shows or hides the wallpaper; right-click opens the menu.

| Action | Shortcut |
|---|---|
| Show / hide | Ctrl + Alt + Shift + W |
| Pause / resume | Ctrl + Alt + Shift + P |
| Hide text (for screen sharing) | Ctrl + Alt + Shift + H |
| Quit | Ctrl + Alt + Shift + Q |

Finished and waiting tasks have a × to clear them; the tray menu can clear all finished tasks or bring them back. A cleared task reappears when it does something new.

If the panels do not appear, the tray menu has **看不到画面？换一种显示方式** (another way to sit behind the icons). Windows versions build the desktop differently, and the choice is remembered.

## Where the data comes from

| Shown | Source |
|---|---|
| Claude tasks | `%USERPROFILE%\.claude\projects\**\*.jsonl` |
| Codex tasks and Codex quota | `%USERPROFILE%\.codex\sessions\**\rollout-*.jsonl` (Codex records its quota with every reply) |
| Claude quota | A local usage service if one is running (below); otherwise the Claude desktop app's own record, `%APPDATA%\Claude\plan-usage-history.json` |
| Tokens per task, live rate | Counted from the logs |

**Claude quota between readings.** The Claude desktop app records your quota only while it polls. Between its readings, Agent Wallpaper adds the tokens used since the last reading, converted with the ratio it learns from the app's past readings against the same logs. Those figures are prefixed with 约 ("about"). Usage from claude.ai or other computers is not in the local logs, so the estimate can run low.

**Exact Claude quota (optional).** For exact figures, run a local service that answers `GET http://127.0.0.1:8787/usage` with JSON like `{"ok": true, "session_pct": 21, "week_pct": 70, "session_reset_s": 10600, "week_reset_s": 93000, "tok_today": 182000000, "cost_today_usd": 96, "tok_7d": [...]}`. The proxy from [ClaudeOrb](https://github.com/HarryXin0919/ClaudeOrb) serves exactly this, using your Claude Code login. This is the only thing the program reads over the network, and it is a local address.

## How it works

- **Placement.** The window is a layered child of the desktop's `Progman` window, placed below the icon view (`SHELLDLL_DefView`), so icons stay on top and clickable. Two fallback placements cover other Windows builds.
- **Icons.** `app/icons.ps1` reads icon positions through the shell's `IFolderView` (read-only). `Glass.freeRect` finds the largest rectangle no icon touches.
- **Clicks.** The wallpaper cannot receive clicks. The program polls the mouse button and cursor, and only counts a click when the desktop itself is under the cursor and the click lands on a card. It opens `claude://` or `codex://` links.
- **Approval waits** are inferred: logs do not record permission prompts, so a normally instant step pending for over 8 s, or a short command pending for over 40 s, counts as waiting for you.
- **Light on resources.** Every animation runs off one 15 fps clock that sets CSS variables, instead of CSS animations at the screen's refresh rate. It uses about 2% of a CPU core at rest.

## Project layout

| Path | What it does |
|---|---|
| `src/parse.mjs`, `src/live.mjs` | Read Claude Code logs as they grow |
| `src/codex.mjs` | Read Codex logs into the same timeline |
| `src/estimate.mjs` | Claude quota estimate between readings |
| `src/flow.js`, `src/scene.js` | Group actions by plan step; infer each task's state |
| `src/glass.js`, `src/glass.css` | The panels |
| `app/main.mjs` | Tray, shortcuts, log watching, usage, clicks |
| `app/desktop.mjs` | Win32: placement behind the icons, mouse, process checks |
| `app/icons.ps1`, `app/watch.ps1`, `app/startup.ps1` | Icon positions; open with Claude; Startup shortcut |
| `tools/demoframe.mjs` | Renders `docs/screenshot.png` from made-up tasks |

The preview tools in `tools/` render still frames with Playwright (`npm i -D playwright-core`; set `CHROME` if Chrome is not in its default place).

## Not affiliated

Agent Wallpaper is an independent project. It is not made by or affiliated with Anthropic or OpenAI. Claude, Claude Code and Codex are trademarks of their owners.

## License

[MIT](LICENSE)
