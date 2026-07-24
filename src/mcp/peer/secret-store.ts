/**
 * SecretStore — the ONLY home for raw peer PSK secret bytes.
 *
 * SECURITY CONTRACT: secret material must NEVER be written to logs and NEVER
 * appear in a thrown error message. All log lines and error messages reference
 * only the pskRef (an opaque handle), never the value. Secrets are held in
 * memory as Buffers and persisted base64-encoded in peer-secrets.yaml — nowhere
 * else (peers.yaml never carries secrets).
 *
 * Mirrors the injected-persist manager idiom: no disk access in the constructor;
 * the orchestrator hydrates via importAll and supplies the persist callback.
 */

import { EventEmitter } from 'node:events';
import { logger } from '../../utils/logger.js';

// Canonical base64: groups of 4 base64 chars, with 0/1/2 trailing '=' padding.
const CANONICAL_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export class SecretStore extends EventEmitter {
  // Stored base64 so persistence is a trivial passthrough and get() decodes.
  private secrets = new Map<string, string>();

  constructor(private readonly persist?: (secrets: Record<string, string>) => void) {
    super();
  }

  /** Store (or replace) the secret for `pskRef`, persist, and emit change. */
  set(pskRef: string, secret: Buffer): void {
    this.secrets.set(pskRef, secret.toString('base64'));
    this.markChanged();
    // NOTE: intentionally no value in the log line.
    logger.info(`[SecretStore] Stored secret for ref ${pskRef}`);
  }

  /**
   * Decode and return the secret for `pskRef`, or undefined if unknown. Throws a
   * ref-only error if the stored value is not canonical base64 (never echoing
   * the value, which could carry partial secret material).
   */
  get(pskRef: string): Buffer | undefined {
    const encoded = this.secrets.get(pskRef);
    if (encoded === undefined) return undefined;
    // Defence-in-depth: importAll already rejects non-canonical values, but a
    // value could be injected another way — never decode an unvalidated string.
    if (!isCanonicalBase64(encoded)) {
      throw new Error(`Corrupt secret for ref ${pskRef}: not canonical base64`);
    }
    return Buffer.from(encoded, 'base64');
  }

  /** Whether a secret exists for `pskRef`. */
  has(pskRef: string): boolean {
    return this.secrets.has(pskRef);
  }

  /** Remove the secret for `pskRef`. Returns whether one existed. */
  remove(pskRef: string): boolean {
    if (!this.secrets.has(pskRef)) return false;
    this.secrets.delete(pskRef);
    this.markChanged();
    logger.info(`[SecretStore] Removed secret for ref ${pskRef}`);
    return true;
  }

  /** Snapshot for persistence: { pskRef: base64Secret }. */
  exportAll(): Record<string, string> {
    return Object.fromEntries(this.secrets.entries());
  }

  /**
   * Replace state from persisted data. Fail-fast: only string ref → canonical
   * base64 value survive; non-canonical entries are SKIPPED at import (like
   * PinnedCertStore drops invalid pins) rather than throwing lazily mid-handshake
   * in get(). The skipped ref is logged (never the value).
   */
  importAll(secrets: Record<string, string>): void {
    this.secrets = new Map();
    if (secrets && typeof secrets === 'object') {
      for (const [ref, value] of Object.entries(secrets)) {
        if (typeof ref !== 'string' || ref.length === 0 || typeof value !== 'string') continue;
        if (!isCanonicalBase64(value)) {
          logger.warn(`[SecretStore] Skipping non-canonical secret for ref ${ref}`);
          continue;
        }
        this.secrets.set(ref, value);
      }
    }
    logger.info(`[SecretStore] Imported ${this.secrets.size} secret(s)`);
  }

  private markChanged(): void {
    this.persist?.(this.exportAll());
    this.emit('peer-secrets:changed');
  }
}

/**
 * True iff `value` is canonical base64: it matches the base64 grammar AND
 * survives a decode→re-encode round-trip (rejecting inputs Node would silently
 * coerce). Never logs or echoes the value.
 */
function isCanonicalBase64(value: string): boolean {
  if (!CANONICAL_BASE64.test(value)) return false;
  return Buffer.from(value, 'base64').toString('base64') === value;
}
