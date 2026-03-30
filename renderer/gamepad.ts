/**
 * Gamepad polling using Browser API
 *
 * Works with Bluetooth Xbox controllers that Windows.Gaming.Input doesn't detect.
 * Polls navigator.getGamepads() and forwards events to main process via IPC.
 */

interface BrowserButtonEvent {
  button: string;
  gamepadIndex: number;
  timestamp: number;
}

type ButtonCallback = (event: BrowserButtonEvent) => void;

export interface RepeatConfig {
  dpad: { initialDelay: number; repeatRate: number };
  sticks: {
    left: { deadzone: number; repeatRate: number };
    right: { deadzone: number; repeatRate: number };
  };
}

class BrowserGamepadPoller {
  private pollInterval: number | null = null;
  private pollMs = 16; // ~60fps
  private buttonStates: Map<number, boolean[]> = new Map();
  private lastPressTime: Map<string, number> = new Map();
  private debounceMs = 250;
  private callbacks: Set<ButtonCallback> = new Set();
  private releaseCallbacks: Set<ButtonCallback> = new Set();
  private connectedCount = 0;
  private eventsSetup = false;

  private repeatConfig: RepeatConfig = {
    dpad: { initialDelay: 400, repeatRate: 120 },
    sticks: {
      left: { deadzone: 0.25, repeatRate: 100 },
      right: { deadzone: 0.25, repeatRate: 150 },
    },
  };

  /** Tracks when each repeatable button was first held and when it last repeated */
  private repeatState: Map<string, { pressTime: number; lastRepeatTime: number }> = new Map();

  private static readonly REPEATABLE_BUTTONS = new Set([
    'DPadUp', 'DPadDown', 'DPadLeft', 'DPadRight',
    'LeftStickUp', 'LeftStickDown', 'LeftStickLeft', 'LeftStickRight',
    'RightStickUp', 'RightStickDown', 'RightStickLeft', 'RightStickRight',
  ]);

  constructor() {
    // Don't set up event listeners here - wait for start()
    // This ensures callbacks are registered before events fire
  }

  setRepeatConfig(config: RepeatConfig): void {
    this.repeatConfig = config;
  }

  getRepeatConfig(): RepeatConfig {
    return this.repeatConfig;
  }

  private setupEvents(): void {
    if (this.eventsSetup) return;

    console.log('[BrowserGamepad] Setting up event listeners');

    // Listen for gamepad connect/disconnect events
    window.addEventListener('gamepadconnected', (e) => {
      console.log('[BrowserGamepad] Connected:', e.gamepad.id, e.gamepad);
      this.connectedCount = navigator.getGamepads().filter(g => g).length;
      this.emitConnectionEvent(true);
    });

    window.addEventListener('gamepaddisconnected', (e) => {
      console.log('[BrowserGamepad] Disconnected:', e.gamepad.id);
      // Release all tracked buttons (physical + D-pad + virtual sticks) on disconnect
      const index = e.gamepad.index;
      const prevState = this.buttonStates.get(index);
      if (prevState) {
        const allButtons: Array<{ idx: number; name: string }> = [
          { idx: 0, name: 'A' }, { idx: 1, name: 'B' },
          { idx: 2, name: 'X' }, { idx: 3, name: 'Y' },
          { idx: 4, name: 'LeftBumper' }, { idx: 5, name: 'RightBumper' },
          { idx: 6, name: 'LeftTrigger' }, { idx: 7, name: 'RightTrigger' },
          { idx: 8, name: 'Back' }, { idx: 9, name: 'Sandwich' },
          { idx: 10, name: 'LeftStick' }, { idx: 11, name: 'RightStick' },
          { idx: 12, name: 'DPadUp' }, { idx: 13, name: 'DPadDown' },
          { idx: 14, name: 'DPadLeft' }, { idx: 15, name: 'DPadRight' },
          { idx: 20, name: 'LeftStickUp' }, { idx: 21, name: 'LeftStickDown' },
          { idx: 22, name: 'LeftStickLeft' }, { idx: 23, name: 'LeftStickRight' },
          { idx: 24, name: 'RightStickUp' }, { idx: 25, name: 'RightStickDown' },
          { idx: 26, name: 'RightStickLeft' }, { idx: 27, name: 'RightStickRight' },
        ];
        for (const { idx, name } of allButtons) {
          if (prevState[idx]) {
            this.handleButtonRelease(name, index);
          }
        }
        this.buttonStates.delete(index);
      }
      this.connectedCount = navigator.getGamepads().filter(g => g).length;
      this.emitConnectionEvent(false);
    });

    this.eventsSetup = true;
  }

