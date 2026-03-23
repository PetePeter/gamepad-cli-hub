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
import { logger } from './utils/logger.js';

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
      logger.warn('Gamepad CLI Hub is already running');
      return;
    }

    try {
      logger.info('Starting Gamepad CLI Hub...');

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
      logger.info('Gamepad CLI Hub started successfully');
      logger.info('Press Ctrl+C to stop');
      logger.info('');
      this.printStatus();

    } catch (error) {
      logger.error(`Failed to start Gamepad CLI Hub: ${error}`);
      process.exit(1);
    }
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  private loadConfiguration(): void {
    try {
      configLoader.load();
      logger.info('Configuration loaded successfully');
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
          logger.info('OpenWhisper transcription enabled');
        } else {
          logger.warn('OpenWhisper configured but not ready:');
          if (!status.whisperExists) {
            logger.warn(`  - whisper.exe not found at: ${status.whisperPath}`);
          }
          if (!status.modelExists) {
            logger.warn(`  - Model file not found at: ${status.modelPath}`);
          }
          this.openwhisper = null;
        }
      }
    } catch (error) {
      logger.warn(`Failed to initialize OpenWhisper: ${error}`);
    }
  }

  // ============================================================================
  // Session Initialization
  // ============================================================================

  private async initializeExistingSessions(): Promise<void> {
    const terminals = await windowManager.findTerminalWindows();
    logger.info(`Found ${terminals.length} existing terminal window(s)`);

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
          windowHandle: terminal.hwnd,
          processId: terminal.processId,
        });

        // Set first session as active
        if (this.sessionManager.getSessionCount() === 1) {
          this.activeCliType = cliType;
        }
      }
    }

    if (this.sessionManager.getSessionCount() > 0) {
      logger.info(`Initialized ${this.sessionManager.getSessionCount()} session(s)`);
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

    logger.info(`Registered handlers for ${totalBindings} button binding(s)`);
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
        logger.debug('No active session - ignoring button press');
        return;
      }

      const cliBindings = configLoader.getBindings(activeSession.cliType);
      if (cliBindings && button in cliBindings) {
        this.handleBindingAction(cliBindings[button]);
      } else {
        logger.debug(`No binding for ${button} in ${activeSession.cliType}`);
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
          logger.warn(`Unknown action type: ${(binding as Binding).action}`);
      }
    } catch (error) {
      logger.error(`Error handling action: ${error}`);
    }
  }

  private handleKeyboardAction(binding: KeyboardBinding): void {
    const { keys } = binding;
    logger.debug(`Sending keys: ${keys.join(' ')}`);
    keyboard.sendKeys(keys);
  }

  private handleVoiceAction(binding: VoiceBinding): void {
    const duration = binding.holdDuration || 500;
    logger.debug(`Voice input: holding space for ${duration}ms`);
    keyboard.longPress('space', duration);
  }

  private async handleOpenWhisperAction(binding: OpenWhisperBinding): Promise<void> {
    if (!this.openwhisper) {
      logger.warn('OpenWhisper not available - falling back to standard voice input');
      const duration = 500;
      keyboard.longPress('space', duration);
      return;
    }

    const duration = binding.recordingDuration || 5000;
    logger.debug(`Recording audio for ${duration}ms...`);

    // Record and transcribe
    const result = await this.openwhisper.recordAndTranscribe(duration);

    if (result.success && result.text) {
      logger.info(`Transcription: "${result.text}"`);

      // Type the transcribed text into the active session
      const activeSession = this.sessionManager.getActiveSession();
      if (activeSession) {
        // Focus the session first
        await windowManager.focusWindow(activeSession.windowHandle);

        // Small delay to ensure window is focused
        await new Promise(resolve => setTimeout(resolve, 100));

        // Type the transcribed text
        keyboard.typeString(result.text);
        logger.info('Transcribed text sent to active session');
      } else {
        logger.warn('No active session to send text to');
      }
    } else {
      logger.error(`Transcription failed: ${result.error || 'Unknown error'}`);
    }
  }

  private handleSessionSwitchAction(binding: SessionSwitchBinding): void {
    const { direction } = binding;

    if (direction === 'next') {
      this.sessionManager.nextSession();
      logger.info('Switched to next session');
    } else {
      this.sessionManager.previousSession();
      logger.info('Switched to previous session');
    }

    this.focusActiveSession();
  }

  private handleSpawnAction(binding: SpawnBinding): void {
    const { cliType } = binding;
    logger.info(`Spawning new ${cliType} instance`);

    const spawned = processSpawner.spawn(cliType);
    if (spawned) {
      logger.info(`Spawned ${cliType} (PID: ${spawned.pid})`);
    } else {
      logger.error(`Failed to spawn ${cliType}`);
    }
  }

  private handleListSessionsAction(_binding: ListSessionsBinding): void {
    this.printStatus();
  }

  // ============================================================================
  // Session Management
  // ============================================================================

  private async focusActiveSession(): Promise<void> {
    const activeSession = this.sessionManager.getActiveSession();
    if (!activeSession) {
      logger.debug('No active session to focus');
      return;
    }

    const success = await windowManager.focusWindow(activeSession.windowHandle);
    if (success) {
      this.activeCliType = activeSession.cliType;
      logger.debug(`Focused session: ${activeSession.name} (${activeSession.cliType})`);
    } else {
      logger.warn(`Failed to focus session: ${activeSession.name}`);
    }
  }

  // ============================================================================
  // Status Display
  // ============================================================================

  private printStatus(): void {
    logger.info('=== Gamepad CLI Hub Status ===');
    logger.info('');

    const sessions = this.sessionManager.getAllSessions();
    const activeSession = this.sessionManager.getActiveSession();

    if (sessions.length === 0) {
      logger.info('No active sessions');
    } else {
      logger.info(`Active Sessions (${sessions.length}):`);
      for (const session of sessions) {
        const isActive = activeSession?.id === session.id;
        const prefix = isActive ? '→ ' : '  ';
        logger.info(`${prefix}${session.name} (${session.cliType}) [PID: ${session.processId}]`);
      }
    }

    logger.info('');
    logger.info(`Connected Gamepads: ${gamepadInput.getConnectedGamepadCount()}`);
    logger.info('');
    logger.info('Global Bindings:');
    this.printBindings(configLoader.getGlobalBindings());
    logger.info('');
  }

  private printBindings(bindings: Record<string, Binding>): void {
    for (const [button, binding] of Object.entries(bindings)) {
      logger.info(`  ${button.padEnd(15)} ${binding.action}`);
    }
  }

  // ============================================================================
  // Shutdown
  // ============================================================================

  private setupSignalHandlers(): void {
    // Handle SIGINT (Ctrl+C)
    process.on('SIGINT', () => {
      logger.info('');
      logger.info('Received SIGINT, shutting down gracefully...');
      this.stop();
    });

    // Handle SIGTERM
    process.on('SIGTERM', () => {
      logger.info('Received SIGTERM, shutting down gracefully...');
      this.stop();
    });

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logger.error(`Uncaught exception: ${error}`);
      this.stop();
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error(`Unhandled rejection at: ${promise} reason: ${reason}`);
      this.stop();
      process.exit(1);
    });
  }

  stop(): void {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping Gamepad CLI Hub...');

    // Stop gamepad input
    gamepadInput.stop();

    // Clear sessions
    this.sessionManager.clear();

    this.isRunning = false;
    logger.info('Gamepad CLI Hub stopped');
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
  logger.error(`Fatal error: ${error}`);
  process.exit(1);
});
