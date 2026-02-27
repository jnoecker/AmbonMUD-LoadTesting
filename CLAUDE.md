# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install all dependencies (run once, or after pulling changes)
bun install
cd dashboard && bun install && cd ..

# Type-check backend
bunx tsc

# Type-check dashboard
cd dashboard && bunx tsc --noEmit

# Build dashboard for production (required before running the backend in production mode)
cd dashboard && bun run build

# Run the load tester (backend + serves built dashboard at :3001)
bun run src/main.ts --config swarm.example.yaml

# Run dashboard in dev mode with hot-reload (separate terminal; proxies to backend :3001)
cd dashboard && bun run dev
```

There are no automated tests. TypeScript (`bunx tsc`) is the primary correctness check.

## Architecture

The backend is a single **Bun** process (`src/main.ts`) that uses `Bun.serve()` to multiplex HTTP and WebSocket on one port (default 3001).

**Data flow:**
```
AmbonMUD server (:4000 telnet / :8080 WS)
  ↕
TelnetBot / WsBot          one per bot; emits: text, gmcp, connected, disconnected, latency
  ↓
MetricsStore               aggregates snapshots and latency samples
  ↓
DashboardBroadcaster       pushes SwarmMetrics to all WS clients every 500 ms
  ↕ /ws
React dashboard            useDashboardSocket → useSwarmState → components
```

**Bot lifecycle:**
1. `SwarmManager` creates a `TelnetBot` or `WsBot` and calls `bot.connect()`
2. `LoginFsm` drives the text-prompt login flow until `Room.Info` GMCP is received
3. A `Behavior` (Idler / Wanderer / Fighter / Chatter) runs in an `async` loop cancellable via `AbortController`
4. `RampScheduler` adds bots on a timed interval so load increases gradually

**Key coupling points to know before editing:**
- `SwarmMetrics` (in `src/config/schema.ts`) is the wire format sent from `DashboardBroadcaster` to the React app. `dashboard/src/types.ts` mirrors the relevant fields — both must stay in sync.
- `DashboardBroadcaster` receives a `getPools` callback from `SwarmManager.getPoolSnapshots()` to include live pool counts in every snapshot.
- `ApiServer.saveConfigUpdate()` is called both from the REST `POST /api/config` handler and from the WebSocket `SAVE_CONFIG` message in `main.ts`. It normalises and validates the YAML before writing to disk.
- `MetricsStore.swarmMetrics()` returns `Omit<SwarmMetrics, 'pools'>` — the `pools` field is injected by `DashboardBroadcaster`.

## Runtime notes

- Use **Bun APIs** (`Bun.serve`, `Bun.file`, `import.meta.dir`) in `src/` — do not use `@hono/node-server` or similar Node adapters.
- All imports in `src/` use `.ts` extensions. The `tsconfig.json` sets `allowImportingTsExtensions: true` + `noEmit: true` so that `bunx tsc` type-checks without emitting.
- The dashboard imports nothing from `src/`. Shared types are duplicated in `dashboard/src/types.ts` to avoid cross-project Vite imports.

## Config schema

`src/config/schema.ts` defines all types. `src/config/loader.ts` contains `normalizeConfig()` which validates and coerces every field with descriptive error messages — always go through `normalizeConfig` / `parseConfigYaml` rather than casting raw YAML directly.

## Design system

All dashboard styling lives in `dashboard/src/styles.css` as CSS custom properties. The palette follows `mud_docs/STYLE_GUIDE.md` ("Surreal Gentle Magic"). Never hardcode colours — always use the CSS variables defined in `:root`.

Bot state chip classes follow the pattern `chip-<BotState>` (e.g. `chip-running`, `chip-error`). Swarm state chip classes follow `chip-<SwarmState>`.
