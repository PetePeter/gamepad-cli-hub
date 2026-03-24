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

    [StructLayout(LayoutKind.Sequential)]
    public struct XINPUT_VIBRATION {
        public ushort wLeftMotorSpeed;
        public ushort wRightMotorSpeed;
    }

    [DllImport("xinput1_4.dll")]
    public static extern uint XInputGetState(uint dwUserIndex, ref XINPUT_STATE pState);

    [DllImport("xinput1_4.dll")]
    public static extern uint XInputSetState(uint dwUserIndex, ref XINPUT_VIBRATION pVibration);
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

        # Emit analog stick values (only when above deadzone)
        $rx = $state.Gamepad.sThumbRX
        $ry = $state.Gamepad.sThumbRY
        $analogDz = 8000
        if ([Math]::Abs($lx) -gt $analogDz -or [Math]::Abs($ly) -gt $analogDz) {
            Write-Output ('{"event":"analog","stick":"left","x":' + $lx + ',"y":' + $ly + ',"index":0}')
        }
        if ([Math]::Abs($rx) -gt $analogDz -or [Math]::Abs($ry) -gt $analogDz) {
            Write-Output ('{"event":"analog","stick":"right","x":' + $rx + ',"y":' + $ry + ',"index":0}')
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

    # Check stdin for vibration commands (non-blocking)
    if ([Console]::KeyAvailable -or [Console]::In.Peek() -ne -1) {
        $line = [Console]::In.ReadLine()
        if ($line) {
            try {
                $cmd = $line | ConvertFrom-Json
                if ($cmd.event -eq 'vibrate') {
                    $vib = New-Object XInput+XINPUT_VIBRATION
                    $vib.wLeftMotorSpeed = [uint16]$cmd.left
                    $vib.wRightMotorSpeed = [uint16]$cmd.right
                    [XInput]::XInputSetState(0, [ref]$vib) | Out-Null
                }
            } catch {
                # Ignore malformed commands
            }
        }
    }

    Start-Sleep -Milliseconds 16
}
