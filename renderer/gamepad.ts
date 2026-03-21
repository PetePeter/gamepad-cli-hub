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

class BrowserGamepadPoller {
  private pollInterval: number | null = null;
  private pollMs = 16; // ~60fps
  private buttonStates: Map<number, boolean[]> = new Map();
  private lastPressTime: Map<string, number> = new Map();
  private debounceMs = 350;
  private callbacks: Set<ButtonCallback> = new Set();
  private connectedCount = 0;
  private eventsSetup = false;

  constructor() {
    // Don't set up event listeners here - wait for start()
    // This ensures callbacks are registered before events fire
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

  getCount(): number {
    return this.connectedCount;
  }

  private poll(): void {
    const gamepads = navigator.getGamepads();
    if (!gamepads) return;

    for (let i = 0; i < gamepads.length; i++) {
      const gamepad = gamepads[i];
      if (!gamepad) continue;

      this.processGamepad(gamepad, i);
    }
  }

  private processGamepad(gamepad: Gamepad, index: number): void {
    // Get previous state
    let prevState = this.buttonStates.get(index);
    if (!prevState) {
      prevState = new Array(gamepad.buttons.length).fill(false);
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
      9,                          // 9: Start
      10,                         // 10: LeftStick press
      11,                         // 11: RightStick press
    ];

    const buttonNames: string[] = [
      'A', 'B', 'X', 'Y',
      'LeftBumper', 'RightBumper',
      'LeftTrigger', 'RightTrigger',
      'Back', 'Start',
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
        }
      }
    }

    // Check D-pad (varies by controller - try axes first, then buttons)
    this.checkDpad(gamepad, index, prevState);

    // Left stick → D-pad emulation
    this.checkLeftStickAsDpad(gamepad, index, prevState);
  }

  private checkLeftStickAsDpad(gamepad: Gamepad, index: number, prevState: boolean[]): void {
    // Left stick axes: 0 = X (left/right), 1 = Y (up/down)
    const threshold = 0.5;
    const stickX = gamepad.axes[0] ?? 0;
    const stickY = gamepad.axes[1] ?? 0;

    // State indices 16-19 for stick directions
    const stickMap: Array<{ active: boolean; name: string; stateIdx: number }> = [
      { active: stickY < -threshold, name: 'Up', stateIdx: 16 },
      { active: stickY > threshold, name: 'Down', stateIdx: 17 },
      { active: stickX < -threshold, name: 'Left', stateIdx: 18 },
      { active: stickX > threshold, name: 'Right', stateIdx: 19 },
    ];

    for (const { active, name, stateIdx } of stickMap) {
      const prev = prevState[stateIdx] ?? false;
      if (active !== prev) {
        prevState[stateIdx] = active;
        if (active) {
          this.handleButtonPress(name, index);
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
      { index: dpadUpIndex, name: 'Up' },
      { index: dpadDownIndex, name: 'Down' },
      { index: dpadLeftIndex, name: 'Left' },
      { index: dpadRightIndex, name: 'Right' },
    ];

    for (const { index: btnIndex, name } of dpadMap) {
      const pressed = gamepad.buttons[btnIndex]?.pressed ?? false;
      const stateIndex = 12 + dpadMap.findIndex(d => d.index === btnIndex);

      if (pressed !== (prevState[stateIndex] ?? false)) {
        prevState[stateIndex] = pressed;
        if (pressed) {
          this.handleButtonPress(name, index);
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

export const browserGamepad = new BrowserGamepadPoller();
