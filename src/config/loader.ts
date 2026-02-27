import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';
import type {
  AccountsConfig,
  BehaviorName,
  BotCredential,
  CharClass,
  PoolConfig,
  Race,
  SwarmConfig,
  Transport,
} from './schema.ts';

const DEFAULT_CONFIG: SwarmConfig = {
  target: {
    host: 'localhost',
    telnetPort: 4000,
    webPort: 8080,
  },
  dashboard: {
    port: 3001,
  },
  pools: [],
  behaviorConfig: {
    idler: { pingIntervalMs: 30000 },
    wanderer: { moveIntervalMs: 3000 },
    fighter: { fleeAtHpPercent: 20, regenWaitSeconds: 10, preferCasting: true },
    chatter: {
      messageIntervalMs: 15000,
      channels: ['gossip'],
      messages: ['Testing the system!'],
    },
  },
};

export function loadConfig(filePath: string): SwarmConfig {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    console.warn(`Config file not found: ${resolved}. Using defaults.`);
    return { ...DEFAULT_CONFIG };
  }
  const raw = fs.readFileSync(resolved, 'utf-8');
  return parseConfigYaml(raw);
}

export function saveConfig(filePath: string, config: SwarmConfig): void {
  const resolved = path.resolve(filePath);
  const content = yaml.dump(config, { lineWidth: 120 });
  fs.writeFileSync(resolved, content, 'utf-8');
}

export function parseConfigYaml(yamlStr: string): SwarmConfig {
  return normalizeConfig(yaml.load(yamlStr));
}

export function normalizeConfig(input: unknown): SwarmConfig {
  const root = asRecord(input ?? {}, 'config');
  const target = asRecord(root.target ?? {}, 'target');
  const dashboard = asRecord(root.dashboard ?? {}, 'dashboard');
  const behaviorConfig = asRecord(root.behaviorConfig ?? {}, 'behaviorConfig');

  const poolsRaw = root.pools;
  if (poolsRaw !== undefined && !Array.isArray(poolsRaw)) {
    throw new Error('pools must be an array');
  }

  const pools = (poolsRaw ?? []).map((pool, index) => normalizePool(pool, index));
  const poolIds = new Set<string>();
  for (const pool of pools) {
    if (poolIds.has(pool.id)) {
      throw new Error(`Duplicate pool id: ${pool.id}`);
    }
    poolIds.add(pool.id);
  }

  return {
    target: {
      host: stringValue(target.host ?? DEFAULT_CONFIG.target.host, 'target.host'),
      telnetPort: portValue(target.telnetPort ?? DEFAULT_CONFIG.target.telnetPort, 'target.telnetPort'),
      webPort: portValue(target.webPort ?? DEFAULT_CONFIG.target.webPort, 'target.webPort'),
    },
    dashboard: {
      port: portValue(dashboard.port ?? DEFAULT_CONFIG.dashboard.port, 'dashboard.port'),
    },
    pools,
    behaviorConfig: {
      idler: {
        pingIntervalMs: nonNegativeNumber(
          asRecord(behaviorConfig.idler ?? {}, 'behaviorConfig.idler').pingIntervalMs
            ?? DEFAULT_CONFIG.behaviorConfig.idler!.pingIntervalMs,
          'behaviorConfig.idler.pingIntervalMs',
        ),
      },
      wanderer: {
        moveIntervalMs: nonNegativeNumber(
          asRecord(behaviorConfig.wanderer ?? {}, 'behaviorConfig.wanderer').moveIntervalMs
            ?? DEFAULT_CONFIG.behaviorConfig.wanderer!.moveIntervalMs,
          'behaviorConfig.wanderer.moveIntervalMs',
        ),
      },
      fighter: {
        fleeAtHpPercent: boundedNumber(
          asRecord(behaviorConfig.fighter ?? {}, 'behaviorConfig.fighter').fleeAtHpPercent
            ?? DEFAULT_CONFIG.behaviorConfig.fighter!.fleeAtHpPercent,
          'behaviorConfig.fighter.fleeAtHpPercent',
          0,
          100,
        ),
        regenWaitSeconds: nonNegativeNumber(
          asRecord(behaviorConfig.fighter ?? {}, 'behaviorConfig.fighter').regenWaitSeconds
            ?? DEFAULT_CONFIG.behaviorConfig.fighter!.regenWaitSeconds,
          'behaviorConfig.fighter.regenWaitSeconds',
        ),
        preferCasting: booleanValue(
          asRecord(behaviorConfig.fighter ?? {}, 'behaviorConfig.fighter').preferCasting
            ?? DEFAULT_CONFIG.behaviorConfig.fighter!.preferCasting,
          'behaviorConfig.fighter.preferCasting',
        ),
      },
      chatter: {
        messageIntervalMs: nonNegativeNumber(
          asRecord(behaviorConfig.chatter ?? {}, 'behaviorConfig.chatter').messageIntervalMs
            ?? DEFAULT_CONFIG.behaviorConfig.chatter!.messageIntervalMs,
          'behaviorConfig.chatter.messageIntervalMs',
        ),
        channels: stringArray(
          asRecord(behaviorConfig.chatter ?? {}, 'behaviorConfig.chatter').channels
            ?? DEFAULT_CONFIG.behaviorConfig.chatter!.channels,
          'behaviorConfig.chatter.channels',
        ),
        messages: stringArray(
          asRecord(behaviorConfig.chatter ?? {}, 'behaviorConfig.chatter').messages
            ?? DEFAULT_CONFIG.behaviorConfig.chatter!.messages,
          'behaviorConfig.chatter.messages',
        ),
      },
    },
  };
}

