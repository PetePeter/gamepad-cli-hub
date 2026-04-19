/**
 * Default chipbar Save Plan config regression tests.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import YAML from 'yaml';

describe('default chipbar Save Plan config', () => {
  it('writes plans to the incoming inbox with a full detailed description contract', () => {
    const profilePath = path.join(process.cwd(), 'config', 'profiles', 'default.yaml');
    const profile = YAML.parse(fs.readFileSync(profilePath, 'utf8')) as {
      chipActions?: Array<{ label: string; sequence: string }>;
    };

    const action = profile.chipActions?.find(entry => entry.label === '💾 Save Plan');
    expect(action).toBeDefined();

    const sequence = action!.sequence;
    expect(sequence).toContain('{inboxDir}');
    expect(sequence).not.toContain('{plansDir}/');
    expect(sequence).toContain('Write exactly one JSON file into {inboxDir}/');
    expect(sequence).toContain('description (a full detailed plan body, not a TLDR or one-line summary)');
    expect(sequence).toContain('Objective');
    expect(sequence).toContain('Context');
    expect(sequence).toContain('Approach');
    expect(sequence).toContain('Steps');
    expect(sequence).toContain('Acceptance Criteria');
    expect(sequence).toContain('Description must not be just a summary line');
  });
});
