/**
 * Default chipbar Save Plan config regression tests.
 *
 * Uses a self-contained fixture rather than the seed default.yaml (which is
 * minimal) or the runtime profile in APPDATA (user data, not repo state).
 */

import { describe, it, expect } from 'vitest';

const SAVE_PLAN_SEQUENCE = `Write exactly one JSON file into {inboxDir}/ and do not write it anywhere else. Name it <encodeURIComponent("{cwd}")>@<uuid-v4>.json. The JSON must contain: id (uuid-v4), dirPath ("{cwd}"), title (short, specific), description (a full detailed plan body, not a TLDR or one-line summary), status ("startable"), createdAt and updatedAt (Date.now()). In description, include concrete sections titled Objective, Context, Approach, Steps, and Acceptance Criteria, each with substantive content tailored to the task. Description must not be just a summary line. Output only the file contents needed for that single JSON plan item and save it in the inbox folder.{Enter}`;

describe('default chipbar Save Plan config', () => {
  it('writes plans to the incoming inbox with a full detailed description contract', () => {
    const sequence = SAVE_PLAN_SEQUENCE;
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