export function loadCredentialsFile(filePath: string): BotCredential[] {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Credentials file not found: ${resolved}`);
  }
  const raw = fs.readFileSync(resolved, 'utf-8');
  const parsed = yaml.load(raw);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`Credentials file must be a non-empty YAML array: ${resolved}`);
  }

  return parsed.map((cred, index) => {
    const entry = asRecord(cred, `credentials[${index}]`);
    return {
      name: nonEmptyString(entry.name, `credentials[${index}].name`),
      password: nonEmptyString(entry.password, `credentials[${index}].password`),
    };
  });
}

function normalizePool(input: unknown, index: number): PoolConfig {
  const pool = asRecord(input, `pools[${index}]`);
  return {
    id: nonEmptyString(pool.id, `pools[${index}].id`),
    transport: enumValue(pool.transport, ['telnet', 'websocket'], `pools[${index}].transport`),
    behavior: enumValue(pool.behavior, ['idler', 'wanderer', 'fighter', 'chatter'], `pools[${index}].behavior`),
    count: nonNegativeInteger(pool.count, `pools[${index}].count`),
    rampUpSeconds: nonNegativeNumber(pool.rampUpSeconds, `pools[${index}].rampUpSeconds`),
    accounts: normalizeAccounts(pool.accounts, index),
  };
}

function normalizeAccounts(input: unknown, poolIndex: number): AccountsConfig {
  const accounts = asRecord(input, `pools[${poolIndex}].accounts`);
  const mode = enumValue(accounts.mode, ['auto-register', 'credentials-file'], `pools[${poolIndex}].accounts.mode`);

  if (mode === 'auto-register') {
    return {
      mode,
      namePrefix: nonEmptyString(accounts.namePrefix, `pools[${poolIndex}].accounts.namePrefix`),
      password: nonEmptyString(accounts.password, `pools[${poolIndex}].accounts.password`),
      race: enumValue(accounts.race, ['HUMAN', 'ELF', 'DWARF', 'HALFLING'], `pools[${poolIndex}].accounts.race`),
      class: enumValue(accounts.class, ['WARRIOR', 'MAGE', 'CLERIC', 'ROGUE'], `pools[${poolIndex}].accounts.class`),
    };
  }

  return {
    mode,
    file: nonEmptyString(accounts.file, `pools[${poolIndex}].accounts.file`),
  };
}

function asRecord(input: unknown, label: string): Record<string, unknown> {
  if (input === undefined || input === null) {
    return {};
  }
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new Error(`${label} must be an object`);
  }
  return input as Record<string, unknown>;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string`);
  }
  return value;
}

function nonEmptyString(value: unknown, label: string): string {
  const str = stringValue(value, label).trim();
  if (!str) {
    throw new Error(`${label} must not be empty`);
  }
  return str;
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${label} must be a boolean`);
  }
  return value;
}

function nonNegativeNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number`);
  }
  return value;
}

function boundedNumber(value: unknown, label: string, min: number, max: number): number {
  const num = nonNegativeNumber(value, label);
  if (num < min || num > max) {
    throw new Error(`${label} must be between ${min} and ${max}`);
  }
  return num;
}

function nonNegativeInteger(value: unknown, label: string): number {
  const num = nonNegativeNumber(value, label);
  if (!Number.isInteger(num)) {
    throw new Error(`${label} must be an integer`);
  }
  return num;
}

function portValue(value: unknown, label: string): number {
  const port = nonNegativeInteger(value, label);
  if (port < 1 || port > 65535) {
    throw new Error(`${label} must be between 1 and 65535`);
  }
  return port;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array of strings`);
  }
  return value.map((item, index) => stringValue(item, `${label}[${index}]`));
}

function enumValue<T extends string>(value: unknown, allowed: T[], label: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new Error(`${label} must be one of: ${allowed.join(', ')}`);
  }
  return value as T;
}
