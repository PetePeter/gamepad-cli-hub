#!/usr/bin/env node
/**
 * Gamepad CLI Hub - Main Entry Point
 *
 * Orchestrates all components:
 * - Loads configuration
 * - Starts gamepad listener
 * - Handles button events
 * - Dispatches actions to appropriate modules
 */

import { configLoader } from './config/loader';
import { gamepadInput, type ButtonPressEvent, type ButtonName } from './input/gamepad';
import { SessionManager } from './session/manager';
import { processSpawner } from './session/spawner';
import { windowManager } from './output/windows';
import { keyboard } from './output/keyboard';
import { createTranscriber, type OpenWhisperTranscriber } from './voice/openwhisper';
import type { Binding, KeyboardBinding, VoiceBinding, OpenWhisperBinding, SessionSwitchBinding, SpawnBinding, ListSessionsBinding } from './config/loader';

// ============================================================================
// Application State
// ============================================================================

class GamepadCliHub {
  private sessionManager = new SessionManager();
  private isRunning = false;
  private activeCliType: string | null = null;
  private openwhisper: OpenWhisperTranscriber | null = null;

  // Per-CLI button mappings (A/B/X/Y) for the active session
  private readonly PER_CLI_BUTTONS = ['A', 'B', 'X', 'Y'] as const;

