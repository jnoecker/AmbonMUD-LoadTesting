import * as fs from 'fs';
import * as path from 'path';
import { loadConfig } from './config/loader.ts';
import { MetricsStore } from './metrics/MetricsStore.ts';
import { SwarmManager } from './swarm/SwarmManager.ts';
import { DashboardBroadcaster } from './server/DashboardBroadcaster.ts';
import { ApiServer } from './server/ApiServer.ts';

const DASHBOARD_DIST = path.resolve(import.meta.dir, '..', 'dashboard', 'dist');
const hasDashboardDist = fs.existsSync(DASHBOARD_DIST);

// Parse CLI args
const args = process.argv.slice(2);
let configPath = 'swarm.example.yaml';
for (let i = 0; i < args.length; i++) {
  if ((args[i] === '--config' || args[i] === '-c') && args[i + 1]) {
    configPath = args[i + 1];
    i++;
  }
}

console.log(`[AmbonMUD Load Tester] Loading config from: ${configPath}`);
const config = loadConfig(configPath);

const metrics = new MetricsStore();
const swarm = new SwarmManager(config, metrics);
const broadcaster = new DashboardBroadcaster(metrics, () => swarm.getPoolSnapshots());
const apiServer = new ApiServer(swarm, metrics, config, configPath);

const port = config.dashboard.port;

Bun.serve({
  port,
  fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade for /ws
    if (url.pathname === '/ws') {
      const upgraded = server.upgrade(req);
      if (!upgraded) {
        return new Response('WebSocket upgrade failed', { status: 400 });
      }
      return undefined;
    }

    // Serve dashboard static files if /api not matched
    if (!url.pathname.startsWith('/api') && hasDashboardDist) {
      let filePath = path.join(DASHBOARD_DIST, url.pathname === '/' ? 'index.html' : url.pathname);
      if (!fs.existsSync(filePath)) filePath = path.join(DASHBOARD_DIST, 'index.html');
      const file = Bun.file(filePath);
      return new Response(file);
    }

    // Pass HTTP requests to Hono app
    return apiServer.fetch(req);
  },
  websocket: {
    open(ws) {
      broadcaster.addClient(ws);
    },
    message(ws, raw) {
      const str = typeof raw === 'string' ? raw : raw.toString();
      try {
        const msg = JSON.parse(str) as { type: string; poolId?: string; count?: number; botId?: string; yaml?: string };
        // Handle swarm control messages from dashboard
        switch (msg.type) {
          case 'START':
            swarm.start().catch(console.error);
            break;
          case 'STOP':
            swarm.stop().catch(console.error);
            break;
          case 'PAUSE':
            swarm.pause();
            break;
          case 'RESUME':
            swarm.resume();
            break;
          case 'SCALE':
            if (msg.poolId && msg.count !== undefined) {
              swarm.scale(msg.poolId, msg.count).catch(console.error);
            }
            break;
          case 'SAVE_CONFIG':
            void (async () => {
              const result = await apiServer.saveConfigUpdate({ yaml: msg.yaml });
              if (result.ok) {
                console.log('[main] Config updated via dashboard');
              } else if (!result.ok) {
                console.error('[main] Config save error:', result.error);
              }

              ws.send(JSON.stringify({
                type: 'CONFIG_SAVE_RESULT',
                ok: result.ok,
                error: result.error ?? null,
              }));
            })();
            break;
          default:
            // SELECT_BOT and others are handled by broadcaster
            broadcaster.handleClientMessage(ws, str);
        }
      } catch {
        broadcaster.handleClientMessage(ws, str);
      }
    },
    close(ws) {
      broadcaster.removeClient(ws);
    },
  },
});

broadcaster.start();

// Graceful shutdown: disconnect all bots before exiting so they don't linger on the MUD server
const shutdown = async (signal: string): Promise<void> => {
  console.log(`\n[AmbonMUD Load Tester] Received ${signal}, shutting down…`);
  broadcaster.stop();
  await swarm.stop();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT',  () => void shutdown('SIGINT'));

console.log(`[AmbonMUD Load Tester] Dashboard: http://localhost:${port}`);
console.log(`[AmbonMUD Load Tester] API:       http://localhost:${port}/api`);
console.log(`[AmbonMUD Load Tester] WebSocket:  ws://localhost:${port}/ws`);
console.log('[AmbonMUD Load Tester] Ready. Open the dashboard to start the swarm.');
