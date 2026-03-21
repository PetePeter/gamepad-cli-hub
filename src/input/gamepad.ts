/**
 * Gamepad Input Module
 *
 * Handles Xbox controller input detection and debouncing.
 * Uses Windows XInput via PowerShell for gamepad state polling.
 */

import { spawn } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeFileSync, unlinkSync } from 'fs';

/**
 * Xbox controller button names
 */
export type ButtonName =
  | 'A' | 'B' | 'X' | 'Y'
  | 'Up' | 'Down' | 'Left' | 'Right'
  | 'LeftBumper' | 'RightBumper'
  | 'LeftTrigger' | 'RightTrigger'
  | 'LeftStick' | 'RightStick'
  | 'Start' | 'Back'
  | 'Guide';

/**
 * Button press event data
 */
export interface ButtonPressEvent {
  button: string;
  gamepadIndex: number;
  timestamp: number;
}

// Re-export as ButtonEvent for compatibility
export type ButtonEvent = ButtonPressEvent;

export type EventCallback = (event: ButtonPressEvent) => void;

export type ConnectionEvent = {
  connected: boolean;
  count: number;
  timestamp: number;
};

export type ConnectionCallback = (event: ConnectionEvent) => void;

type EventType = 'button-press' | 'connection-change';

/**
 * XInput state structure returned from PowerShell
 */
interface XInputState {
  connected: boolean;
  buttons: {
    a: boolean;
    b: boolean;
    x: boolean;
    y: boolean;
    leftShoulder: boolean;
    rightShoulder: boolean;
    back: boolean;
    start: boolean;
    leftThumb: boolean;
    rightThumb: boolean;
  };
  dpad: {
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
  };
  triggers: {
    left: boolean;
    right: boolean;
  };
}

/**
 * PowerShell script to query XInput state using Windows.Gaming.Input
 * Silently fails if API is unavailable
 */
const XINPUT_PS1 = `
$ErrorActionPreference = 'SilentlyContinue'
$assemblyLoaded = $false
try {
    Add-Type -AssemblyName Windows.Gaming.Input -ErrorAction Stop
    $assemblyLoaded = $true
} catch {
    # Windows.Gaming.Input not available - will return disconnected state
}

function Get-GamepadState {
    if (-not $assemblyLoaded) {
        return @{ connected = $false }
    }
    $gamepad = [Windows.Gaming.Input.Gamepad]::Gamepads | Select-Object -First 1
    if (-not $gamepad) {
        return @{ connected = $false }
    }
    $reading = $gamepad.GetCurrentReading()
    $buttons = $reading.Buttons.value__
    $gamepadButtons = @{
        a = ($buttons -band 0x1000) -ne 0
        b = ($buttons -band 0x2000) -ne 0
        x = ($buttons -band 0x4000) -ne 0
        y = ($buttons -band 0x8000) -ne 0
        leftShoulder = ($buttons -band 0x0100) -ne 0
        rightShoulder = ($buttons -band 0x0200) -ne 0
        back = ($buttons -band 0x0020) -ne 0
        start = ($buttons -band 0x0010) -ne 0
        leftThumb = ($buttons -band 0x0040) -ne 0
        rightThumb = ($buttons -band 0x0080) -ne 0
    }
    $dpad = @{
        up = ($buttons -band 0x0001) -ne 0
        down = ($buttons -band 0x0002) -ne 0
        left = ($buttons -band 0x0004) -ne 0
        right = ($buttons -band 0x0008) -ne 0
    }
    $triggers = @{
        left = $reading.LeftTrigger -gt 0.5
        right = $reading.RightTrigger -gt 0.5
    }
    return @{
        connected = $true
        buttons = $gamepadButtons
        dpad = $dpad
        triggers = $triggers
    }
}
while ($true) {
    $state = Get-GamepadState
    $state | ConvertTo-Json -Compress
    Start-Sleep -Milliseconds 16
}
`;

/**
 * Gamepad Input Handler
 *
 * Main class for handling gamepad input with debouncing.
 * Continuously polls gamepad state and emits events for button presses.
 */
export class GamepadInput {
  private eventCallbacks: Map<EventType, Set<EventCallback>> = new Map();
  private buttonState: Map<string, boolean> = new Map();
  private lastPressTime: Map<string, number> = new Map();
  private debounceMs: number;
  private isRunning: boolean = false;
  private pollProcess: ReturnType<typeof spawn> | null = null;
  private pollFrequencyMs: number;
  private scriptPath: string | null = null;
  private connectedCount: number = 0;
  private wasConnected: boolean = false;

  constructor(debounceMs: number = 200) {
    this.debounceMs = debounceMs;
    this.pollFrequencyMs = 16;
  }

  setDebounceTime(ms: number): void {
    this.debounceMs = ms;
  }

  on(event: EventType, callback: EventCallback | ConnectionCallback): void {
    if (!this.eventCallbacks.has(event)) {
      this.eventCallbacks.set(event, new Set());
    }
    this.eventCallbacks.get(event)!.add(callback as any);
  }

  off(event: EventType, callback: EventCallback | ConnectionCallback): void {
    const callbacks = this.eventCallbacks.get(event);
    if (callbacks) {
      callbacks.delete(callback as any);
    }
  }

