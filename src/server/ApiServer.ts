import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { SwarmManager } from '../swarm/SwarmManager.ts';
import type { MetricsStore } from '../metrics/MetricsStore.ts';
import { normalizeConfig, parseConfigYaml, saveConfig } from '../config/loader.ts';
import type { SwarmConfig } from '../config/schema.ts';

interface SaveConfigResult {
  ok: boolean;
  error?: string;
  config?: SwarmConfig;
}

export class ApiServer {
  private app: Hono;
  private configPath: string;
  private currentConfig: SwarmConfig;

  constructor(
    private swarm: SwarmManager,
    private metrics: MetricsStore,
    config: SwarmConfig,
    configPath: string,
  ) {
    this.currentConfig = config;
    this.configPath = configPath;
    this.app = this.buildApp();
  }

  async saveConfigUpdate(input: { yaml?: string; config?: unknown }): Promise<SaveConfigResult> {
    if (this.metrics.state !== 'idle') {
      return { ok: false, error: 'Cannot save config while swarm is running' };
    }

    try {
      let newConfig: SwarmConfig;
      if (input.yaml !== undefined) {
        newConfig = parseConfigYaml(input.yaml);
      } else if (input.config !== undefined) {
        newConfig = normalizeConfig(input.config);
      } else {
        return { ok: false, error: 'Provide yaml or config field' };
      }

      saveConfig(this.configPath, newConfig);
      this.currentConfig = newConfig;
      this.swarm.updateConfig(newConfig);
      return { ok: true, config: newConfig };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  get fetch(): (req: Request) => Response | Promise<Response> {
    return this.app.fetch.bind(this.app);
  }

  private buildApp(): Hono {
    const app = new Hono();
    app.use('*', cors());

    // --- Config ---
    app.get('/api/config', (c) => c.json(this.currentConfig));

    app.post('/api/config', async (c) => {
      const body = await c.req.json<{ yaml?: string; config?: SwarmConfig }>();
      const result = await this.saveConfigUpdate(body);
      if (!result.ok) {
        return c.json({ error: result.error }, 400);
      }
      return c.json({ ok: true, config: result.config });
    });

    // --- Status ---
    app.get('/api/status', (c) => {
      const snapshots = this.metrics.snapshots();
      return c.json({
        state: this.metrics.state,
        botCount: snapshots.length,
        errorCount: snapshots.filter(b => b.state === 'error').length,
        pools: this.swarm.getPoolSnapshots(),
      });
    });

    // --- Bots ---
    app.get('/api/bots', (c) => c.json(this.metrics.snapshots()));

    // --- Swarm control ---
    app.post('/api/swarm/start', async (c) => {
      await this.swarm.start();
      return c.json({ ok: true });
    });

    app.post('/api/swarm/stop', async (c) => {
      await this.swarm.stop();
      return c.json({ ok: true });
    });

    app.post('/api/swarm/pause', (c) => {
      this.swarm.pause();
      return c.json({ ok: true });
    });

    app.post('/api/swarm/resume', (c) => {
      this.swarm.resume();
      return c.json({ ok: true });
    });

    app.post('/api/swarm/scale', async (c) => {
      const body = await c.req.json<{ poolId: string; count: number }>();
      await this.swarm.scale(body.poolId, body.count);
      return c.json({ ok: true });
    });

    return app;
  }
}