  // ============================================================================
  // Initialization
  // ============================================================================

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('Gamepad CLI Hub is already running');
      return;
    }

    try {
      console.log('Starting Gamepad CLI Hub...');

      // Load configuration
      this.loadConfiguration();

      // Initialize OpenWhisper if configured
      this.initializeOpenWhisper();

      // Setup signal handlers for graceful shutdown
      this.setupSignalHandlers();

      // Register gamepad button handlers
      this.registerButtonHandlers();

      // Start gamepad input listener
      gamepadInput.start();

      // Initialize sessions by detecting existing terminal windows
      await this.initializeExistingSessions();

      this.isRunning = true;
      console.log('Gamepad CLI Hub started successfully');
      console.log('Press Ctrl+C to stop');
      console.log('');
      this.printStatus();

    } catch (error) {
      console.error('Failed to start Gamepad CLI Hub:', error);
      process.exit(1);
    }
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  private loadConfiguration(): void {
    try {
      configLoader.load();
      console.log('Configuration loaded successfully');
    } catch (error) {
      throw new Error(`Failed to load configuration: ${error}`);
    }
  }

  private initializeOpenWhisper(): void {
    try {
      const openwhisperConfig = configLoader.getOpenWhisperConfig();
      if (openwhisperConfig) {
        this.openwhisper = createTranscriber(openwhisperConfig);
        const status = this.openwhisper.getStatus();
        if (status.ready) {
          console.log('OpenWhisper transcription enabled');
        } else {
          console.warn('OpenWhisper configured but not ready:');
          if (!status.whisperExists) {
            console.warn(`  - whisper.exe not found at: ${status.whisperPath}`);
          }
          if (!status.modelExists) {
            console.warn(`  - Model file not found at: ${status.modelPath}`);
          }
          this.openwhisper = null;
        }
      }
    } catch (error) {
      console.warn(`Failed to initialize OpenWhisper: ${error}`);
    }
  }

  // ============================================================================
  // Session Initialization
  // ============================================================================

  private async initializeExistingSessions(): Promise<void> {
    const terminals = windowManager.findTerminalWindows();
    console.log(`Found ${terminals.length} existing terminal window(s)`);

    for (const terminal of terminals) {
      // Try to match terminal to a CLI type based on window title
      const cliType = this.detectCliTypeFromTitle(terminal.title);
      if (cliType) {
        const sessionId = `session-${terminal.processId}`;
        const name = configLoader.getCliTypeName(cliType) || cliType;

        this.sessionManager.addSession({
          id: sessionId,
          name,
          cliType,
          windowHandle: Number(terminal.handle),
          processId: terminal.processId,
        });

        // Set first session as active
        if (this.sessionManager.getSessionCount() === 1) {
          this.activeCliType = cliType;
        }
      }
    }

    if (this.sessionManager.getSessionCount() > 0) {
      console.log(`Initialized ${this.sessionManager.getSessionCount()} session(s)`);
    }
  }

  private detectCliTypeFromTitle(title: string): string | null {
    const lowerTitle = title.toLowerCase();

    // Simple heuristic-based detection
    if (lowerTitle.includes('claude') || lowerTitle.includes('cc')) {
      return 'claude-code';
    }
    if (lowerTitle.includes('copilot') || lowerTitle.includes('gh copilot')) {
      return 'copilot-cli';
    }

    // Default to generic terminal
    return 'generic-terminal';
  }

  // ============================================================================
  // Button Handler Registration
  // ============================================================================

  private registerButtonHandlers(): void {
    // Register a single handler for all button-press events
    gamepadInput.on('button-press', (event: ButtonPressEvent) => {
      this.handleButtonPress(event);
    });

    // Count registered bindings
    const globalBindings = configLoader.getGlobalBindings();
    const cliTypes = configLoader.getCliTypes();
    let totalBindings = Object.keys(globalBindings).length;

    for (const cliType of cliTypes) {
      const bindings = configLoader.getBindings(cliType);
      if (bindings) {
        totalBindings += Object.keys(bindings).length;
      }
    }

    console.log(`Registered handlers for ${totalBindings} button binding(s)`);
  }

  private handleButtonPress(event: ButtonPressEvent): void {
    const { button } = event;

    // First check if this is a global binding (works regardless of active session)
    const globalBindings = configLoader.getGlobalBindings();
    if (button in globalBindings) {
      this.handleBindingAction(globalBindings[button]);
      return;
    }

    // For per-CLI buttons (A/B/X/Y), check the active session's CLI type
    if (this.PER_CLI_BUTTONS.includes(button as any)) {
      const activeSession = this.sessionManager.getActiveSession();
      if (!activeSession) {
        console.log('No active session - ignoring button press');
        return;
      }

      const cliBindings = configLoader.getBindings(activeSession.cliType);
      if (cliBindings && button in cliBindings) {
        this.handleBindingAction(cliBindings[button]);
      } else {
        console.log(`No binding for ${button} in ${activeSession.cliType}`);
      }
    }
  }

  // ============================================================================
  // Action Handling
  // ============================================================================

  private handleBindingAction(binding: Binding): void {
    try {
      switch (binding.action) {
        case 'keyboard':
          this.handleKeyboardAction(binding as KeyboardBinding);
          break;

        case 'voice':
          this.handleVoiceAction(binding as VoiceBinding);
          break;

        case 'openwhisper':
          this.handleOpenWhisperAction(binding as OpenWhisperBinding);
          break;

        case 'session-switch':
          this.handleSessionSwitchAction(binding as SessionSwitchBinding);
          break;

        case 'spawn':
          this.handleSpawnAction(binding as SpawnBinding);
          break;

        case 'list-sessions':
          this.handleListSessionsAction(binding as ListSessionsBinding);
          break;

        default:
          console.warn(`Unknown action type: ${(binding as Binding).action}`);
      }
    } catch (error) {
      console.error(`Error handling action:`, error);
    }
  }

  private handleKeyboardAction(binding: KeyboardBinding): void {
    const { keys } = binding;
    console.log(`Sending keys: ${keys.join(' ')}`);
    keyboard.sendKeys(keys);
  }

  private handleVoiceAction(binding: VoiceBinding): void {
    const duration = binding.holdDuration || 500;
    console.log(`Voice input: holding space for ${duration}ms`);
    keyboard.longPress('space', duration);
  }

  private async handleOpenWhisperAction(binding: OpenWhisperBinding): Promise<void> {
    if (!this.openwhisper) {
      console.warn('OpenWhisper not available - falling back to standard voice input');
      const duration = 500;
      keyboard.longPress('space', duration);
      return;
    }

    const duration = binding.recordingDuration || 5000;
    console.log(`Recording audio for ${duration}ms...`);

    // Record and transcribe
    const result = await this.openwhisper.recordAndTranscribe(duration);

    if (result.success && result.text) {
      console.log(`Transcription: "${result.text}"`);

      // Type the transcribed text into the active session
      const activeSession = this.sessionManager.getActiveSession();
      if (activeSession) {
        // Focus the session first
        windowManager.focusWindow(activeSession.windowHandle);

        // Small delay to ensure window is focused
        await new Promise(resolve => setTimeout(resolve, 100));

        // Type the transcribed text
        keyboard.typeString(result.text);
        console.log('Transcribed text sent to active session');
      } else {
        console.warn('No active session to send text to');
      }
    } else {
      console.error(`Transcription failed: ${result.error || 'Unknown error'}`);
    }
  }

  private handleSessionSwitchAction(binding: SessionSwitchBinding): void {
    const { direction } = binding;

    if (direction === 'next') {
      this.sessionManager.nextSession();
      console.log('Switched to next session');
    } else {
      this.sessionManager.previousSession();
      console.log('Switched to previous session');
    }

    this.focusActiveSession();
  }

  private handleSpawnAction(binding: SpawnBinding): void {
    const { cliType } = binding;
    console.log(`Spawning new ${cliType} instance`);

    const spawned = processSpawner.spawn(cliType);
    if (spawned) {
      console.log(`Spawned ${cliType} (PID: ${spawned.pid})`);
    } else {
      console.error(`Failed to spawn ${cliType}`);
    }
  }

  private handleListSessionsAction(_binding: ListSessionsBinding): void {
    this.printStatus();
  }

  // ============================================================================
  // Session Management
  // ============================================================================

  private focusActiveSession(): void {
    const activeSession = this.sessionManager.getActiveSession();
    if (!activeSession) {
      console.log('No active session to focus');
      return;
    }

    const success = windowManager.focusWindow(activeSession.windowHandle);
    if (success) {
      this.activeCliType = activeSession.cliType;
      console.log(`Focused session: ${activeSession.name} (${activeSession.cliType})`);
    } else {
      console.warn(`Failed to focus session: ${activeSession.name}`);
    }
  }

  // ============================================================================
  // Status Display
  // ============================================================================

  private printStatus(): void {
    console.log('=== Gamepad CLI Hub Status ===');
    console.log('');

    const sessions = this.sessionManager.getAllSessions();
    const activeSession = this.sessionManager.getActiveSession();

    if (sessions.length === 0) {
      console.log('No active sessions');
    } else {
      console.log(`Active Sessions (${sessions.length}):`);
      for (const session of sessions) {
        const isActive = activeSession?.id === session.id;
        const prefix = isActive ? '→ ' : '  ';
        console.log(`${prefix}${session.name} (${session.cliType}) [PID: ${session.processId}]`);
      }
    }

    console.log('');
    console.log(`Connected Gamepads: ${gamepadInput.getConnectedGamepadCount()}`);
    console.log('');
    console.log('Global Bindings:');
    this.printBindings(configLoader.getGlobalBindings());
    console.log('');
  }

  private printBindings(bindings: Record<string, Binding>): void {
    for (const [button, binding] of Object.entries(bindings)) {
      console.log(`  ${button.padEnd(15)} ${binding.action}`);
    }
  }

  // ============================================================================
  // Shutdown
  // ============================================================================

  private setupSignalHandlers(): void {
    // Handle SIGINT (Ctrl+C)
    process.on('SIGINT', () => {
      console.log('');
      console.log('Received SIGINT, shutting down gracefully...');
      this.stop();
    });

    // Handle SIGTERM
    process.on('SIGTERM', () => {
      console.log('Received SIGTERM, shutting down gracefully...');
      this.stop();
    });

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception:', error);
      this.stop();
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled rejection at:', promise, 'reason:', reason);
      this.stop();
      process.exit(1);
    });
  }

  stop(): void {
    if (!this.isRunning) {
      return;
    }

    console.log('Stopping Gamepad CLI Hub...');

    // Stop gamepad input
    gamepadInput.stop();

    // Clear sessions
    this.sessionManager.clear();

    this.isRunning = false;
    console.log('Gamepad CLI Hub stopped');
  }
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main(): Promise<void> {
  const hub = new GamepadCliHub();
  await hub.start();

  // Keep the process alive
  // The event loop is kept alive by the gamepad polling
}

// Start the application if this is the main module
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
