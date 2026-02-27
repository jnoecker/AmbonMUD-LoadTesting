import { IAC, SB, SE, GMCP } from './IacParser.ts';

export interface GmcpFrame {
  pkg: string;
  data: unknown;
}

/**
 * Encodes a GMCP package + data into a telnet subnegotiation buffer:
 *   IAC SB GMCP <pkg SP json> IAC SE
 */
export function encodeGmcp(pkg: string, data: unknown): Buffer {
  const payload = data !== undefined && data !== null
    ? `${pkg} ${JSON.stringify(data)}`
    : pkg;
  const bytes = Buffer.from(payload, 'utf-8');

  // Pre-escape any 0xFF bytes in the payload
  const escaped: number[] = [];
  for (const b of bytes) {
    escaped.push(b);
    if (b === 0xFF) escaped.push(0xFF); // IAC escape
  }

  return Buffer.from([IAC, SB, GMCP, ...escaped, IAC, SE]);
}

/**
 * Decodes a raw GMCP payload buffer (the bytes between IAC SB GMCP ... IAC SE)
 * into { pkg, data }.
 */
export function decodeGmcp(raw: Buffer): GmcpFrame {
  const str = raw.toString('utf-8');
  const spaceIdx = str.indexOf(' ');
  if (spaceIdx === -1) {
    return { pkg: str.trim(), data: {} };
  }
  const pkg = str.substring(0, spaceIdx);
  const jsonPart = str.substring(spaceIdx + 1).trim();
  let data: unknown = {};
  try {
    data = JSON.parse(jsonPart);
  } catch {
    console.warn(`[GmcpCodec] Malformed JSON in GMCP package "${pkg}":`, jsonPart);
  }
  return { pkg, data };
}
