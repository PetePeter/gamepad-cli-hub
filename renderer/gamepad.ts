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
  private lastAxesDiagLog = 0;

  /** Tolerance for matching hat switch axis values to known directions */
  private static readonly HAT_MATCH_TOLERANCE = 0.1;

  /** Threshold for dual-axis D-pad detection */
  private static readonly DPAD_AXIS_THRESHOLD = 0.5;

  /** How often to log axis diagnostics for generic gamepads (ms) */
  private static readonly AXIS_LOG_INTERVAL_MS = 2000;

  private repeatConfig: RepeatConfig = {
    dpad: { initialDelay: 400, repeatRate: 120 },
    sticks: {
      left: { deadzone: 0.25, repeatRate: 50 },
      right: { deadzone: 0.25, repeatRate: 50 },
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
    if (gamepad.mapping === 'standard') {
      this.checkDpadButtons(gamepad, index, prevState);
    } else {
      this.logAxesDiagnostic(gamepad, index);
      this.checkDpadAxes(gamepad, index, prevState);
    }
  }

  /** Standard mapping: D-pad is buttons 12-15 */
  private checkDpadButtons(gamepad: Gamepad, index: number, prevState: boolean[]): void {
    const dpadMap = [
      { btnIdx: 12, name: 'DPadUp', stateIdx: 12 },
      { btnIdx: 13, name: 'DPadDown', stateIdx: 13 },
      { btnIdx: 14, name: 'DPadLeft', stateIdx: 14 },
      { btnIdx: 15, name: 'DPadRight', stateIdx: 15 },
    ];

    for (const { btnIdx, name, stateIdx } of dpadMap) {
      const pressed = gamepad.buttons[btnIdx]?.pressed ?? false;
      if (pressed !== (prevState[stateIdx] ?? false)) {
        prevState[stateIdx] = pressed;
        if (pressed) this.handleButtonPress(name, index);
        else this.handleButtonRelease(name, index);
      }
    }
  }

  /**
   * Generic mapping: detect D-pad from axes.
   * Tries dual-axis pairs (6/7 or 4/5), then hat switch axis (9 or last).
   */
  private checkDpadAxes(gamepad: Gamepad, index: number, prevState: boolean[]): void {
    let up = false, down = false, left = false, right = false;
    const threshold = BrowserGamepadPoller.DPAD_AXIS_THRESHOLD;

    // Method 1: Dual-axis D-pad (most common for DirectInput gamepads)
    const dualPair = BrowserGamepadPoller.findDualAxisPair(gamepad.axes.length);
    if (dualPair !== null) {
      const x = gamepad.axes[dualPair[0]] ?? 0;
      const y = gamepad.axes[dualPair[1]] ?? 0;
      if (Math.abs(x) > threshold || Math.abs(y) > threshold) {
        left = x < -threshold;
        right = x > threshold;
        up = y < -threshold;
        down = y > threshold;
      }
    }

    // Method 2: Hat switch axis (single axis with discrete direction values)
    if (!up && !down && !left && !right) {
      const hatIdx = BrowserGamepadPoller.findHatAxisIndex(gamepad.axes.length);
      if (hatIdx !== null) {
        const hatValue = gamepad.axes[hatIdx] ?? 0;
        const dir = BrowserGamepadPoller.decodeHatAxis(hatValue);
        up = dir.up; down = dir.down; left = dir.left; right = dir.right;
      }
    }

    this.emitDpadDirection(up, 'DPadUp', 12, index, prevState);
    this.emitDpadDirection(down, 'DPadDown', 13, index, prevState);
    this.emitDpadDirection(left, 'DPadLeft', 14, index, prevState);
    this.emitDpadDirection(right, 'DPadRight', 15, index, prevState);
  }

  /** Emit D-pad direction state change (press or release) */
  private emitDpadDirection(
    active: boolean, name: string, stateIdx: number,
    gamepadIndex: number, prevState: boolean[],
  ): void {
    if (active !== (prevState[stateIdx] ?? false)) {
      prevState[stateIdx] = active;
      if (active) this.handleButtonPress(name, gamepadIndex);
      else this.handleButtonRelease(name, gamepadIndex);
    }
  }

  /** Find the best dual-axis pair for D-pad beyond stick axes (0-3) */
  static findDualAxisPair(axesCount: number): [number, number] | null {
    if (axesCount >= 8) return [6, 7];
    if (axesCount >= 6) return [4, 5];
    return null;
  }

  /** Find the best hat switch axis index beyond stick axes */
  static findHatAxisIndex(axesCount: number): number | null {
    if (axesCount >= 10) return 9;
    if (axesCount > 4) return axesCount - 1;
    return null;
  }

  /**
   * Decode a hat switch axis value into cardinal directions.
   *
   * Standard Chromium/DirectInput encoding uses 8 values spaced at 2/7 (~0.286):
   *   N=-1.000, NE=-0.714, E=-0.429, SE=-0.143,
   *   S=0.143, SW=0.429, W=0.714, NW=1.000
   * Neutral is typically >1.1 (e.g. ~1.286).
   */
  static decodeHatAxis(value: number): { up: boolean; down: boolean; left: boolean; right: boolean } {
    const neutral = { up: false, down: false, left: false, right: false };

    // Neutral: value outside the active range [-1.05, 1.05]
    if (Math.abs(value) > 1.05) return neutral;

    const directions = [
      { value: -1.000, up: true,  down: false, left: false, right: false }, // N
      { value: -0.714, up: true,  down: false, left: false, right: true },  // NE
      { value: -0.429, up: false, down: false, left: false, right: true },  // E
      { value: -0.143, up: false, down: true,  left: false, right: true },  // SE
      { value:  0.143, up: false, down: true,  left: false, right: false }, // S
      { value:  0.429, up: false, down: true,  left: true,  right: false }, // SW
      { value:  0.714, up: false, down: false, left: true,  right: false }, // W
      { value:  1.000, up: true,  down: false, left: true,  right: false }, // NW
    ];

    let closest = neutral;
    let minDist = BrowserGamepadPoller.HAT_MATCH_TOLERANCE;
    for (const dir of directions) {
      const dist = Math.abs(value - dir.value);
      if (dist < minDist) {
        minDist = dist;
        closest = { up: dir.up, down: dir.down, left: dir.left, right: dir.right };
      }
    }

    return closest;
  }

  /** Throttled diagnostic logging of all axis values for generic gamepads */
  private logAxesDiagnostic(gamepad: Gamepad, index: number): void {
    const now = Date.now();
    if (now - this.lastAxesDiagLog < BrowserGamepadPoller.AXIS_LOG_INTERVAL_MS) return;
    this.lastAxesDiagLog = now;

    const axesValues = Array.from(gamepad.axes).map((v, i) => `${i}:${v.toFixed(3)}`).join(', ');
    const btnCount = gamepad.buttons.length;
    console.log(
      `[BrowserGamepad] Generic gamepad ${index} (${gamepad.id}) ` +
      `mapping="${gamepad.mapping}" buttons=${btnCount} axes=[${axesValues}]`,
    );
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
