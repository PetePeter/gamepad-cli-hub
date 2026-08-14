/**
 * Session lock toggle — the user-facing way to protect a session from closure.
 *
 * The lock flag, its persistence, and close enforcement already existed; only
 * MCP could set it, so the card showed a dead 🔒 badge and nothing else. These
 * cover the control itself against the real component.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import SessionCard from '../../../renderer/components/sidebar/SessionCard.vue';

function mountCard(locked: boolean, isFocused = false, focusColumn = 0) {
  return mount(SessionCard, {
    props: {
      session: { id: 's1', name: 'worker', cliType: 'claude-code', locked },
      navIndex: 0,
      isFocused,
      focusColumn,
      isActive: false,
      isEditing: false,
      sessionState: 'idle',
      activityLevel: 'idle',
      draftCount: 0,
      artifactCount: 0,
      elapsedText: '0s',
      isSnappedOut: false,
      llmNotifications: [],
      shortcutKey: null,
    } as never,
  });
}

describe('SessionCard lock toggle', () => {
  it('offers an open padlock when the session is unlocked', () => {
    const w = mountCard(false);
    expect(w.find('.session-lock').text()).toBe('🔓');
  });

  it('shows a closed padlock and disables close when locked', () => {
    const w = mountCard(true);
    expect(w.find('.session-lock').text()).toBe('🔒');
    expect(w.find('.session-close').attributes('disabled')).toBeDefined();
  });

  it('asks to lock an unlocked session', async () => {
    const w = mountCard(false);

    await w.find('.session-lock').trigger('click');

    expect(w.emitted('toggleLock')?.[0]).toEqual(['s1', true]);
  });

  it('asks to unlock a locked session', async () => {
    const w = mountCard(true);

    await w.find('.session-lock').trigger('click');

    expect(w.emitted('toggleLock')?.[0]).toEqual(['s1', false]);
  });

  it('does not select the session when the padlock is clicked', async () => {
    const w = mountCard(false);

    await w.find('.session-lock').trigger('click');

    expect(w.emitted('click')).toBeUndefined();
  });

  it('takes gamepad column 5, leaving the existing 1-4 numbering alone', () => {
    const onLock = mountCard(false, true, 5);
    expect(onLock.find('.session-lock').classes()).toContain('card-col-focused');
    expect(onLock.find('.session-close').classes()).not.toContain('card-col-focused');

    const onClose = mountCard(false, true, 4);
    expect(onClose.find('.session-close').classes()).toContain('card-col-focused');
  });
});
