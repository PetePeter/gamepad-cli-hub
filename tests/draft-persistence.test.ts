/**
 * Draft persistence unit tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as YAML from 'yaml';
import type { DraftPrompt } from '../src/types/session.js';

// Mock fs so we never touch the real filesystem
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

// Mock logger to silence output during tests
vi.mock('../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import { saveDrafts, loadDrafts } from '../src/session/persistence.js';

const mockDraft: DraftPrompt = {
  id: 'draft-1',
  sessionId: 's1',
  label: 'Fix bug',
  text: 'Please fix the null check',
  createdAt: 1700000000000,
};

const mockDraft2: DraftPrompt = {
  id: 'draft-2',
  sessionId: 's2',
  label: 'Add feature',
  text: 'Implement the new feature',
  createdAt: 1700000001000,
};

describe('draft persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('saveDrafts', () => {
    it('writes YAML file', () => {
      const drafts: Record<string, DraftPrompt[]> = {
        's1': [mockDraft],
        's2': [mockDraft2],
      };

      saveDrafts(drafts);

      expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
      const [, content] = (fs.writeFileSync as any).mock.calls[0];
      const parsed = YAML.parse(content);
      expect(parsed.drafts).toBeDefined();
      expect(parsed.drafts['s1']).toHaveLength(1);
      expect(parsed.drafts['s1'][0].id).toBe('draft-1');
      expect(parsed.drafts['s2']).toHaveLength(1);
      expect(parsed.drafts['s2'][0].id).toBe('draft-2');
    });
  });

  describe('loadDrafts', () => {
    it('reads YAML file', () => {
      (fs.existsSync as any).mockReturnValue(true);
      (fs.readFileSync as any).mockReturnValue(
        YAML.stringify({ drafts: { 's1': [mockDraft] } }),
      );

      const result = loadDrafts();

      expect(result['s1']).toHaveLength(1);
      expect(result['s1'][0].id).toBe('draft-1');
      expect(result['s1'][0].label).toBe('Fix bug');
    });

    it('returns empty object when file does not exist', () => {
      (fs.existsSync as any).mockReturnValue(false);

      expect(loadDrafts()).toEqual({});
    });

    it('returns empty object on parse error', () => {
      (fs.existsSync as any).mockReturnValue(true);
      (fs.readFileSync as any).mockImplementation(() => {
        throw new Error('bad encoding');
      });

      expect(loadDrafts()).toEqual({});
    });
  });

  describe('round-trip', () => {
    it('save then load preserves data', () => {
      const drafts: Record<string, DraftPrompt[]> = {
        's1': [mockDraft],
        's2': [mockDraft2],
      };

      saveDrafts(drafts);

      // Capture what was written and feed it back to loadDrafts
      const [, writtenContent] = (fs.writeFileSync as any).mock.calls[0];
      (fs.existsSync as any).mockReturnValue(true);
      (fs.readFileSync as any).mockReturnValue(writtenContent);

      const loaded = loadDrafts();

      expect(loaded['s1']).toHaveLength(1);
      expect(loaded['s1'][0]).toEqual(mockDraft);
      expect(loaded['s2']).toHaveLength(1);
      expect(loaded['s2'][0]).toEqual(mockDraft2);
    });
  });
});
