import { TelnetBot } from '../bot/TelnetBot.ts';
import { WsBot } from '../bot/WsBot.ts';
import type { Bot, BotConfig } from '../bot/Bot.ts';
import { LoginFsm } from '../bot/LoginFsm.ts';
import { createBehavior } from '../bot/behaviors/index.ts';
import { RampScheduler } from './RampScheduler.ts';
import { MetricsStore } from '../metrics/MetricsStore.ts';
import { loadCredentialsFile } from '../config/loader.ts';
import type {
  BotCredential,
  PoolSnapshot,
  SwarmConfig,
  PoolConfig,
  SwarmState,
} from '../config/schema.ts';

interface PoolState {
  pool: PoolConfig;
  bots: Map<string, Bot>;
  controllers: Map<string, AbortController>;
  scheduler: RampScheduler | null;
  nextIndex: number;
  /** Credentials loaded once from disk for 'credentials-file' pools. */
  cachedCreds: BotCredential[] | null;
}

export class SwarmManager {
  private pools = new Map<string, PoolState>();
  private config: SwarmConfig;
  private metrics: MetricsStore;
  private rampTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: SwarmConfig, metrics: MetricsStore) {
    this.config = config;
    this.metrics = metrics;
  }

  updateConfig(config: SwarmConfig): void {
    this.config = config;
  }

  get state(): SwarmState { return this.metrics.state; }

  getPoolSnapshots(): PoolSnapshot[] {
    if (this.pools.size > 0) {
      return [...this.pools.values()].map(({ pool }) => ({
        id: pool.id,
        transport: pool.transport,
        behavior: pool.behavior,
        count: pool.count,
        rampUpSeconds: pool.rampUpSeconds,
      }));
    }

    return this.config.pools.map((pool) => ({
      id: pool.id,
      transport: pool.transport,
      behavior: pool.behavior,
      count: pool.count,
      rampUpSeconds: pool.rampUpSeconds,
    }));
  }

  async start(): Promise<void> {
    if (this.metrics.state !== 'idle') return;
    this.metrics.reset();
    this.metrics.setState('running');

    for (const pool of this.config.pools) {
      // Load credentials-file once per pool rather than once per bot
      let cachedCreds: BotCredential[] | null = null;
      if (pool.accounts.mode === 'credentials-file') {
        cachedCreds = loadCredentialsFile(pool.accounts.file);
      }

      const ps: PoolState = {
        pool,
        bots: new Map(),
        controllers: new Map(),
        scheduler: null,
        nextIndex: 0,
        cachedCreds,
      };
      this.pools.set(pool.id, ps);

      const scheduler = new RampScheduler(
        pool.count,
        pool.rampUpSeconds,
        () => ps.bots.size,
        () => this.addBot(ps),
      );
      ps.scheduler = scheduler;
      scheduler.start();
    }

    // Ramp-point recorder (every second)
    this.rampTimer = setInterval(() => {
      const target = [...this.pools.values()].reduce((sum, ps) => sum + ps.pool.count, 0);
      this.metrics.addRampPoint(target);
    }, 1000);
  }

  async stop(): Promise<void> {
    if (this.metrics.state === 'idle') return;
    this.metrics.setState('stopping');

    if (this.rampTimer) {
      clearInterval(this.rampTimer);
      this.rampTimer = null;
    }

    for (const ps of this.pools.values()) {
      ps.scheduler?.stop();

      // Abort all behaviors
      for (const ctrl of ps.controllers.values()) {
        ctrl.abort();
      }

      // Disconnect all bots
      await Promise.all([...ps.bots.values()].map(b => b.disconnect().catch(() => {})));

      // Unregister from metrics
      for (const bot of ps.bots.values()) {
        this.metrics.unregisterBot(bot.id);
      }
    }

    this.pools.clear();
    this.metrics.reset();
    this.metrics.setState('idle');
  }

  pause(): void {
    if (this.metrics.state !== 'running') return;
    this.metrics.setState('paused');

    for (const ps of this.pools.values()) {
      // Abort behavior loops (bots stay connected)
      for (const ctrl of ps.controllers.values()) {
        ctrl.abort();
      }
      ps.controllers.clear();
      // Pause schedulers
      ps.scheduler?.stop();
    }
  }

  resume(): void {
    if (this.metrics.state !== 'paused') return;
    this.metrics.setState('running');

    for (const ps of this.pools.values()) {
      if (ps.bots.size < ps.pool.count) {
        ps.scheduler?.start();
      }

      // Restart behavior for each connected bot
      for (const bot of ps.bots.values()) {
        if (bot.state === 'paused' || bot.state === 'running') {
          this.runBehavior(ps, bot);
        }
      }
    }
  }

  async scale(poolId: string, newCount: number): Promise<void> {
    const ps = this.pools.get(poolId);
    if (!ps) return;

    const targetCount = Math.max(0, Math.floor(newCount));
    const current = ps.bots.size;
    ps.pool = { ...ps.pool, count: targetCount };
    ps.scheduler?.updateTarget(targetCount, ps.pool.rampUpSeconds);

    if (targetCount > current) {
      // Add bots
      for (let i = current; i < targetCount; i++) {
        await this.addBot(ps);
      }
    } else if (targetCount < current) {
      // Remove bots (remove newest first)
      const toRemove = [...ps.bots.values()].slice(targetCount);
      for (const bot of toRemove) {
        const ctrl = ps.controllers.get(bot.id);
        ctrl?.abort();
        ps.controllers.delete(bot.id);
        ps.bots.delete(bot.id);
        this.metrics.unregisterBot(bot.id);
        await bot.disconnect().catch(() => {});
      }
    }
  }

  private async addBot(ps: PoolState): Promise<void> {
    const { pool } = ps;
    const index = ps.nextIndex++;
    const id = `${pool.id}-${index}`;

    let name: string;
    let password: string;
    let isNew: boolean;
    let race: string | undefined;
    let charClass: string | undefined;

    if (pool.accounts.mode === 'auto-register') {
      name = `${pool.accounts.namePrefix}${String(index).padStart(3, '0')}`;
      password = pool.accounts.password;
      isNew = true;
      race = pool.accounts.race;
      charClass = pool.accounts.class;
    } else {
      const creds = ps.cachedCreds ?? loadCredentialsFile(pool.accounts.file);
      const cred = creds[index % creds.length];
      name = cred.name;
      password = cred.password;
      isNew = false;
    }

    const baseCfg: BotConfig = {
      id,
      poolId: pool.id,
      transport: pool.transport,
      behavior: pool.behavior,
      name,
      password,
      isNew,
      race,
      class: charClass,
    };

    let bot: Bot;
    if (pool.transport === 'telnet') {
      bot = new TelnetBot({
        ...baseCfg,
        host: this.config.target.host,
        port: this.config.target.telnetPort,
      });
    } else {
      bot = new WsBot({
        ...baseCfg,
        host: this.config.target.host,
        port: this.config.target.webPort,
      });
    }

    this.metrics.registerBot(bot);
    ps.bots.set(id, bot);

    try {
      await bot.connect();
      const fsm = new LoginFsm(bot, { name, password, isNew, race, class: charClass });
      await fsm.run();

      if (!ps.bots.has(id)) {
        await bot.disconnect().catch(() => {});
        return;
      }

      if (this.metrics.state === 'paused') {
        bot.setState('paused');
        return;
      }

      if (this.metrics.state !== 'running') {
        await bot.disconnect().catch(() => {});
        ps.bots.delete(id);
        this.metrics.unregisterBot(id);
        return;
      }

      bot.setState('running');
      this.runBehavior(ps, bot);
    } catch (err) {
      console.error(`[SwarmManager] Bot ${id} failed:`, err);
      bot.setState('error', String(err));
    }
  }

  private runBehavior(ps: PoolState, bot: Bot): void {
    const ctrl = new AbortController();
    ps.controllers.set(bot.id, ctrl);

    const behavior = createBehavior(ps.pool.behavior, this.config.behaviorConfig);

    behavior.run(bot, ctrl.signal).catch((err: unknown) => {
      if ((err as Error).name !== 'AbortError') {
        console.error(`[Behavior] Bot ${bot.id} error:`, err);
        bot.setState('error', String(err));
      }
    }).finally(() => {
      ps.controllers.delete(bot.id);
      if (this.metrics.state === 'paused') {
        bot.setState('paused');
      }
    });
  }
}
