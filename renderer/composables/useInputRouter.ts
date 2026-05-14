import type { Ref } from 'vue';
import { state } from '../state.js';
import { sessionsState } from '../screens/sessions-state.js';
import { getTerminalManager } from '../runtime/terminal-provider.js';
import { toDirection, navigateFocus } from '../utils.js';
import { processConfigBinding, processConfigRelease } from '../bindings.js';
import { getOverviewSessions } from '../screens/group-overview.js';
import {
  handlePlanScreenDpad,
  handlePlanScreenAction,
} from '../plans/plan-screen.js';
import { handleSessionsScreenButton } from '../screens/sessions.js';
import { useModalStack } from './useModalStack.js';
import { useEscProtection } from './useEscProtection.js';
import { isAnyBridgeModalVisible } from '../stores/modal-bridge.js';
import {
  getActiveInputContext,
  isEditableElement,
  isEditableElementInContainer,
  MODAL_NAVIGATION_SELECTOR,
} from '../input/input-ownership.js';

type MainViewState = 'terminal' | 'overview' | 'plan';

interface ButtonTarget {
  handleButton?: (button: string) => void;
}

interface NavigationController {
  closeSettings(): void;
  closePlan(): Promise<void> | void;
  closeOverview(): Promise<void> | void;
  navigateToSession(sessionId: string): Promise<void> | void;
}

interface SettingsTab {
  id: string;
}

export interface InputRouterDeps {
  settingsVisible: Ref<boolean>;
  activeView: Ref<MainViewState>;
  bindingEditorVisible: Ref<boolean>;
  draftEditorVisible: Ref<boolean>;
  draftEditorRef: Ref<ButtonTarget | null>;
  settingsPanelRef: Ref<ButtonTarget | null>;
  settingsTab: Ref<string>;
  overviewCollapsedIds: Ref<Set<string>>;
  buildSettingsTabs: () => SettingsTab[];
  navStore: NavigationController;
}

function isEditableElementInsideModal(element: Element | null): element is HTMLElement {
  return isEditableElement(element) && isEditableElementInContainer(
    element,
    '.modal-overlay.modal--visible, .scheduled-tasks-tab--popup',
  );
}

