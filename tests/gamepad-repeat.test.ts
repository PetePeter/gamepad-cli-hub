/**
 * Gamepad D-pad & Stick Key Repeat Engine Tests
 *
 * Verifies that held D-pad/stick buttons fire repeated callbacks
 * with configurable delays and rates.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers: build a mock Gamepad object
// ---------------------------------------------------------------------------

function makeButton(pressed: boolean, value = pressed ? 1 : 0): GamepadButton {
  return { pressed, touched: pressed, value };
}

function makeGamepad(
  overrides: {
    index?: number;
    buttons?: Partial<Record<number, { pressed: boolean; value?: number }>>;
    axes?: number[];
  } = {},
): Gamepad {
  const idx = overrides.index ?? 0;
  const buttonsRaw = new Array(16).fill(null).map(() => makeButton(false));
  if (overrides.buttons) {
    for (const [i, b] of Object.entries(overrides.buttons)) {
      buttonsRaw[Number(i)] = makeButton(b!.pressed, b!.value ?? (b!.pressed ? 1 : 0));
    }
  }
  const axes = overrides.axes ?? [0, 0, 0, 0];

  return {
    id: 'Mock Gamepad',
    index: idx,
    connected: true,
    mapping: 'standard',
    buttons: buttonsRaw,
    axes,
    hapticActuators: [],
    vibrationActuator: null as any,
    timestamp: performance.now(),
  } as unknown as Gamepad;
}

// ---------------------------------------------------------------------------
// Global stubs — must be set BEFORE importing the module under test
// ---------------------------------------------------------------------------

const mockGamepads: (Gamepad | null)[] = [null, null, null, null];

vi.stubGlobal('navigator', {
  getGamepads: () => mockGamepads,
});

// Capture window.addEventListener registrations but delegate timer stubs to vitest
const windowEventListeners: Record<string, Function[]> = {};
const realWindow = globalThis.window ?? {};
vi.stubGlobal('window', {
  ...realWindow,
  addEventListener: (event: string, handler: Function) => {
    if (!windowEventListeners[event]) windowEventListeners[event] = [];
    windowEventListeners[event].push(handler);
  },
  setInterval: (...args: Parameters<typeof setInterval>) => setInterval(...args),
  clearInterval: (...args: Parameters<typeof clearInterval>) => clearInterval(...args),
});

// Must import AFTER stubs are in place
import { BrowserGamepadPoller } from '../renderer/gamepad.js';
import type { RepeatConfig } from '../renderer/gamepad.js';

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Gamepad Repeat Engine', () => {
  let poller: BrowserGamepadPoller;
  let events: Array<{ button: string; gamepadIndex: number }>;
  let unsubscribe: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    poller = new BrowserGamepadPoller();
    events = [];
    unsubscribe = poller.onButton((e) => {
      events.push({ button: e.button, gamepadIndex: e.gamepadIndex });
    });
    // Clear the mock gamepad slots
    mockGamepads.fill(null);
  });

  afterEach(() => {
    unsubscribe();
    poller.stop();
    vi.useRealTimers();
  });

  // Helper: set the mock gamepad and advance one poll tick (16ms)
  function setGamepad(gp: Gamepad | null, index = 0): void {
    mockGamepads[index] = gp;
  }

  function tick(ms = 16): void {
    vi.advanceTimersByTime(ms);
  }

  function startAndTick(ms = 16): void {
    poller.start();
    tick(ms);
  }

  // =========================================================================
  // 1. D-pad repeat fires after initial delay
  // =========================================================================
  describe('D-pad repeat', () => {
    it('fires after initial delay', () => {
      const gp = makeGamepad({ buttons: { 12: { pressed: true } } });
      setGamepad(gp);

      startAndTick(); // first poll — edge detect fires initial press
      const initialCount = events.filter(e => e.button === 'DPadUp').length;
      expect(initialCount).toBe(1);

      // Advance past initial delay (400ms default)
      tick(400);
      const afterDelay = events.filter(e => e.button === 'DPadUp').length;
      expect(afterDelay).toBeGreaterThan(initialCount);
    });

    // =========================================================================
    // 2. D-pad repeat does NOT fire during initial delay
    // =========================================================================
    it('does NOT fire during initial delay', () => {
      const gp = makeGamepad({ buttons: { 12: { pressed: true } } });
      setGamepad(gp);

      startAndTick(); // initial press
      const initialCount = events.filter(e => e.button === 'DPadUp').length;
      expect(initialCount).toBe(1);

      // Advance 300ms — still within 400ms initial delay
      tick(300);
      const duringDelay = events.filter(e => e.button === 'DPadUp').length;
      expect(duringDelay).toBe(initialCount);
    });

    // =========================================================================
    // 3. D-pad repeat fires at repeatRate after initial delay
    // =========================================================================
    it('fires at repeatRate after initial delay', () => {
      const gp = makeGamepad({ buttons: { 12: { pressed: true } } });
      setGamepad(gp);

      startAndTick(); // initial press at t=16
      expect(events.filter(e => e.button === 'DPadUp').length).toBe(1);

      // Advance to just past initial delay (400ms)
      tick(400);
      const afterInitial = events.filter(e => e.button === 'DPadUp').length;
      expect(afterInitial).toBeGreaterThan(1);

      // Advance another repeatRate period (120ms + poll alignment margin)
      const countBefore = events.filter(e => e.button === 'DPadUp').length;
      tick(144); // 9 poll ticks (144ms) > 120ms repeatRate
      const countAfter = events.filter(e => e.button === 'DPadUp').length;
      expect(countAfter).toBeGreaterThan(countBefore);
    });
  });

  // =========================================================================
  // 4. Stick repeat rate scales with displacement
  // =========================================================================
  describe('Stick repeat', () => {
    it('scales rate with displacement', () => {
      // 50% deflection on left stick Y axis (down)
      const gp50 = makeGamepad({ axes: [0, 0.5, 0, 0] });
      setGamepad(gp50);

      startAndTick(); // initial press
      expect(events.filter(e => e.button === 'LeftStickDown').length).toBe(1);

      // Advance enough time for slow repeat (300ms max)
      events.length = 0;
      tick(320);
      const count50 = events.filter(e => e.button === 'LeftStickDown').length;
      expect(count50).toBeGreaterThanOrEqual(1);

      // Now test at full deflection — should repeat faster
      poller.stop();
      events.length = 0;
      const poller2 = new BrowserGamepadPoller();
      const events2: Array<{ button: string }> = [];
      const unsub2 = poller2.onButton(e => events2.push({ button: e.button }));

      const gp100 = makeGamepad({ axes: [0, 1.0, 0, 0] });
      setGamepad(gp100);

      poller2.start();
      tick(16); // initial press
      expect(events2.filter(e => e.button === 'LeftStickDown').length).toBe(1);

      // Advance 320ms same as above — full deflection should have more repeats
      events2.length = 0;
      tick(320);
      const count100 = events2.filter(e => e.button === 'LeftStickDown').length;
      expect(count100).toBeGreaterThan(count50);

      unsub2();
      poller2.stop();
    });

    // =========================================================================
    // 5. Stick below deadzone does not repeat
    // =========================================================================
    it('does not repeat below deadzone', () => {
      // 0.1 deflection — below default 0.25 deadzone
      const gp = makeGamepad({ axes: [0, 0.1, 0, 0] });
      setGamepad(gp);

      startAndTick(); // no edge detect should fire (below threshold)
      expect(events.filter(e => e.button === 'LeftStickDown').length).toBe(0);

      // Advance well past any delay
      tick(1000);
      expect(events.filter(e => e.button === 'LeftStickDown').length).toBe(0);
    });
  });

  // =========================================================================
  // 6. Release stops repeat
  // =========================================================================
  it('release stops repeat', () => {
    const gpPressed = makeGamepad({ buttons: { 12: { pressed: true } } });
    const gpReleased = makeGamepad({ buttons: { 12: { pressed: false } } });

    setGamepad(gpPressed);
    startAndTick(); // initial press
    expect(events.filter(e => e.button === 'DPadUp').length).toBe(1);

    // Release the button before initial delay expires
    setGamepad(gpReleased);
    tick(16); // release edge detected

    // Advance well past initial delay
    tick(1000);
    // Should only have the initial press (no repeats after release)
    expect(events.filter(e => e.button === 'DPadUp').length).toBe(1);
  });

  // =========================================================================
  // 7. Config changes apply
  // =========================================================================
  it('config changes apply to repeat behaviour', () => {
    const customConfig: RepeatConfig = {
      dpad: { initialDelay: 100, repeatRate: 50 },
      sticks: {
        left: { deadzone: 0.25, repeatRate: 100 },
        right: { deadzone: 0.25, repeatRate: 150 },
      },
    };
    poller.setRepeatConfig(customConfig);
    expect(poller.getRepeatConfig()).toBe(customConfig);

    const gp = makeGamepad({ buttons: { 12: { pressed: true } } });
    setGamepad(gp);

    startAndTick(); // initial press
    expect(events.filter(e => e.button === 'DPadUp').length).toBe(1);

    // With initialDelay=100, repeat should NOT fire at 80ms
    tick(80);
    expect(events.filter(e => e.button === 'DPadUp').length).toBe(1);

    // But SHOULD fire shortly after 100ms (next poll tick)
    tick(40); // now at ~136ms total after press
    expect(events.filter(e => e.button === 'DPadUp').length).toBeGreaterThan(1);

    // With repeatRate=50, should fire again within 50ms + poll tick
    const countBefore = events.filter(e => e.button === 'DPadUp').length;
    tick(64); // 4 poll ticks = 64ms > 50ms repeatRate
    const countAfter = events.filter(e => e.button === 'DPadUp').length;
    expect(countAfter).toBeGreaterThan(countBefore);
  });

  // =========================================================================
  // 8. Multiple simultaneous directions
  // =========================================================================
  it('multiple D-pad directions repeat independently', () => {
    // Hold DPadUp (12) and DPadRight (15) simultaneously
    const gp = makeGamepad({
      buttons: {
        12: { pressed: true },
        15: { pressed: true },
      },
    });
    setGamepad(gp);

    startAndTick(); // initial press for both
    expect(events.filter(e => e.button === 'DPadUp').length).toBe(1);
    expect(events.filter(e => e.button === 'DPadRight').length).toBe(1);

    // Advance past initial delay
    tick(416); // past 400ms initial delay
    const upCount = events.filter(e => e.button === 'DPadUp').length;
    const rightCount = events.filter(e => e.button === 'DPadRight').length;
    expect(upCount).toBeGreaterThan(1);
    expect(rightCount).toBeGreaterThan(1);
  });

  // =========================================================================
  // 9. Stick deadzone from config replaces hardcoded threshold
  // =========================================================================
  it('stick deadzone from config replaces hardcoded threshold', () => {
    poller.setRepeatConfig({
      dpad: { initialDelay: 400, repeatRate: 120 },
      sticks: {
        left: { deadzone: 0.3, repeatRate: 100 },
        right: { deadzone: 0.25, repeatRate: 150 },
      },
    });

    // Stick at 0.25 — would pass old 0.5 threshold: no. Would pass old default 0.25: yes.
    // But with deadzone=0.3, should NOT activate.
    const gp = makeGamepad({ axes: [0, 0.28, 0, 0] });
    setGamepad(gp);

    startAndTick();
    expect(events.filter(e => e.button === 'LeftStickDown').length).toBe(0);

    tick(1000);
    expect(events.filter(e => e.button === 'LeftStickDown').length).toBe(0);

    // Now push past the 0.3 deadzone
    const gp2 = makeGamepad({ axes: [0, 0.35, 0, 0] });
    setGamepad(gp2);
    tick(16);
    expect(events.filter(e => e.button === 'LeftStickDown').length).toBe(1);
  });

  // =========================================================================
  // 10. Repeat events bypass debounce
  // =========================================================================
  it('repeat events bypass debounce', () => {
    // Use fast config so repeats happen quickly
    poller.setRepeatConfig({
      dpad: { initialDelay: 50, repeatRate: 30 },
      sticks: {
        left: { deadzone: 0.25, repeatRate: 100 },
        right: { deadzone: 0.25, repeatRate: 150 },
      },
    });

    const gp = makeGamepad({ buttons: { 12: { pressed: true } } });
    setGamepad(gp);

    startAndTick(); // initial press
    expect(events.filter(e => e.button === 'DPadUp').length).toBe(1);

    // Repeats should fire even within the 250ms debounce window
    // At t=16 + 50 + 30 = 96ms, well within 250ms debounce
    tick(100);
    const repeatCount = events.filter(e => e.button === 'DPadUp').length;
    expect(repeatCount).toBeGreaterThan(1);
  });

  // =========================================================================
  // 11. Non-repeatable buttons do not repeat
  // =========================================================================
  it('non-repeatable buttons do not repeat', () => {
    // Button A (index 0) is not repeatable
    const gp = makeGamepad({ buttons: { 0: { pressed: true } } });
    setGamepad(gp);

    startAndTick(); // initial press
    expect(events.filter(e => e.button === 'A').length).toBe(1);

    // Advance well past any delay
    tick(1000);
    // Should still be just the initial press
    expect(events.filter(e => e.button === 'A').length).toBe(1);
  });

  // =========================================================================
  // 12. Quadratic acceleration curve
  // =========================================================================
  describe('Quadratic acceleration', () => {
    it('uses quadratic curve — full deflection repeats faster than half', () => {
      // Configure with known repeatRate
      poller.setRepeatConfig({
        dpad: { initialDelay: 400, repeatRate: 120 },
        sticks: {
          left: { deadzone: 0.25, repeatRate: 60 },
          right: { deadzone: 0.25, repeatRate: 60 },
        },
      });

      // Test at 50% deflection (above 0.25 deadzone)
      const gp50 = makeGamepad({ axes: [0, 0.625, 0, 0] }); // normalised = 0.5
      setGamepad(gp50);
      startAndTick();
      events.length = 0;
      tick(600);
      const count50 = events.filter(e => e.button === 'LeftStickDown').length;

      // Test at full deflection
      poller.stop();
      events.length = 0;
      const poller2 = new BrowserGamepadPoller();
      poller2.setRepeatConfig({
        dpad: { initialDelay: 400, repeatRate: 120 },
        sticks: {
          left: { deadzone: 0.25, repeatRate: 60 },
          right: { deadzone: 0.25, repeatRate: 60 },
        },
      });
      const events2: Array<{ button: string }> = [];
      const unsub2 = poller2.onButton(e => events2.push({ button: e.button }));

      const gp100 = makeGamepad({ axes: [0, 1.0, 0, 0] }); // normalised = 1.0
      setGamepad(gp100);
      poller2.start();
      tick(16);
      events2.length = 0;
      tick(600);
      const count100 = events2.filter(e => e.button === 'LeftStickDown').length;

      // Quadratic: full deflection should produce significantly more repeats
      expect(count100).toBeGreaterThan(count50);

      unsub2();
      poller2.stop();
    });

    it('respects 40ms minimum interval cap', () => {
      // Set repeatRate to 20 (below 40ms minimum)
      poller.setRepeatConfig({
        dpad: { initialDelay: 400, repeatRate: 120 },
        sticks: {
          left: { deadzone: 0.25, repeatRate: 20 },
          right: { deadzone: 0.25, repeatRate: 20 },
        },
      });

      const gp = makeGamepad({ axes: [0, 1.0, 0, 0] }); // full deflection
      setGamepad(gp);
      startAndTick();
      events.length = 0;

      // At full deflection with quadratic, interval = slowRate - 1*1*(300-40) = 40ms
      // In 320ms we expect ~8 repeats (320/40)
      tick(320);
      const count = events.filter(e => e.button === 'LeftStickDown').length;
      // With 40ms floor and 16ms poll tick, expect at least 4 repeats in 320ms
      expect(count).toBeGreaterThanOrEqual(4);
      // But not more than 20 (which would indicate no floor)
      expect(count).toBeLessThanOrEqual(20);
    });
  });
});
