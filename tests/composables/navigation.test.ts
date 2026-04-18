/**
 * Phase 6 — Navigation composable tests.
 *
 * Tests the useNavigation composable that replaces the 11-deep if-chain
 * in navigation.ts with a reactive modal stack pattern.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock vue at module level — composable uses ref/computed
vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue');
  return {
    ...actual,
    onMounted: vi.fn((fn: () => void) => fn()),
    onUnmounted: vi.fn(),
  };
});

import { useNavigation } from '../../renderer/composables/useNavigation.js';
import { useModalStack } from '../../renderer/composables/useModalStack.js';

describe('useNavigation', () => {
  let nav: ReturnType<typeof useNavigation>;

  beforeEach(() => {
    // Clear modal stack state between tests
    const ms = useModalStack();
    ms.clear();
    nav = useNavigation();
  });

  // =========================================================================
  // Basic state
  // =========================================================================

  it('starts with sessions screen', () => {
    expect(nav.currentScreen.value).toBe('sessions');
  });

  it('starts with terminal view', () => {
    expect(nav.currentView.value).toBe('terminal');
  });

  it('starts with zero gamepads', () => {
    expect(nav.gamepadCount.value).toBe(0);
  });

  it('starts with empty last button', () => {
    expect(nav.lastButton.value).toBe('');
  });

  // =========================================================================
  // State mutations
  // =========================================================================

  it('showScreen switches screen', () => {
    nav.showScreen('settings');
    expect(nav.currentScreen.value).toBe('settings');
  });

  it('showView switches right-panel view', () => {
    nav.showView('overview');
    expect(nav.currentView.value).toBe('overview');
  });

  it('setGamepadCount updates count', () => {
    nav.setGamepadCount(2);
    expect(nav.gamepadCount.value).toBe(2);
  });

  // =========================================================================
  // Sandwich button
  // =========================================================================

  it('Sandwich button calls sandwich handler', () => {
    const fn = vi.fn();
    nav.setSandwichHandler(fn);
    nav.handleButton('Sandwich');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('Sandwich button does not propagate to screen handlers', () => {
    const screenHandler = { handleButton: vi.fn(() => true) };
    nav.registerScreen('sessions', screenHandler);
    nav.setSandwichHandler(vi.fn());
    nav.handleButton('Sandwich');
    expect(screenHandler.handleButton).not.toHaveBeenCalled();
  });

  // =========================================================================
  // Modal stack interception
  // =========================================================================

  it('routes to modal stack when modals are open', () => {
    const handler = vi.fn(() => true);
    nav.modalStack.push({ id: 'test-modal', handler });
    nav.handleButton('A');
    expect(handler).toHaveBeenCalledWith('A');
  });

  it('modal stack prevents screen handler from receiving input', () => {
    const screenHandler = { handleButton: vi.fn(() => true) };
    nav.registerScreen('sessions', screenHandler);
    const modalHandler = vi.fn(() => true);
    nav.modalStack.push({ id: 'blocker', handler: modalHandler });
    nav.handleButton('A');
    expect(modalHandler).toHaveBeenCalledWith('A');
    expect(screenHandler.handleButton).not.toHaveBeenCalled();
  });

  it('modal stack prevents config binding fallback', () => {
    const configFn = vi.fn();
    nav.setConfigBindingHandler(configFn);
    nav.modalStack.push({ id: 'blocker', handler: () => true });
    nav.handleButton('A');
    expect(configFn).not.toHaveBeenCalled();
  });

  it('input flows to screen handler when modal stack is empty', () => {
    const screenHandler = { handleButton: vi.fn(() => true) };
    nav.registerScreen('sessions', screenHandler);
    nav.handleButton('A');
    expect(screenHandler.handleButton).toHaveBeenCalledWith('A');
  });

  // =========================================================================
  // Screen routing
  // =========================================================================

  it('routes to sessions screen handler', () => {
    const handler = { handleButton: vi.fn(() => true) };
    nav.registerScreen('sessions', handler);
    nav.handleButton('DpadUp');
    expect(handler.handleButton).toHaveBeenCalledWith('DpadUp');
  });

  it('routes to settings screen handler', () => {
    const handler = { handleButton: vi.fn(() => true) };
    nav.registerScreen('settings', handler);
    nav.showScreen('settings');
    nav.handleButton('DpadDown');
    expect(handler.handleButton).toHaveBeenCalledWith('DpadDown');
  });

  // =========================================================================
  // View routing (right panel)
  // =========================================================================

  it('routes to plan view handler when currentView is plan', () => {
    const planHandler = { handleButton: vi.fn(() => true) };
    const sessionsHandler = { handleButton: vi.fn(() => true) };
    nav.registerView('plan', planHandler);
    nav.registerScreen('sessions', sessionsHandler);
    nav.showView('plan');
    nav.handleButton('B');
    expect(planHandler.handleButton).toHaveBeenCalledWith('B');
    expect(sessionsHandler.handleButton).not.toHaveBeenCalled();
  });

  it('routes to overview view handler when currentView is overview', () => {
    const overviewHandler = { handleButton: vi.fn(() => true) };
    nav.registerView('overview', overviewHandler);
    nav.showView('overview');
    nav.handleButton('DpadUp');
    expect(overviewHandler.handleButton).toHaveBeenCalledWith('DpadUp');
  });

  it('falls through from view to sessions when view handler returns false', () => {
    const planHandler = { handleButton: vi.fn(() => false) };
    const sessionsHandler = { handleButton: vi.fn(() => true) };
    nav.registerView('plan', planHandler);
    nav.registerScreen('sessions', sessionsHandler);
    nav.showView('plan');
    nav.handleButton('A');
    expect(planHandler.handleButton).toHaveBeenCalledWith('A');
    expect(sessionsHandler.handleButton).toHaveBeenCalledWith('A');
  });

  it('does not use view handler for terminal view (default — handled by sessions)', () => {
    const sessionsHandler = { handleButton: vi.fn(() => true) };
    nav.registerScreen('sessions', sessionsHandler);
    nav.handleButton('A');
    expect(sessionsHandler.handleButton).toHaveBeenCalledWith('A');
  });

  // =========================================================================
  // Config binding fallback
  // =========================================================================

  it('falls through to config binding when screen handler returns false', () => {
    const screenHandler = { handleButton: vi.fn(() => false) };
    const configFn = vi.fn();
    nav.registerScreen('sessions', screenHandler);
    nav.setConfigBindingHandler(configFn);
    nav.handleButton('RightTrigger');
    expect(configFn).toHaveBeenCalledWith('RightTrigger');
  });

  it('does not call config binding when screen handler returns true', () => {
    const screenHandler = { handleButton: vi.fn(() => true) };
    const configFn = vi.fn();
    nav.registerScreen('sessions', screenHandler);
    nav.setConfigBindingHandler(configFn);
    nav.handleButton('DpadUp');
    expect(configFn).not.toHaveBeenCalled();
  });

  it('falls through to config binding when no screen handler registered', () => {
    const configFn = vi.fn();
    nav.setConfigBindingHandler(configFn);
    nav.handleButton('Y');
    expect(configFn).toHaveBeenCalledWith('Y');
  });

  // =========================================================================
  // Release handling
  // =========================================================================

  it('handleRelease calls config release handler', () => {
    const releaseFn = vi.fn();
    nav.setConfigReleaseHandler(releaseFn);
    nav.handleRelease('A');
    expect(releaseFn).toHaveBeenCalledWith('A');
  });

  it('handleRelease is no-op without handler', () => {
    // Should not throw
    nav.handleRelease('A');
  });

  // =========================================================================
  // Last button tracking
  // =========================================================================

  it('updates lastButton on each press', () => {
    nav.handleButton('A');
    expect(nav.lastButton.value).toBe('A');
    nav.handleButton('B');
    expect(nav.lastButton.value).toBe('B');
  });

  // =========================================================================
  // Multiple modals (stack depth)
  // =========================================================================

  it('nested modals: only topmost gets input', () => {
    const bottom = vi.fn(() => true);
    const top = vi.fn(() => true);
    nav.modalStack.push({ id: 'bottom', handler: bottom });
    nav.modalStack.push({ id: 'top', handler: top });
    nav.handleButton('A');
    expect(top).toHaveBeenCalledWith('A');
    expect(bottom).not.toHaveBeenCalled();
  });

  it('popping top modal exposes next modal', () => {
    const bottom = vi.fn(() => true);
    const top = vi.fn(() => true);
    nav.modalStack.push({ id: 'bottom', handler: bottom });
    nav.modalStack.push({ id: 'top', handler: top });
    nav.modalStack.pop('top');
    nav.handleButton('A');
    expect(bottom).toHaveBeenCalledWith('A');
  });

  it('popping all modals restores screen routing', () => {
    const screenHandler = { handleButton: vi.fn(() => true) };
    nav.registerScreen('sessions', screenHandler);
    nav.modalStack.push({ id: 'modal', handler: vi.fn(() => true) });
    nav.modalStack.pop('modal');
    nav.handleButton('A');
    expect(screenHandler.handleButton).toHaveBeenCalledWith('A');
  });

  // =========================================================================
  // Edge cases
  // =========================================================================

  it('handles no handlers registered gracefully', () => {
    // Should not throw
    nav.handleButton('A');
    nav.handleRelease('A');
  });

  it('Sandwich still works when modal is open', () => {
    const sandwichFn = vi.fn();
    nav.setSandwichHandler(sandwichFn);
    nav.modalStack.push({ id: 'blocker', handler: vi.fn(() => true) });
    nav.handleButton('Sandwich');
    expect(sandwichFn).toHaveBeenCalledOnce();
  });

  it('settings screen ignores view handlers', () => {
    const planHandler = { handleButton: vi.fn(() => true) };
    const settingsHandler = { handleButton: vi.fn(() => true) };
    nav.registerView('plan', planHandler);
    nav.registerScreen('settings', settingsHandler);
    nav.showScreen('settings');
    nav.showView('plan');
    nav.handleButton('A');
    expect(settingsHandler.handleButton).toHaveBeenCalledWith('A');
    expect(planHandler.handleButton).not.toHaveBeenCalled();
  });
});
