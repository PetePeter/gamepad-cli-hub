# Bluetooth Xbox Controller Detection Fix

## Problem
- Xbox controller connected via Bluetooth
- Windows shows it connected
- App doesn't detect it (count shows 0)

## Root Cause
`Windows.Gaming.Input` PowerShell API has limited support for Bluetooth Xbox controllers.

## Solutions

### Option 1: Use node-hid (Raw HID access)
- Read gamepad input directly via USB/BT HID
- Works with any controller
- Requires native module compilation

### Option 2: Use gamepad.js Web API polling
- Use Chromium's navigator.getGamepads()
- Works in Electron renderer
- No native dependencies

### Option 3: Enhanced PowerShell with XInput DLL
- Direct P/Invoke to xinput1_4.dll
- More reliable than Windows.Gaming.Input
- Still PowerShell-based

## Recommended: Option 2 (gamepad.js API)

**Pros:**
- Built into Electron/Chromium
- Works with BT Xbox controllers
- No native compilation
- Simple API

**Cons:**
- Requires renderer to poll (IPC overhead)
- Button mapping differs from XInput

## Implementation Plan

1. Add gamepad polling to renderer
2. Map browser gamepad events to our button names
3. Send to main process via IPC
4. Keep existing PowerShell as fallback

## Button Mapping (Browser vs XInput)

| Browser | XInput |
|---------|--------|
| buttons[0] | A |
| buttons[1] | B |
| buttons[2] | X |
| buttons[3] | Y |
| buttons[4] | LeftBumper |
| buttons[5] | RightBumper |
| buttons[6] | LeftTrigger |
| buttons[7] | RightTrigger |
| buttons[8] | Back/Select |
| buttons[9] | Start |
| buttons[10-11] | LeftStick press |
| buttons[12-13] | RightStick press |
| axes[0] | LeftStick X |
| axes[1] | LeftStick Y |
| axes[2] | RightStick X |
| axes[3] | RightStick Y |
| (D-pad via axes or buttons 14-17) | Up/Down/Left/Right |
