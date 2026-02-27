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

interface Mob { id: string; name: string; hp: number; maxHp: number; }
interface Skill { id: string; name: string; cooldownRemainingMs: number; targetType: string; }
interface Vitals { hp: number; maxHp: number; inCombat: boolean; }

/**
 * Fighter: attacks mobs, flees at low HP, casts spells when available.
 */
export class FighterBehavior {
  private vitals: Vitals = { hp: 100, maxHp: 100, inCombat: false };
  private mobs: Mob[] = [];
  private skills: Skill[] = [];
  private exits: string[] = [];

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
        const info = data as { exits?: Record<string, string> };
        this.exits = Object.keys(info.exits ?? {});
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

    // No mobs — wander
    if (this.exits.length > 0 && !this.vitals.inCombat) {
      const dir = this.exits[Math.floor(Math.random() * this.exits.length)];
      const cmd = DIRECTION_COMMANDS[dir] ?? dir;
      bot.sendText(`${cmd}\r\n`);
    }
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