export function useInputRouter(deps: InputRouterDeps) {
  function handleButton(button: string): void {
    if (button === 'Sandwich' || button === 'Guide') {
      deps.settingsVisible.value = false;
      deps.navStore.closeSettings();
      return;
    }

    const { handleInput } = useModalStack();
    if (handleInput(button)) return;

    if (isAnyBridgeModalVisible()) return;
    if (deps.bindingEditorVisible.value) return;

    if (deps.draftEditorVisible.value) {
      deps.draftEditorRef.value?.handleButton?.(button);
      return;
    }

    if (deps.settingsVisible.value) {
      if (button === 'B') {
        deps.settingsVisible.value = false;
        deps.navStore.closeSettings();
      } else if (button === 'A') {
        const active = document.activeElement as HTMLElement;
        if (active?.classList.contains('focusable')) {
          active.click();
        }
      } else {
        const dir = toDirection(button);
        if (dir === 'left' || dir === 'right') {
          if (deps.settingsPanelRef.value?.handleButton) {
            deps.settingsPanelRef.value.handleButton(button);
          } else {
            const tabs = deps.buildSettingsTabs();
            const idx = tabs.findIndex(t => t.id === deps.settingsTab.value);
            let nextIdx = idx + (dir === 'left' ? -1 : 1);
            if (nextIdx < 0) nextIdx = tabs.length - 1;
            if (nextIdx >= tabs.length) nextIdx = 0;
            deps.settingsTab.value = tabs[nextIdx].id;
          }
        } else if (dir === 'up' || dir === 'down') {
          navigateFocus(dir === 'up' ? -1 : 1);
        } else if (deps.settingsPanelRef.value?.handleButton) {
          deps.settingsPanelRef.value.handleButton(button);
        }
      }
      return;
    }

    if (deps.activeView.value === 'plan') {
      const dir = toDirection(button);
      if (dir) { handlePlanScreenDpad(dir); return; }
      if (button === 'B') { void deps.navStore.closePlan(); return; }
      if (handlePlanScreenAction(button)) return;
    }

    if (deps.activeView.value === 'overview') {
      const sessions = getOverviewSessions();
      const count = sessions.length;
      const dir = toDirection(button);

      if (count === 0) {
        void deps.navStore.closeOverview();
        return;
      }

      if (dir === 'left') {
        void deps.navStore.closeOverview();
        return;
      }
      if (dir === 'right') {
        return;
      }

      if (button === 'A') {
        const session = sessions[sessionsState.overviewFocusIndex];
        if (session) {
          void deps.navStore.navigateToSession(session.id);
        }
        return;
      }

      if (button === 'X') {
        const session = sessions[sessionsState.overviewFocusIndex];
        if (session) {
          if (deps.overviewCollapsedIds.value.has(session.id)) {
            deps.overviewCollapsedIds.value.delete(session.id);
          } else {
            deps.overviewCollapsedIds.value.add(session.id);
          }
        }
        return;
      }

      if (button === 'B') {
        void deps.navStore.closeOverview();
        return;
      }
    }

    if (handleSessionsScreenButton(button)) return;

    const tm = getTerminalManager();
    const activeSession = tm?.getActiveSessionId();
    const session = state.sessions.find(s => s.id === activeSession);
    const cliType = session?.cliType;
    if (cliType) {
      processConfigBinding(button, cliType);
    }
  }

  function handleRelease(button: string): void {
    const tm = getTerminalManager();
    const activeSession = tm?.getActiveSessionId();
    const session = state.sessions.find(s => s.id === activeSession);
    if (session?.cliType) {
      processConfigRelease(button, session.cliType);
    }
  }

  function handleModalKeyboardBridge(e: KeyboardEvent): void {
    const stack = useModalStack();
    if (!stack.isOpen.value) return;

    const active = document.activeElement;
    const activeContext = getActiveInputContext({
      activeElement: active,
      modalNavigationSelectors: MODAL_NAVIGATION_SELECTOR,
    });
    const editableInModal = activeContext === 'editable-field' && isEditableElementInsideModal(active);
    const interceptKeys = stack.topInterceptKeys.value;
    const escProtection = useEscProtection();

    if (escProtection.isProtecting.value && e.key !== 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      escProtection.dismissProtection();
      return;
    }

    if (e.key === 'ArrowUp') {
      if (!interceptKeys.has('arrows') || editableInModal) return;
      e.preventDefault();
      stack.handleInput('DPadUp');
    } else if (e.key === 'ArrowDown') {
      if (!interceptKeys.has('arrows') || editableInModal) return;
      e.preventDefault();
      stack.handleInput('DPadDown');
    } else if (e.key === 'ArrowLeft') {
      if (!interceptKeys.has('arrows') || editableInModal) return;
      e.preventDefault();
      stack.handleInput('DPadLeft');
    } else if (e.key === 'ArrowRight') {
      if (!interceptKeys.has('arrows') || editableInModal) return;
      e.preventDefault();
      stack.handleInput('DPadRight');
    } else if (e.key === 'Tab') {
      if (!interceptKeys.has('tab')) return;
      e.preventDefault();
      stack.handleInput(e.shiftKey ? 'ShiftTab' : 'Tab');
    } else if (e.key === 'Enter') {
      if (!interceptKeys.has('enter') || (editableInModal && document.activeElement?.tagName === 'TEXTAREA')) return;
      e.preventDefault();
      stack.handleInput('A');
    } else if (e.key === ' ' || e.key === 'Spacebar') {
      if (!interceptKeys.has('space') || editableInModal) return;
      e.preventDefault();
      stack.handleInput('A');
    } else if (e.key === 'Escape') {
      if (!interceptKeys.has('escape')) return;
      e.preventDefault();
      stack.handleInput('B');
    }
  }

  return {
    handleButton,
    handleRelease,
    handleModalKeyboardBridge,
  };
}
