import type { BehaviorName, BehaviorConfig } from '../../config/schema.ts';
import { IdlerBehavior } from './IdlerBehavior.ts';
import { WandererBehavior } from './WandererBehavior.ts';
import { FighterBehavior } from './FighterBehavior.ts';
import { ChatterBehavior } from './ChatterBehavior.ts';
import type { Bot } from '../Bot.ts';

export interface Behavior {
  run(bot: Bot, signal: AbortSignal): Promise<void>;
}

export function createBehavior(name: BehaviorName, cfg: BehaviorConfig): Behavior {
  switch (name) {
    case 'idler':
      return new IdlerBehavior(cfg.idler ?? { pingIntervalMs: 30000 });
    case 'wanderer':
      return new WandererBehavior(cfg.wanderer ?? { moveIntervalMs: 3000 });
    case 'fighter':
      return new FighterBehavior(cfg.fighter ?? {
        fleeAtHpPercent: 20,
        regenWaitSeconds: 10,
        preferCasting: false,
      });
    case 'chatter':
      return new ChatterBehavior(cfg.chatter ?? {
        messageIntervalMs: 15000,
        channels: ['gossip'],
        messages: ['Hello!'],
      });
    default:
      throw new Error(`Unknown behavior: ${name}`);
  }
}
