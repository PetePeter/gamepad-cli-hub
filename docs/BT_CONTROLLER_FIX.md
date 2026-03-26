# Bluetooth Xbox Controller Detection Fix

## Problem
- Xbox controller connected via Bluetooth
- Windows shows it connected
- App doesn't detect it (count shows 0)

## Root Cause
`Windows.Gaming.Input` PowerShell API has limited support for Bluetooth Xbox controllers.

## Solution — Browser Gamepad API

The app now uses **only** the Chromium `navigator.getGamepads()` Web API polling
(implemented in `renderer/gamepad.ts`). The previous XInput/PowerShell path was
removed because the Browser API handles both USB and Bluetooth controllers
natively without any native dependencies.

**Pros:**
- Built into Electron/Chromium — zero native dependencies
- Works with USB *and* Bluetooth Xbox controllers
- Single input path eliminates double-tap issues from dual event sources
- Simple polling at ~60 fps with 250 ms debounce

## Button Mapping (Browser → Internal Name)

| Browser | Internal |
|---------|----------|
| buttons[0] | A |
| buttons[1] | B |
| buttons[2] | X |
| buttons[3] | Y |
| buttons[4] | LeftBumper |
| buttons[5] | RightBumper |
| buttons[6] | LeftTrigger |
| buttons[7] | RightTrigger |
| buttons[8] | Back/Select |
| buttons[9] | Sandwich |
| buttons[10-11] | LeftStick / RightStick press |
| buttons[12-15] | DPadUp/Down/Left/Right |
| axes[0-1] | LeftStick X/Y (virtual LeftStickUp/Down/Left/Right) |
| axes[2-3] | RightStick X/Y (virtual RightStickUp/Down/Left/Right) |
