/**
 * Gamepad Input Module
 *
 * Handles Xbox controller input detection and debouncing.
 * Uses Windows XInput via PowerShell for gamepad state polling.
 */

import { spawn } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { logger } from '../utils/logger.js';

/**
 * Xbox controller button names
 */
export type ButtonName =
  | 'A' | 'B' | 'X' | 'Y'
  | 'Up' | 'Down' | 'Left' | 'Right'
  | 'LeftBumper' | 'RightBumper'
  | 'LeftTrigger' | 'RightTrigger'
  | 'LeftStick' | 'RightStick'
  | 'Sandwich' | 'Back'
  | 'Xbox';

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

/**
 * Analog stick event — emitted continuously while a stick is outside its deadzone.
 */
export interface AnalogEvent {
  stick: 'left' | 'right';
  x: number;       // -32768 to 32767
  y: number;       // -32768 to 32767
  timestamp: number;
}

export type EventCallback = (event: ButtonPressEvent) => void;
export type AnalogCallback = (event: AnalogEvent) => void;

export type ConnectionEvent = {
  connected: boolean;
  count: number;
  timestamp: number;
};

export type ConnectionCallback = (event: ConnectionEvent) => void;

type EventType = 'button-press' | 'connection-change' | 'analog';

/**
 * Event emitted by the XInput PowerShell polling script.
 * The script does edge detection internally and only emits on state changes.
 */
interface XInputEvent {
  event: 'connected' | 'disconnected' | 'button' | 'analog';
  button?: string;
  stick?: 'left' | 'right';
  x?: number;
  y?: number;
  index: number;
}

/**
 * PowerShell script using XInput P/Invoke for gamepad state polling.
 * Uses xinput1_4.dll directly (pre-installed on Windows 10/11).
 * Works with Bluetooth Xbox controllers unlike Windows.Gaming.Input.
 * Outputs JSON events on stdout: connected, disconnected, button press.
 *
 * Loaded from external file: src/input/xinput-poll.ps1
 * Uses process.cwd() since esbuild bundles to dist-electron/ and can't bundle .ps1 files.
 * Lazy-loaded in start() to avoid crashing at import time if the file is missing.
 */
const XINPUT_PS1_PATH = join(process.cwd(), 'src', 'input', 'xinput-poll.ps1');

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

  constructor(debounceMs: number = 600) {
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

  onAnalog(callback: AnalogCallback): void {
    this.on('analog', callback as any);
  }

  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    logger.info('Gamepad input listener started');

    const xinputScript = readFileSync(XINPUT_PS1_PATH, 'utf-8');
    this.scriptPath = join(tmpdir(), `gamepad-xinput-${Date.now()}.ps1`);
    writeFileSync(this.scriptPath, xinputScript, 'utf-8');

    this.pollProcess = spawn('powershell', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', this.scriptPath!
    ], { stdio: ['pipe', 'pipe', 'pipe'] });

    let buffer = '';

    this.pollProcess.stdout?.on('data', (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          try {
            const event: XInputEvent = JSON.parse(trimmed);
            this.processEvent(event);
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    });

    this.pollProcess.stderr?.on('data', (data: Buffer) => {
      logger.error(`Gamepad poll error: ${data.toString()}`);
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
    logger.info('Gamepad input listener stopped');
  }

  private processEvent(event: XInputEvent): void {
    switch (event.event) {
      case 'connected':
        if (!this.wasConnected) {
          this.wasConnected = true;
          this.connectedCount = 1;
          logger.info('[Gamepad] Connected');
          this.emitConnectionEvent(true);
        }
        break;
      case 'disconnected':
        if (this.wasConnected) {
          this.wasConnected = false;
          this.connectedCount = 0;
          this.buttonState.clear();
          logger.info('[Gamepad] Disconnected');
          this.emitConnectionEvent(false);
        }
        break;
      case 'button':
        if (event.button) {
          const stateKey = `${event.index}-${event.button}`;
          this.buttonState.set(stateKey, true);
          this.handleButtonPress(event.button as ButtonName, event.index);
        }
        break;
      case 'analog':
        if (event.stick) {
          this.emitAnalogEvent(event.stick, event.x ?? 0, event.y ?? 0);
        }
        break;
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
        logger.error(`Error in button-press callback for ${button}: ${error}`);
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
        logger.error(`Error in connection-change callback: ${error}`);
      }
    }
  }

  private emitAnalogEvent(stick: 'left' | 'right', x: number, y: number): void {
    const callbacks = this.eventCallbacks.get('analog');
    if (!callbacks || callbacks.size === 0) {
      return;
    }

    const event: AnalogEvent = {
      stick,
      x,
      y,
      timestamp: Date.now(),
    };

    for (const callback of Array.from(callbacks)) {
      try {
        (callback as unknown as AnalogCallback)(event);
      } catch (error) {
        logger.error(`Error in analog callback for ${stick} stick: ${error}`);
      }
    }
  }

  /**
   * Send a vibration command to the controller.
   * Automatically stops vibration after the specified duration.
   */
  vibrate(leftMotor: number, rightMotor: number, durationMs: number): void {
    if (!this.pollProcess?.stdin?.writable) return;

    const cmd = JSON.stringify({ event: 'vibrate', left: leftMotor, right: rightMotor });
    this.pollProcess.stdin.write(cmd + '\n');

    setTimeout(() => {
      if (this.pollProcess?.stdin?.writable) {
        const stop = JSON.stringify({ event: 'vibrate', left: 0, right: 0 });
        this.pollProcess.stdin.write(stop + '\n');
      }
    }, durationMs);
  }

  /**
   * Short symmetric vibration pulse on both motors.
   */
  pulse(durationMs: number = 200, intensity: number = 32768): void {
    this.vibrate(intensity, intensity, durationMs);
  }

  /**
   * Two quick pulses separated by a short gap.
   */
  doublePulse(): void {
    this.pulse(100, 32768);
    setTimeout(() => this.pulse(100, 32768), 150);
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
