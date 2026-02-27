import { EventEmitter } from 'events';

// Telnet protocol constants
export const IAC  = 0xFF;
export const SE   = 0xF0;
export const SB   = 0xFA;
export const WILL = 0xFB;
export const WONT = 0xFC;
export const DO   = 0xFD;
export const DONT = 0xFE;
export const GMCP = 0xC9;
export const TTYPE = 0x18;
export const NAWS  = 0x1F;

type State = 'NORMAL' | 'IAC' | 'VERB' | 'SB' | 'SB_GMCP' | 'SB_IAC';

export interface GmcpPacket {
  raw: Buffer;   // the GMCP payload bytes (pkg + space + json)
}

/**
 * Byte-stream state machine that parses the IAC telnet protocol from a raw
 * TCP stream and emits:
 *  - 'text'  (line: string)  — a complete text line (terminated by 0x0A)
 *  - 'gmcp'  (pkt: GmcpPacket) — a decoded GMCP subnegotiation payload
 *  - 'negotiation' (verb: number, option: number) — WILL/WONT/DO/DONT option byte
 *  - 'needsResponse' (buf: Buffer) — IAC bytes the caller should send back
 */
export class IacParser extends EventEmitter {
  private state: State = 'NORMAL';
  private verb = 0;
  private textBuf: number[] = [];
  private gmcpBuf: number[] = [];

  feed(chunk: Buffer): void {
    for (let i = 0; i < chunk.length; i++) {
      const b = chunk[i];
      this.step(b);
    }
  }

  private step(b: number): void {
    switch (this.state) {
      case 'NORMAL':
        if (b === IAC) {
          this.state = 'IAC';
        } else if (b === 0x0A) {
          // LF — emit the buffered line
          const line = Buffer.from(this.textBuf).toString('utf-8').replace(/\r/g, '');
          this.textBuf = [];
          this.emit('text', line);
        } else if (b !== 0x00) {
          // Accumulate printable bytes (skip NUL)
          this.textBuf.push(b);
        }
        break;

      case 'IAC':
        if (b === IAC) {
          // Escaped IAC — treat as literal 0xFF in text
          this.textBuf.push(0xFF);
          this.state = 'NORMAL';
        } else if (b === SB) {
          this.state = 'SB';
        } else if (b === WILL || b === WONT || b === DO || b === DONT) {
          this.verb = b;
          this.state = 'VERB';
        } else {
          // Unknown IAC command (GA, NOP, etc.) — ignore
          this.state = 'NORMAL';
        }
        break;

      case 'VERB': {
        const option = b;
        this.emit('negotiation', this.verb, option);
        // Auto-handle GMCP: if server sends WILL GMCP, respond DO GMCP
        // Caller handles this via 'negotiation' event or 'needsResponse'
        this.state = 'NORMAL';
        break;
      }

      case 'SB':
        if (b === GMCP) {
          this.gmcpBuf = [];
          this.state = 'SB_GMCP';
        } else {
          // Unknown subnegotiation — skip until IAC SE
          this.state = 'SB';
        }
        break;

      case 'SB_GMCP':
        if (b === IAC) {
          this.state = 'SB_IAC';
        } else {
          this.gmcpBuf.push(b);
        }
        break;

      case 'SB_IAC':
        if (b === SE) {
          // End of subnegotiation
          const raw = Buffer.from(this.gmcpBuf);
          this.gmcpBuf = [];
          this.emit('gmcp', { raw } as GmcpPacket);
          this.state = 'NORMAL';
        } else if (b === IAC) {
          // Escaped 0xFF inside SB payload
          this.gmcpBuf.push(0xFF);
          this.state = 'SB_GMCP';
        } else {
          // Malformed — discard
          this.gmcpBuf = [];
          this.state = 'NORMAL';
        }
        break;
    }
  }
}
