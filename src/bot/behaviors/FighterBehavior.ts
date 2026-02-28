import type { Bot } from '../Bot.ts';
import type { FighterBehaviorConfig } from '../../config/schema.ts';

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
  });
}

const DIRECTION_COMMANDS: Record<string, string> = {
  north: 'n', south: 's', east: 'e', west: 'w',
  up: 'u', down: 'd',
  northeast: 'ne', northwest: 'nw', southeast: 'se', southwest: 'sw',
};

const OPPOSITE: Record<string, string> = {
  north: 'south', south: 'north',
  east: 'west',   west: 'east',
  up: 'down',     down: 'up',
  northeast: 'southwest', southwest: 'northeast',
  northwest: 'southeast', southeast: 'northwest',
};

const VISITED_CAP = 20;

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

interface Mob { id: string; name: string; hp: number; maxHp: number; }
interface Skill { id: string; name: string; cooldownRemainingMs: number; targetType: string; }
interface Vitals { hp: number; maxHp: number; inCombat: boolean; }

/**
 * Fighter: attacks mobs in the current room, flees at low HP, casts spells
 * when available. When the room is clear it wanders the labyrinth using the
 * same anti-backtrack / prefer-unvisited logic as WandererBehavior.
 */
export class FighterBehavior {
  private vitals: Vitals = { hp: 100, maxHp: 100, inCombat: false };
  private mobs: Mob[] = [];
  private skills: Skill[] = [];
  /** Full exits map from the most recent Room.Info: direction → dest room ID */
  private exits: Record<string, string> = {};
  /** Direction of the last move, used to avoid immediate reversal */
  private lastDir: string | null = null;
  /** Ring buffer of recently visited room IDs */
  private visited: string[] = [];

  constructor(private cfg: FighterBehaviorConfig) {}

  async run(bot: Bot, signal: AbortSignal): Promise<void> {
    const gmcpHandler = (pkg: string, data: unknown) => {
      if (pkg === 'Char.Vitals') {
        const v = data as { hp?: number; maxHp?: number; inCombat?: boolean };
        this.vitals = {
          hp: v.hp ?? this.vitals.hp,
          maxHp: v.maxHp ?? this.vitals.maxHp,
          inCombat: v.inCombat ?? this.vitals.inCombat,
        };
      } else if (pkg === 'Room.Mobs') {
        this.mobs = (data as Mob[]) ?? [];
      } else if (pkg === 'Room.AddMob') {
        const mob = data as Mob;
        if (!this.mobs.find(m => m.id === mob.id)) {
          this.mobs.push(mob);
        }
      } else if (pkg === 'Room.RemoveMob') {
        const { id } = data as { id: string };
        this.mobs = this.mobs.filter(m => m.id !== id);
      } else if (pkg === 'Char.Skills') {
        this.skills = (data as Skill[]) ?? [];
      } else if (pkg === 'Room.Info') {
        const info = data as { id?: string; exits?: Record<string, string> };
        this.exits = info.exits ?? {};
        if (info.id) {
          this.visited.push(info.id);
          if (this.visited.length > VISITED_CAP) this.visited.shift();
        }
      }
    };

    bot.on('gmcp', gmcpHandler);

    try {
      while (!signal.aborted) {
        await this.tick(bot, signal);
        await sleep(1000, signal);
      }
    } catch {
      // Aborted
    } finally {
      bot.off('gmcp', gmcpHandler);
    }
  }

  private async tick(bot: Bot, signal: AbortSignal): Promise<void> {
    const hpPct = this.vitals.maxHp > 0
      ? (this.vitals.hp / this.vitals.maxHp) * 100
      : 100;

    // Flee if low HP and in combat
    if (hpPct < this.cfg.fleeAtHpPercent && this.vitals.inCombat) {
      bot.sendText('flee\r\n');
      // Wait until server confirms we're out of combat (or 5s timeout if flee fails)
      await this.waitForOutOfCombat(bot, signal, 5000);
      // Then wait for HP to regen before re-engaging
      try {
        await sleep(this.cfg.regenWaitSeconds * 1000, signal);
      } catch {
        return;
      }
      return;
    }

    // If mobs present and not in combat, engage
    if (this.mobs.length > 0 && !this.vitals.inCombat) {
      const mob = this.mobs[0];

      // Try casting if preferCasting is true
      if (this.cfg.preferCasting) {
        const readySkill = this.skills.find(
          s => s.cooldownRemainingMs === 0 && s.targetType === 'ENEMY'
        );
        if (readySkill) {
          bot.sendText(`cast ${readySkill.name} ${mob.name}\r\n`);
          return;
        }
      }

      bot.sendText(`kill ${mob.name}\r\n`);
      return;
    }

    // Room is clear — wander the labyrinth
    if (!this.vitals.inCombat) {
      const dir = this.pickDirection();
      if (dir) {
        this.lastDir = dir;
        bot.sendText(`${DIRECTION_COMMANDS[dir] ?? dir}\r\n`);
      }
    }
  }

  /**
   * Picks the next movement direction using a three-tier preference:
   *  1. Exit leads to a room not recently visited AND is not a reversal
   *  2. Exit is not a reversal (allow revisit)
   *  3. Dead end — allow backtracking
   */
  private pickDirection(): string | null {
    const dirs = Object.keys(this.exits);
    if (dirs.length === 0) return null;

    const backDir = this.lastDir ? OPPOSITE[this.lastDir] : null;
    const recentDests = new Set(this.visited.slice(-10));

    let cands = dirs.filter(d => d !== backDir && !recentDests.has(this.exits[d]));
    if (cands.length > 0) return pick(cands);

    cands = dirs.filter(d => d !== backDir);
    if (cands.length > 0) return pick(cands);

    return pick(dirs);
  }

  /**
   * Waits for a Char.Vitals GMCP packet confirming inCombat=false, or resolves
   * after timeoutMs if flee fails or the server doesn't respond.
   * The main gmcpHandler in run() is registered first so this.vitals is already
   * updated by the time this listener fires.
   */
  private waitForOutOfCombat(bot: Bot, signal: AbortSignal, timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.vitals.inCombat) { resolve(); return; }

      const timer = setTimeout(resolve, timeoutMs);

      const onGmcp = (pkg: string) => {
        if (pkg === 'Char.Vitals' && !this.vitals.inCombat) {
          clearTimeout(timer);
          bot.off('gmcp', onGmcp);
          resolve();
        }
      };
      bot.on('gmcp', onGmcp);

      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        bot.off('gmcp', onGmcp);
        resolve();
      }, { once: true });
    });
  }
}
