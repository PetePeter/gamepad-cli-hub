import { browserGamepad } from '../gamepad.js';
import { useAppStore } from '../stores/app.js';

let gamepadButtonUnsub: (() => void) | null = null;
let gamepadReleaseUnsub: (() => void) | null = null;

export function setupGamepad(
  handleButton: (button: string) => void,
  handleRelease: (button: string) => void,
): void {
  const appStore = useAppStore();
  browserGamepad.start();

  gamepadButtonUnsub = browserGamepad.onButton((event) => {
    if (event.button === '_connected' || event.button === '_disconnected') {
      appStore.setGamepadCount(browserGamepad.getCount());
      return;
    }
    handleButton(event.button);
  });

  gamepadReleaseUnsub = browserGamepad.onRelease((event) => {
    handleRelease(event.button);
  });

  appStore.setGamepadCount(browserGamepad.getCount());
}

export function teardownGamepad(): void {
  gamepadButtonUnsub?.();
  gamepadReleaseUnsub?.();
  gamepadButtonUnsub = null;
  gamepadReleaseUnsub = null;
  browserGamepad.stop();
}
