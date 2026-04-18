/**
 * Navigation composable — Vue-native gamepad input routing.
 *
 * Replaces the 11-deep if-chain in `renderer/navigation.ts` with a reactive
 * pattern using the modal stack composable. Input flows through:
 *
 * 1. Sandwich button → always show sessions screen
 * 2. Modal stack → topmost modal handler gets all input when stack is non-empty
 * 3. Screen handler → sessions or settings screen processes remaining input
 * 4. Config binding fallback → per-CLI bindings fire for unconsumed buttons
 *
 * This composable bridges the legacy gamepad poller and config binding system
 * with the new Vue modal stack. During migration, the legacy navigation.ts
 * continues to work; this composable will replace it when App.vue takes over.
 */
import { ref, readonly, computed } from 'vue';
import { useModalStack } from './useModalStack.js';

export type ScreenName = 'sessions' | 'settings';
export type ViewName = 'terminal' | 'overview' | 'plan';

export interface NavigationState {
  currentScreen: ScreenName;
  currentView: ViewName;
  gamepadCount: number;
  lastButton: string;
}

export interface ScreenHandler {
  handleButton: (button: string) => boolean;
}

export function useNavigation() {
  const modalStack = useModalStack();

  const currentScreen = ref<ScreenName>('sessions');
  const currentView = ref<ViewName>('terminal');
  const gamepadCount = ref(0);
  const lastButton = ref('');

  const screenHandlers = new Map<ScreenName, ScreenHandler>();
  const viewHandlers = new Map<ViewName, ScreenHandler>();

  let configBindingFn: ((button: string) => void) | null = null;
  let configReleaseFn: ((button: string) => void) | null = null;
  let sandwichFn: (() => void) | null = null;

  /** Register a screen handler */
  function registerScreen(screen: ScreenName, handler: ScreenHandler): void {
    screenHandlers.set(screen, handler);
  }

  /** Register a view handler (for right-panel views like plan, overview) */
  function registerView(view: ViewName, handler: ScreenHandler): void {
    viewHandlers.set(view, handler);
  }

  /** Register the config binding fallback */
  function setConfigBindingHandler(fn: (button: string) => void): void {
    configBindingFn = fn;
  }

  /** Register the config release handler */
  function setConfigReleaseHandler(fn: (button: string) => void): void {
    configReleaseFn = fn;
  }

  /** Register the sandwich button handler */
  function setSandwichHandler(fn: () => void): void {
    sandwichFn = fn;
  }

  /**
   * Main input routing — processes a button press through the priority chain.
   *
   * Priority:
   * 1. Sandwich button → always handled
   * 2. Modal stack → topmost modal gets input
   * 3. Right-panel view handler (plan, overview) when in sessions screen
   * 4. Screen handler (sessions, settings)
   * 5. Config binding fallback
   */
  function handleButton(button: string): void {
    lastButton.value = button;

    // 1. Sandwich always shows sessions
    if (button === 'Sandwich') {
      if (sandwichFn) sandwichFn();
      return;
    }

    // 2. Modal stack intercepts when open
    if (modalStack.isOpen.value) {
      modalStack.handleInput(button);
      return;
    }

    // 3-4. Screen/view routing
    let consumed = false;

    if (currentScreen.value === 'sessions') {
      // Check view handlers first (plan, overview take priority over sessions)
      const viewHandler = viewHandlers.get(currentView.value);
      if (viewHandler && currentView.value !== 'terminal') {
        consumed = viewHandler.handleButton(button);
      }
      if (!consumed) {
        const screenHandler = screenHandlers.get('sessions');
        if (screenHandler) {
          consumed = screenHandler.handleButton(button);
        }
      }
    } else {
      const screenHandler = screenHandlers.get(currentScreen.value);
      if (screenHandler) {
        consumed = screenHandler.handleButton(button);
      }
    }

    // 5. Config binding fallback
    if (!consumed && configBindingFn) {
      configBindingFn(button);
    }
  }

  /** Handle button release (for hold-mode bindings) */
  function handleRelease(button: string): void {
    if (configReleaseFn) {
      configReleaseFn(button);
    }
  }

  /** Update gamepad connection count */
  function setGamepadCount(count: number): void {
    gamepadCount.value = count;
  }

  /** Switch active screen */
  function showScreen(screen: ScreenName): void {
    currentScreen.value = screen;
  }

  /** Switch active right-panel view */
  function showView(view: ViewName): void {
    currentView.value = view;
  }

  return {
    // State (readonly)
    currentScreen: readonly(currentScreen),
    currentView: readonly(currentView),
    gamepadCount: readonly(gamepadCount),
    lastButton: readonly(lastButton),
    modalStack,

    // Registration
    registerScreen,
    registerView,
    setConfigBindingHandler,
    setConfigReleaseHandler,
    setSandwichHandler,

    // Input routing
    handleButton,
    handleRelease,

    // State mutations
    setGamepadCount,
    showScreen,
    showView,
  };
}
