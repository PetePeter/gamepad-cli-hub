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

export type EventCallback = (event: ButtonPressEvent) => void;

export type ConnectionEvent = {
  connected: boolean;
  count: number;
  timestamp: number;
};

export type ConnectionCallback = (event: ConnectionEvent) => void;

type EventType = 'button-press' | 'connection-change';

/**
 * Event emitted by the XInput PowerShell polling script.
 * The script does edge detection internally and only emits on state changes.
 */
interface XInputEvent {
  event: 'connected' | 'disconnected' | 'button';
  button?: string;
  index: number;
}

/**
 * PowerShell script using XInput P/Invoke for gamepad state polling.
 * Uses xinput1_4.dll directly (pre-installed on Windows 10/11).
 * Works with Bluetooth Xbox controllers unlike Windows.Gaming.Input.
 * Outputs JSON events on stdout: connected, disconnected, button press.
 */
const XINPUT_PS1 = `
Add-Type @"
using System;
using System.Runtime.InteropServices;

public class XInput {
    [StructLayout(LayoutKind.Sequential)]
    public struct XINPUT_GAMEPAD {
        public ushort wButtons;
        public byte bLeftTrigger;
        public byte bRightTrigger;
        public short sThumbLX;
        public short sThumbLY;
        public short sThumbRX;
        public short sThumbRY;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct XINPUT_STATE {
        public uint dwPacketNumber;
        public XINPUT_GAMEPAD Gamepad;
    }

    [DllImport("xinput1_4.dll")]
    public static extern uint XInputGetState(uint dwUserIndex, ref XINPUT_STATE pState);
}
"@

$prevButtons = 0
$connected = $false

while ($true) {
    $state = New-Object XInput+XINPUT_STATE
    $result = [XInput]::XInputGetState(0, [ref]$state)

    if ($result -eq 0) {
        if (-not $connected) {
            $connected = $true
            Write-Output '{"event":"connected","index":0}'
        }

        $buttons = $state.Gamepad.wButtons
        $lt = $state.Gamepad.bLeftTrigger
        $rt = $state.Gamepad.bRightTrigger

        $buttonMap = @{
            'Up' = 0x0001
            'Down' = 0x0002
            'Left' = 0x0004
            'Right' = 0x0008
            'Sandwich' = 0x0010
            'Back' = 0x0020
            'LeftStick' = 0x0040
            'RightStick' = 0x0080
            'LeftBumper' = 0x0100
            'RightBumper' = 0x0200
            'A' = 0x1000
            'B' = 0x2000
            'X' = 0x4000
            'Y' = 0x8000
        }

        foreach ($entry in $buttonMap.GetEnumerator()) {
            $wasPressed = ($prevButtons -band $entry.Value) -ne 0
            $isPressed = ($buttons -band $entry.Value) -ne 0
            if ($isPressed -and -not $wasPressed) {
                Write-Output ('{"event":"button","button":"' + $entry.Key + '","index":0}')
            }
        }

        $ltPressed = $lt -gt 128
        $prevLt = ($prevButtons -band 0x10000) -ne 0
        if ($ltPressed -and -not $prevLt) {
            Write-Output '{"event":"button","button":"LeftTrigger","index":0}'
        }
        $rtPressed = $rt -gt 128
        $prevRt = ($prevButtons -band 0x20000) -ne 0
        if ($rtPressed -and -not $prevRt) {
            Write-Output '{"event":"button","button":"RightTrigger","index":0}'
        }

        # Left stick → D-pad emulation (deadzone threshold ~8000 of 32767)
        $lx = $state.Gamepad.sThumbLX
        $ly = $state.Gamepad.sThumbLY
        $dz = 8000

        $stickLeft = $lx -lt -$dz
        $stickRight = $lx -gt $dz
        $stickUp = $ly -gt $dz
        $stickDown = $ly -lt -$dz

        $prevStickLeft = ($prevButtons -band 0x40000) -ne 0
        $prevStickRight = ($prevButtons -band 0x80000) -ne 0
        $prevStickUp = ($prevButtons -band 0x100000) -ne 0
        $prevStickDown = ($prevButtons -band 0x200000) -ne 0

        if ($stickUp -and -not $prevStickUp) {
            Write-Output '{"event":"button","button":"Up","index":0}'
        }
        if ($stickDown -and -not $prevStickDown) {
            Write-Output '{"event":"button","button":"Down","index":0}'
        }
        if ($stickLeft -and -not $prevStickLeft) {
            Write-Output '{"event":"button","button":"Left","index":0}'
        }
        if ($stickRight -and -not $prevStickRight) {
            Write-Output '{"event":"button","button":"Right","index":0}'
        }

        $prevButtons = $buttons
        if ($ltPressed) { $prevButtons = $prevButtons -bor 0x10000 }
        if ($rtPressed) { $prevButtons = $prevButtons -bor 0x20000 }
        if ($stickLeft) { $prevButtons = $prevButtons -bor 0x40000 }
        if ($stickRight) { $prevButtons = $prevButtons -bor 0x80000 }
        if ($stickUp) { $prevButtons = $prevButtons -bor 0x100000 }
        if ($stickDown) { $prevButtons = $prevButtons -bor 0x200000 }
    } else {
        if ($connected) {
            $connected = $false
            Write-Output '{"event":"disconnected","index":0}'
        }
    }

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
            const event: XInputEvent = JSON.parse(trimmed);
            this.processEvent(event);
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

  private processEvent(event: XInputEvent): void {
    switch (event.event) {
      case 'connected':
        if (!this.wasConnected) {
          this.wasConnected = true;
          this.connectedCount = 1;
          console.log('[Gamepad] Connected');
          this.emitConnectionEvent(true);
        }
        break;
      case 'disconnected':
        if (this.wasConnected) {
          this.wasConnected = false;
          this.connectedCount = 0;
          this.buttonState.clear();
          console.log('[Gamepad] Disconnected');
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
