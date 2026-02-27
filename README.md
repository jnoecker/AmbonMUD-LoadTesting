# AmbonMUD Load Tester

A standalone load testing tool for [AmbonMUD](https://github.com/your-org/AmbonMUD) — a production-grade Kotlin MUD server. Spawns configurable bot swarms that connect over telnet and/or WebSocket, exercise scripted player behaviors, and report live metrics on a styled web dashboard.

---

## Features

- **Mixed transports** — bots connect via raw telnet (with full IAC/GMCP negotiation) or WebSocket
- **Four built-in behaviors** — Idler, Wanderer, Fighter, Chatter
- **Configurable pools** — multiple independent bot groups, each with its own transport, behavior, count, and ramp schedule
- **Gradual ramp-up** — bots are added over a configurable window rather than all at once
- **Live dashboard** — React frontend with bot status table, ramp chart, latency metrics, per-bot log, and YAML config editor
- **Latency tracking** — p50 / p95 / p99 Core.Ping RTT computed from a ring buffer
- **Runtime control** — Start · Pause · Resume · Stop · per-pool count slider, all from the dashboard or REST API
- **YAML config** — single file drives everything; editable live in the dashboard while the swarm is stopped

---

## Requirements

| Tool | Version |
|------|---------|
| [Bun](https://bun.sh) | ≥ 1.1 |
| AmbonMUD server | running on `localhost:4000` (telnet) and/or `:8080` (WebSocket) |

---

## Quick Start

```bash
# 1. Install backend dependencies
bun install

# 2. Install and build the dashboard
cd dashboard && bun install && bun run build && cd ..

# 3. Start the load tester (serves dashboard at :3001)
bun run src/main.ts --config swarm.example.yaml
```

Open **http://localhost:3001** and click **Start**.

> During development the dashboard can also be run separately with hot-reload:
> ```bash
> # Terminal 1 — backend
> bun run src/main.ts --config swarm.example.yaml
>
> # Terminal 2 — dashboard dev server (port 5173, proxies /api and /ws to :3001)
> cd dashboard && bun run dev
> ```

---

## Configuration

The tool is driven by a single YAML file. Pass it with `--config` (or `-c`); defaults to `swarm.example.yaml`.

```yaml
target:
  host: localhost
  telnetPort: 4000      # AmbonMUD telnet port
  webPort: 8080         # AmbonMUD WebSocket port

dashboard:
  port: 3001            # Load tester dashboard + API port

pools:
  - id: wanderers
    transport: telnet           # telnet | websocket
    behavior: wanderer          # idler | wanderer | fighter | chatter
    count: 10
    rampUpSeconds: 30
    accounts:
      mode: auto-register       # auto-register | credentials-file
      namePrefix: bot_wand_
      password: botpass123
      race: HUMAN               # HUMAN | ELF | DWARF | HALFLING
      class: WARRIOR            # WARRIOR | MAGE | CLERIC | ROGUE

  - id: vips
    transport: websocket
    behavior: fighter
    count: 5
    rampUpSeconds: 60
    accounts:
      mode: credentials-file
      file: ./bot-accounts.yaml  # [{name, password}]

behaviorConfig:
  idler:
    pingIntervalMs: 30000       # ms between Core.Ping heartbeats
  wanderer:
    moveIntervalMs: 3000        # ms between random movement commands
  fighter:
    fleeAtHpPercent: 20         # flee when HP drops below this %
    regenWaitSeconds: 10        # wait this long after fleeing before re-engaging
    preferCasting: true         # use Char.Skills spells when available
  chatter:
    messageIntervalMs: 15000    # ms between chat messages
    channels: [gossip, say]
    messages:
      - "Testing the system!"
      - "Just a bot."
```

### Account modes

| Mode | Behaviour |
|---|---|
| `auto-register` | Bot names are `${namePrefix}${index}` (e.g. `bot_wand_001`). The login FSM answers `yes` to the new-character prompt and fills in race/class. |
| `credentials-file` | Load `{name, password}` pairs from a YAML list. Bots cycle through the list. |

---

## Behaviors

### Idler
Sends `Core.Ping` GMCP on a fixed interval and records the round-trip time. Useful for baseline latency measurement with minimal server load.

### Wanderer
Listens for `Room.Info` GMCP, reads the `exits` map, and moves in a random direction every `moveIntervalMs` milliseconds.

### Fighter
Reacts to `Char.Vitals`, `Room.Mobs`, and `Char.Skills` GMCP packets:
- Flees when `hp/maxHp` drops below `fleeAtHpPercent` and waits `regenWaitSeconds` to recover.
- Engages the first mob in the room when not in combat, preferring to `cast` a ready spell when `preferCasting` is true.
- Wanders when the room is empty.

### Chatter
Picks a random channel and message from the configured lists and sends `${channel} ${message}` every `messageIntervalMs` milliseconds.

---

## Dashboard

The React dashboard (port 3001 in production, 5173 in dev) has three tabs:

| Tab | Contents |
|---|---|
| **Dashboard** | Swarm control buttons, pool count sliders, p50/p95/p99 latency cards, ramp chart |
| **Bots** | Sortable bot status table (id, pool, transport, state, room, HP bar, latency); click any row to view its live log |
| **Config** | CodeMirror YAML editor with Save button (locked while the swarm is running) |

### WebSocket control messages

The dashboard communicates with the backend over a WebSocket at `/ws`. You can also send these messages from any WS client:

```json
{ "type": "START" }
{ "type": "STOP" }
{ "type": "PAUSE" }
{ "type": "RESUME" }
{ "type": "SCALE", "poolId": "wanderers", "count": 15 }
{ "type": "SELECT_BOT", "botId": "wanderers-3" }
{ "type": "SAVE_CONFIG", "yaml": "..." }
```

---

## REST API

All endpoints are served at `http://localhost:3001/api`.

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/config` | Return current config as JSON |
| `POST` | `/api/config` | Save config; body `{ yaml: "..." }` or `{ config: {...} }`. Returns 400 if swarm is running. |
| `GET`  | `/api/status` | `{ state, botCount, errorCount, pools[] }` |
| `GET`  | `/api/bots` | `BotSnapshot[]` — full bot list |
| `POST` | `/api/swarm/start` | Start the swarm |
| `POST` | `/api/swarm/stop` | Stop the swarm |
| `POST` | `/api/swarm/pause` | Pause all behavior loops (bots stay connected) |
| `POST` | `/api/swarm/resume` | Resume behavior loops |
| `POST` | `/api/swarm/scale` | Body `{ poolId, count }` — add or remove bots from a pool |

---

## Project Layout

```
AmbonMUD-LoadTesting/
├── src/                            # Backend (TypeScript, Bun runtime)
│   ├── main.ts                     # Entry point — Bun.serve, CLI arg parsing
│   ├── config/
│   │   ├── schema.ts               # TypeScript types for all shared data
│   │   └── loader.ts               # YAML load / save / parse
│   ├── telnet/
│   │   ├── IacParser.ts            # IAC byte-stream state machine
│   │   └── GmcpCodec.ts            # GMCP frame encoder + decoder
│   ├── bot/
│   │   ├── Bot.ts                  # Abstract base: EventEmitter, state, ring-buffered log
│   │   ├── TelnetBot.ts            # net.createConnection TCP + IacParser + GMCP
│   │   ├── WsBot.ts                # ws npm WebSocket client
│   │   ├── LoginFsm.ts             # Text-prompt login / char-creation FSM
│   │   └── behaviors/
│   │       ├── index.ts            # Behavior factory
│   │       ├── IdlerBehavior.ts
│   │       ├── WandererBehavior.ts
│   │       ├── FighterBehavior.ts
│   │       └── ChatterBehavior.ts
│   ├── swarm/
│   │   ├── SwarmManager.ts         # Pool lifecycle: create/destroy/pause/scale
│   │   └── RampScheduler.ts        # Timed ramp-up via setInterval
│   ├── metrics/
│   │   ├── MetricsStore.ts         # Aggregates bot events → SwarmMetrics
│   │   └── LatencyTracker.ts       # Ring buffer → p50/p95/p99
│   └── server/
│       ├── ApiServer.ts            # Hono HTTP REST API
│       └── DashboardBroadcaster.ts # 500ms snapshot push to WS clients
├── dashboard/                      # Frontend (React 18 + Vite + Bun)
│   ├── index.html
│   ├── vite.config.ts              # Proxies /api and /ws to :3001
│   └── src/
│       ├── types.ts                # Shared type mirror (BotSnapshot, SwarmState…)
│       ├── styles.css              # AmbonMUD "Surreal Gentle Magic" design tokens
│       ├── App.tsx                 # Root layout: sidebar + tab panels
│       ├── components/
│       │   ├── SwarmControl.tsx    # Start/Pause/Stop + pool sliders
│       │   ├── BotStatusTable.tsx  # Sortable bot table with HP bars
│       │   ├── RampChart.tsx       # Recharts line chart
│       │   ├── LatencyPanel.tsx    # p50 / p95 / p99 cards
│       │   ├── BotDetailLog.tsx    # Per-bot log panel
│       │   └── ConfigEditor.tsx    # CodeMirror YAML editor
│       └── hooks/
│           ├── useDashboardSocket.ts
│           └── useSwarmState.ts
├── swarm.example.yaml
├── package.json
├── tsconfig.json
└── CLAUDE.md
```

---

## Architecture

```
AmbonMUD server (localhost:4000 / :8080)
        ↑↓
TelnetBot / WsBot           (one per bot, async loop)
        │  emits: gmcp, text, connected, disconnected, log, latency
        ↓
MetricsStore                (aggregates all bot events)
        │
DashboardBroadcaster        (500 ms interval)
        │
Dashboard WebSocket (/ws)
        │
React Dashboard             (useDashboardSocket → useSwarmState → components)
```

### Bot lifecycle

```
SwarmManager.addBot(poolCfg)
  → new TelnetBot | WsBot
  → bot.connect()
  → LoginFsm.run(bot)          ← handles new & existing accounts
  → behavior.run(bot, signal)  ← async loop, cancelled by AbortController
  → bot.on('gmcp', ...)        ← behavior reacts to GMCP events
  → bot.emit('latency', rtt)   → MetricsStore.latencyTracker
```

---

## Design

The dashboard follows AmbonMUD's **Surreal Gentle Magic** visual style (`mud_docs/STYLE_GUIDE.md`):

- **Palette** — Lavender `#a897d2` · Pale Blue `#8caec9` · Moss Green `#8da97b` · Soft Gold `#bea873` · Dusty Rose `#b88faa`
- **Fonts** — Cormorant Garamond (headings) · Nunito Sans (UI) · JetBrains Mono (logs)
- **Surfaces** — glassmorphism panels on a Deep Mist `#22293c` base
- **Bot state chips** — Running = Moss Green · Paused = Soft Gold · Error = desaturated red · Connecting = Pale Blue

---

## License

MIT
