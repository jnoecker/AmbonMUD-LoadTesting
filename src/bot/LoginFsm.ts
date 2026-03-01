import type { Bot } from './Bot.ts';

export interface LoginCredentials {
  name: string;
  password: string;
  isNew: boolean;
  race?: string;
  class?: string;
}

type LoginState =
  | 'WAIT_NAME'
  | 'WAIT_PASSWORD'
  | 'WAIT_NEW_CONFIRM'
  | 'WAIT_RACE'
  | 'WAIT_CLASS'
  | 'WAIT_ROOM_INFO'
  | 'DONE';

/**
 * Text-prompt FSM that drives a bot through AmbonMUD's login / character-creation flow.
 * Resolves when Room.Info GMCP is received (player is in the world).
 */
export class LoginFsm {
  private state: LoginState = 'WAIT_NAME';
  private resolve!: () => void;
  private reject!: (err: Error) => void;

  constructor(private bot: Bot, private creds: LoginCredentials) {}

  run(): Promise<void> {
    return new Promise<void>((res, rej) => {
      this.resolve = res;
      this.reject = rej;

      const textHandler = (line: string) => this.onText(line);
      const gmcpHandler = (pkg: string, _data: unknown) => {
        if (pkg === 'Room.Info' && this.state !== 'WAIT_NAME' && this.state !== 'WAIT_PASSWORD' && this.state !== 'DONE') {
          this.state = 'DONE';
          this.resolve();
        }
      };

      this.bot.on('text', textHandler);
      this.bot.on('gmcp', gmcpHandler);

      // Timeout after 60s
      const timer = setTimeout(() => {
        this.reject(new Error(`Login timeout for bot ${this.creds.name} (stuck in ${this.state})`));
      }, 60_000);

      const cleanup = () => {
        clearTimeout(timer);
        this.bot.off('text', textHandler);
        this.bot.off('gmcp', gmcpHandler);
      };

      const origRes = this.resolve;
      this.resolve = () => {
        cleanup();
        origRes();
      };

      const origRej = this.reject;
      this.reject = (err) => {
        cleanup();
        origRej(err);
      };
    });
  }

  private onText(line: string): void {
    const lower = line.toLowerCase();

    switch (this.state) {
      case 'WAIT_NAME':
        if (matchesAny(lower, ['by what name', 'enter your name'])) {
          this.bot.sendText(`${this.creds.name}\r\n`);
          this.state = 'WAIT_PASSWORD';
        }
        break;

      case 'WAIT_PASSWORD':
        if (matchesAny(lower, ['create a new user', 'create a new character'])) {
          if (this.creds.isNew) {
            this.bot.sendText('yes\r\n');
          } else {
            this.bot.sendText('no\r\n');
          }
        } else if (lower.includes('password')) {
          this.bot.sendText(`${this.creds.password}\r\n`);
          this.state = 'WAIT_NEW_CONFIRM';
        }
        break;

      case 'WAIT_NEW_CONFIRM':
        if (matchesAny(lower, [
          'new character',
          'is that correct',
          'is this a new character',
          'did i get that right',
          'create a new user',
          'create a new character',
        ])) {
          if (this.creds.isNew) {
            this.bot.sendText('yes\r\n');
            this.state = this.creds.race ? 'WAIT_RACE' : 'WAIT_ROOM_INFO';
          } else {
            this.bot.sendText('no\r\n');
            this.state = 'WAIT_PASSWORD';
          }
        } else if (lower.includes('incorrect') || lower.includes('wrong password')) {
          this.reject(new Error(`Wrong password for ${this.creds.name}`));
        } else if (lower.includes('what race')) {
          // Jumped straight to race (some MUD flows)
          this.state = 'WAIT_RACE';
          this.onText(line);
        } else if (matchesAny(lower, ['choose a race', 'choose your race'])) {
          this.state = 'WAIT_RACE';
          this.onText(line);
        } else if (lower.includes('room') || lower.includes('you are in')) {
          // Already logged in
          this.state = 'WAIT_ROOM_INFO';
        }
        break;

      case 'WAIT_RACE':
        if (matchesAny(lower, ['what race', 'choose your race', 'choose a race'])) {
          this.bot.sendText(`${this.creds.race ?? 'HUMAN'}\r\n`);
          this.state = 'WAIT_CLASS';
        }
        break;

      case 'WAIT_CLASS':
        if (matchesAny(lower, ['what class', 'choose your class', 'choose a class'])) {
          this.bot.sendText(`${this.creds.class ?? 'WARRIOR'}\r\n`);
          this.state = 'WAIT_ROOM_INFO';
        }
        break;

      case 'WAIT_ROOM_INFO':
        // Waiting for Room.Info GMCP — handled by gmcpHandler above
        // But also accept text fallback
        if (lower.includes('welcome to ambon') || lower.includes('you have entered')) {
          // Don't resolve yet — wait for Room.Info
        }
        break;
    }
  }
}

function matchesAny(text: string, patterns: string[]): boolean {
  return patterns.some((pattern) => text.includes(pattern));
}