  private logGamepadState(): void {
    const gamepads = navigator.getGamepads();
    console.log('[BrowserGamepad] Initial state - gamepads:', gamepads);
    console.log('[BrowserGamepad] Length:', gamepads?.length);
    if (gamepads) {
      for (let i = 0; i < gamepads.length; i++) {
        const gp = gamepads[i];
        if (gp) {
          console.log(`[BrowserGamepad] Gamepad ${i}:`, {
            id: gp.id,
            buttons: gp.buttons.length,
            axes: gp.axes.length,
            connected: gp.connected,
            mapping: gp.mapping,
          });
        }
      }
    }
  }

  start(): void {
    if (this.pollInterval) return;

    console.log('[BrowserGamepad] Starting poller');
    this.setupEvents(); // Set up events before polling
    this.logGamepadState(); // Log again when starting

    this.pollInterval = window.setInterval(() => this.poll(), this.pollMs);
  }

  /** Call this after user interaction (click, keypress) to force detection */
  requestGamepadAccess(): void {
    console.log('[BrowserGamepad] Requesting gamepad access after user gesture');
    this.logGamepadState();

    const gamepads = navigator.getGamepads();
    const count = gamepads ? Array.from(gamepads).filter(g => g).length : 0;

    if (count > 0) {
      this.connectedCount = count;
      this.emitConnectionEvent(true);
    }
  }

  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      console.log('[BrowserGamepad] Stopped poller');
    }
  }

  onButton(callback: ButtonCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  onRelease(callback: ButtonCallback): () => void {
    this.releaseCallbacks.add(callback);
    return () => this.releaseCallbacks.delete(callback);
  }

  getCount(): number {
    return this.connectedCount;
  }

  private poll(): void {
    const gamepads = navigator.getGamepads();
    if (!gamepads) return;

    let hasConnected = false;
    for (let i = 0; i < gamepads.length; i++) {
      const gamepad = gamepads[i];
      if (!gamepad) continue;
      hasConnected = true;
      this.processGamepad(gamepad, i);
    }

    if (hasConnected) this.checkRepeats();
  }

  private processGamepad(gamepad: Gamepad, index: number): void {
    // Get previous state
    let prevState = this.buttonStates.get(index);
    if (!prevState) {
      prevState = new Array(Math.max(gamepad.buttons.length, 28)).fill(false);
      this.buttonStates.set(index, prevState);
      console.log('[BrowserGamepad] Initial state for gamepad', index, 'buttons:', gamepad.buttons.length);
    }

    // Standard Xbox button mapping
    const buttonMap: Array<number | { button: number; threshold: number }> = [
      0,                          // 0: A
      1,                          // 1: B
      2,                          // 2: X
      3,                          // 3: Y
      4,                          // 4: LeftBumper
      5,                          // 5: RightBumper
      { button: 6, threshold: 0.5 },  // 6: LeftTrigger (analog)
      { button: 7, threshold: 0.5 },  // 7: RightTrigger (analog)
      8,                          // 8: Back/Select
      9,                          // 9: Sandwich
      10,                         // 10: LeftStick press
      11,                         // 11: RightStick press
    ];

    const buttonNames: string[] = [
      'A', 'B', 'X', 'Y',
      'LeftBumper', 'RightBumper',
      'LeftTrigger', 'RightTrigger',
      'Back', 'Sandwich',
      'LeftStick', 'RightStick',
    ];

    // Check each button
    for (let i = 0; i < buttonMap.length; i++) {
      const mapping = buttonMap[i];
      const buttonIndex = typeof mapping === 'number' ? mapping : mapping.button;
      const threshold = typeof mapping === 'object' ? mapping.threshold : 0;

      const rawPressed = gamepad.buttons[buttonIndex]?.pressed ?? false;
      const value = gamepad.buttons[buttonIndex]?.value ?? 0;
      const pressed = rawPressed || value > threshold;

      // Log first few button states for debugging
      if (i < 4 && pressed) {
        console.log('[BrowserGamepad] Button', buttonNames[i], 'pressed. raw:', rawPressed, 'value:', value);
      }

      if (pressed !== prevState[i]) {
        prevState[i] = pressed;
        if (pressed) {
          this.handleButtonPress(buttonNames[i], index);
        } else {
          this.handleButtonRelease(buttonNames[i], index);
        }
      }
    }

    // Check D-pad (varies by controller - try axes first, then buttons)
    this.checkDpad(gamepad, index, prevState);

    // Left stick → virtual LeftStick* buttons (for config bindings + UI navigation)
    this.checkStickVirtualButtons(gamepad, index, prevState, 'left', 0, 1, 20);

    // Right stick → virtual RightStick* buttons (for config bindings)
    this.checkStickVirtualButtons(gamepad, index, prevState, 'right', 2, 3, 24);
  }

  /**
   * Emit virtual stick buttons (e.g. LeftStickUp, RightStickDown) for config binding dispatch.
   * stateOffset reserves 4 indices in prevState for up/down/left/right.
   */
  private checkStickVirtualButtons(
    gamepad: Gamepad, index: number, prevState: boolean[],
    side: 'left' | 'right', axisX: number, axisY: number, stateOffset: number,
  ): void {
    const threshold = side === 'left'
      ? this.repeatConfig.sticks.left.deadzone
      : this.repeatConfig.sticks.right.deadzone;
    const x = gamepad.axes[axisX] ?? 0;
    const y = gamepad.axes[axisY] ?? 0;

    const prefix = side === 'left' ? 'LeftStick' : 'RightStick';
    const directions: Array<{ active: boolean; name: string; stateIdx: number }> = [
      { active: y < -threshold, name: `${prefix}Up`, stateIdx: stateOffset },
      { active: y > threshold, name: `${prefix}Down`, stateIdx: stateOffset + 1 },
      { active: x < -threshold, name: `${prefix}Left`, stateIdx: stateOffset + 2 },
      { active: x > threshold, name: `${prefix}Right`, stateIdx: stateOffset + 3 },
    ];

    for (const { active, name, stateIdx } of directions) {
      const prev = prevState[stateIdx] ?? false;
      if (active !== prev) {
        prevState[stateIdx] = active;
        if (active) {
          this.handleButtonPress(name, index);
        } else {
          this.handleButtonRelease(name, index);
        }
      }
    }
  }

  private checkDpad(gamepad: Gamepad, index: number, prevState: boolean[]): void {
    // Some controllers put D-pad on axes 6-7 (as a hat)
    // Others use buttons 12-15

    // Try axes-based D-pad first (common on Xbox)
    const dpadUpIndex = 12;
    const dpadDownIndex = 13;
    const dpadLeftIndex = 14;
    const dpadRightIndex = 15;

    const dpadMap: Array<{ index: number; name: string }> = [
      { index: dpadUpIndex, name: 'DPadUp' },
      { index: dpadDownIndex, name: 'DPadDown' },
      { index: dpadLeftIndex, name: 'DPadLeft' },
      { index: dpadRightIndex, name: 'DPadRight' },
    ];

    for (const { index: btnIndex, name } of dpadMap) {
      const pressed = gamepad.buttons[btnIndex]?.pressed ?? false;
      const stateIndex = 12 + dpadMap.findIndex(d => d.index === btnIndex);

      if (pressed !== (prevState[stateIndex] ?? false)) {
        prevState[stateIndex] = pressed;
        if (pressed) {
          this.handleButtonPress(name, index);
        } else {
          this.handleButtonRelease(name, index);
        }
      }
    }
  }

  private handleButtonPress(button: string, gamepadIndex: number): void {
    console.log('[BrowserGamepad] Button pressed:', button, 'index:', gamepadIndex);

    const key = `${gamepadIndex}-${button}`;
    const now = Date.now();
    const lastPress = this.lastPressTime.get(key) ?? 0;

    if (now - lastPress < this.debounceMs) {
      console.log('[BrowserGamepad] Button debounced:', button);
      return;
    }

    this.lastPressTime.set(key, now);

    const event: BrowserButtonEvent = {
      button,
      gamepadIndex,
      timestamp: now,
    };

    console.log('[BrowserGamepad] Emitting event to', this.callbacks.size, 'callbacks');

    for (const callback of this.callbacks) {
      try {
        callback(event);
      } catch (error) {
        console.error('[BrowserGamepad] Callback error:', error);
      }
    }

    // Start repeat tracking for repeatable buttons
    if (BrowserGamepadPoller.REPEATABLE_BUTTONS.has(button)) {
      this.repeatState.set(key, { pressTime: now, lastRepeatTime: now });
    }
  }

  private handleButtonRelease(button: string, gamepadIndex: number): void {
    // Stop repeat tracking on release
    const repeatKey = `${gamepadIndex}-${button}`;
    this.repeatState.delete(repeatKey);

    const event: BrowserButtonEvent = {
      button,
      gamepadIndex,
      timestamp: Date.now(),
    };

    for (const callback of this.releaseCallbacks) {
      try {
        callback(event);
      } catch (error) {
        console.error('[BrowserGamepad] Release callback error:', error);
      }
    }
  }

  private checkRepeats(): void {
    const now = Date.now();

    for (const [key, state] of this.repeatState) {
      const [gamepadIndexStr, ...buttonParts] = key.split('-');
      const gamepadIndex = parseInt(gamepadIndexStr, 10);
      const button = buttonParts.join('-');

      const isDpad = button.startsWith('DPad');
      const isLeftStick = button.startsWith('LeftStick');

      let interval: number;

      if (isDpad) {
        const elapsed = now - state.pressTime;
        if (elapsed < this.repeatConfig.dpad.initialDelay) continue;
        interval = this.repeatConfig.dpad.repeatRate;
      } else {
        // Stick repeat — rate inversely proportional to displacement
        const side = isLeftStick ? 'left' : 'right';
        const stickConfig = this.repeatConfig.sticks[side];

        const gamepad = navigator.getGamepads()?.[gamepadIndex];
        if (!gamepad) continue;

        const axisX = isLeftStick ? 0 : 2;
        const axisY = isLeftStick ? 1 : 3;
        const x = gamepad.axes[axisX] ?? 0;
        const y = gamepad.axes[axisY] ?? 0;
        const magnitude = Math.sqrt(x * x + y * y);
        const clamped = Math.min(1, magnitude);

        if (clamped < stickConfig.deadzone) continue;

        // Quadratic: deadzone→1.0 maps to slowRate→fastRate with n² curve
        const normalised = (clamped - stickConfig.deadzone) / (1 - stickConfig.deadzone);
        const slowRate = 300;
        const fastRate = Math.max(stickConfig.repeatRate, 40);
        interval = slowRate - normalised * normalised * (slowRate - fastRate);
      }

      if (now - state.lastRepeatTime >= interval) {
        state.lastRepeatTime = now;

        const event: BrowserButtonEvent = { button, gamepadIndex, timestamp: now };
        for (const callback of this.callbacks) {
          try {
            callback(event);
          } catch (error) {
            console.error('[BrowserGamepad] Repeat callback error:', error);
          }
        }
      }
    }
  }

  private emitConnectionEvent(connected: boolean): void {
    console.log('[BrowserGamepad] emitConnectionEvent:', connected, 'count:', this.connectedCount);

    this.callbacks.forEach(cb => {
      cb({
        button: connected ? '_connected' : '_disconnected',
        gamepadIndex: 0,
        timestamp: Date.now(),
      });
    });
  }
}

export { BrowserGamepadPoller };
export const browserGamepad = new BrowserGamepadPoller();