  onConnectionChange(callback: ConnectionCallback): void {
    this.on('connection-change', callback);
  }

  onButton(button: string, callback: EventCallback): void {
    const wrappedCallback: EventCallback = (event) => {
      if (event.button === button) {
        callback(event);
      }
    };
    this.on('button-press', wrappedCallback);
  }

  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    console.log('Gamepad input listener started');

    this.scriptPath = join(tmpdir(), `gamepad-xinput-${Date.now()}.ps1`);
    writeFileSync(this.scriptPath, XINPUT_PS1, 'utf-8');

    this.pollProcess = spawn('powershell', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', this.scriptPath!
    ]);

    let buffer = '';

    this.pollProcess.stdout?.on('data', (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          try {
            const state: XInputState = JSON.parse(trimmed);
            this.processState(state);
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    });

    this.pollProcess.stderr?.on('data', (data: Buffer) => {
      console.error('Gamepad poll error:', data.toString());
    });

    this.pollProcess.on('close', () => {
      this.stop();
    });
  }

  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.pollProcess) {
      this.pollProcess.kill();
      this.pollProcess = null;
    }

    if (this.scriptPath) {
      try {
        unlinkSync(this.scriptPath);
      } catch {
        // Ignore errors
      }
      this.scriptPath = null;
    }

    this.buttonState.clear();
    console.log('Gamepad input listener stopped');
  }

  private processState(state: XInputState): void {
    // Track connection state changes
    const nowConnected = state.connected;
    if (nowConnected !== this.wasConnected) {
      this.wasConnected = nowConnected;
      this.connectedCount = nowConnected ? 1 : 0;
      console.log(`[Gamepad] ${nowConnected ? 'Connected' : 'Disconnected'}`);
      this.emitConnectionEvent(nowConnected);
    }

    if (!state.connected) {
      return;
    }

    const gamepadIndex = 0;

    const buttonMap: Array<{ key: keyof XInputState['buttons']; name: ButtonName }> = [
      { key: 'a', name: 'A' },
      { key: 'b', name: 'B' },
      { key: 'x', name: 'X' },
      { key: 'y', name: 'Y' },
      { key: 'leftShoulder', name: 'LeftBumper' },
      { key: 'rightShoulder', name: 'RightBumper' },
    ];

    for (const { key, name } of buttonMap) {
      const pressed = state.buttons[key];
      this.checkButton(name, pressed, gamepadIndex);
    }

    const dpadMap: Array<{ key: keyof XInputState['dpad']; name: ButtonName }> = [
      { key: 'up', name: 'Up' },
      { key: 'down', name: 'Down' },
      { key: 'left', name: 'Left' },
      { key: 'right', name: 'Right' },
    ];

    for (const { key, name } of dpadMap) {
      const pressed = state.dpad[key];
      this.checkButton(name, pressed, gamepadIndex);
    }

    this.checkButton('LeftTrigger', state.triggers.left, gamepadIndex);
    this.checkButton('RightTrigger', state.triggers.right, gamepadIndex);
  }

  private checkButton(button: ButtonName, pressed: boolean, gamepadIndex: number): void {
    const stateKey = `${gamepadIndex}-${button}`;
    const previousState = this.buttonState.get(stateKey) ?? false;

    if (pressed !== previousState) {
      this.buttonState.set(stateKey, pressed);

      if (pressed) {
        this.handleButtonPress(button, gamepadIndex);
      }
    }
  }

  private handleButtonPress(button: ButtonName, gamepadIndex: number): void {
    const key = `${gamepadIndex}-${button}`;
    const now = Date.now();
    const lastPress = this.lastPressTime.get(key) ?? 0;

    if (now - lastPress < this.debounceMs) {
      return;
    }

    this.lastPressTime.set(key, now);
    this.emitButtonEvent(button, gamepadIndex);
  }

  private emitButtonEvent(button: ButtonName, gamepadIndex: number): void {
    const callbacks = this.eventCallbacks.get('button-press');
    if (!callbacks || callbacks.size === 0) {
      return;
    }

    const event: ButtonPressEvent = {
      button,
      gamepadIndex,
      timestamp: Date.now(),
    };

    for (const callback of Array.from(callbacks)) {
      try {
        callback(event);
      } catch (error) {
        console.error(`Error in button-press callback for ${button}:`, error);
      }
    }
  }

  private emitConnectionEvent(connected: boolean): void {
    const callbacks = this.eventCallbacks.get('connection-change');
    if (!callbacks || callbacks.size === 0) {
      return;
    }

    const event: ConnectionEvent = {
      connected,
      count: connected ? 1 : 0,
      timestamp: Date.now(),
    };

    for (const callback of Array.from(callbacks)) {
      try {
        callback(event);
      } catch (error) {
        console.error('Error in connection-change callback:', error);
      }
    }
  }

  isButtonPressed(button: ButtonName, gamepadIndex: number = 0): boolean {
    const stateKey = `${gamepadIndex}-${button}`;
    return this.buttonState.get(stateKey) ?? false;
  }

  getConnectedGamepadCount(): number {
    return this.connectedCount;
  }
}

export const gamepadInput = new GamepadInput();

export function createGamepadInput(debounceMs?: number): GamepadInput {
  const input = new GamepadInput(debounceMs);
  input.start();
  return input;
}
