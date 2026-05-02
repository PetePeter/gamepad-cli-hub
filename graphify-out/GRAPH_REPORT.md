# Graph Report - .  (2026-05-02)

## Corpus Check
- Large corpus: 443 files · ~3,111,210 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 2733 nodes · 5232 edges · 74 communities detected
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 213 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Terminal Runtime|Terminal Runtime]]
- [[_COMMUNITY_Terminal Runtime|Terminal Runtime]]
- [[_COMMUNITY_Terminal Runtime|Terminal Runtime]]
- [[_COMMUNITY_Terminal Runtime|Terminal Runtime]]
- [[_COMMUNITY_Plan Workflow|Plan Workflow]]
- [[_COMMUNITY_Helm MCP|Helm MCP]]
- [[_COMMUNITY_Plan Workflow|Plan Workflow]]
- [[_COMMUNITY_Helm MCP|Helm MCP]]
- [[_COMMUNITY_Plan Workflow|Plan Workflow]]
- [[_COMMUNITY_Plan Workflow|Plan Workflow]]
- [[_COMMUNITY_Session Workflow|Session Workflow]]
- [[_COMMUNITY_Terminal Runtime|Terminal Runtime]]
- [[_COMMUNITY_Gamepad Input|Gamepad Input]]
- [[_COMMUNITY_Helm MCP|Helm MCP]]
- [[_COMMUNITY_Session Workflow|Session Workflow]]
- [[_COMMUNITY_Terminal Runtime|Terminal Runtime]]
- [[_COMMUNITY_Helm MCP|Helm MCP]]
- [[_COMMUNITY_Terminal Runtime|Terminal Runtime]]
- [[_COMMUNITY_Plan Workflow|Plan Workflow]]
- [[_COMMUNITY_Telegram Integration|Telegram Integration]]
- [[_COMMUNITY_Keyboard Handlers ComboDown|Keyboard Handlers ComboDown]]
- [[_COMMUNITY_CancelTask ClearTimer CompleteOrReschedule|CancelTask ClearTimer CompleteOrReschedule]]
- [[_COMMUNITY_Plan Workflow|Plan Workflow]]
- [[_COMMUNITY_Terminal Runtime|Terminal Runtime]]
- [[_COMMUNITY_Telegram Integration|Telegram Integration]]
- [[_COMMUNITY_Session Workflow|Session Workflow]]
- [[_COMMUNITY_Session Workflow|Session Workflow]]
- [[_COMMUNITY_Session Workflow|Session Workflow]]
- [[_COMMUNITY_Terminal Runtime|Terminal Runtime]]
- [[_COMMUNITY_Session Workflow|Session Workflow]]
- [[_COMMUNITY_Session Workflow|Session Workflow]]
- [[_COMMUNITY_Print Command Header|Print Command Header]]
- [[_COMMUNITY_Gamepad Input|Gamepad Input]]
- [[_COMMUNITY_Session Workflow|Session Workflow]]
- [[_COMMUNITY_Terminal Runtime|Terminal Runtime]]
- [[_COMMUNITY_Session Workflow|Session Workflow]]
- [[_COMMUNITY_Plan Workflow|Plan Workflow]]
- [[_COMMUNITY_Plan Workflow|Plan Workflow]]
- [[_COMMUNITY_Terminal Runtime|Terminal Runtime]]
- [[_COMMUNITY_Cleanup Constructor EnsureScriptExists|Cleanup Constructor EnsureScriptExists]]
- [[_COMMUNITY_Telegram Integration|Telegram Integration]]
- [[_COMMUNITY_Terminal Runtime|Terminal Runtime]]
- [[_COMMUNITY_Run Results Command|Run Results Command]]
- [[_COMMUNITY_Plan Workflow|Plan Workflow]]
- [[_COMMUNITY_Clear Dequeue Enqueue|Clear Dequeue Enqueue]]
- [[_COMMUNITY_ClearBuffer Dispose ExtractErrors|ClearBuffer Dispose ExtractErrors]]
- [[_COMMUNITY_Session Workflow|Session Workflow]]
- [[_COMMUNITY_Session Workflow|Session Workflow]]
- [[_COMMUNITY_Session Workflow|Session Workflow]]
- [[_COMMUNITY_Terminal Runtime|Terminal Runtime]]
- [[_COMMUNITY_Terminal Runtime|Terminal Runtime]]
- [[_COMMUNITY_GetAllProcesses GetProcess GetProcessesByCliType|GetAllProcesses GetProcess GetProcessesByCliType]]
- [[_COMMUNITY_Session Workflow|Session Workflow]]
- [[_COMMUNITY_Helm MCP|Helm MCP]]
- [[_COMMUNITY_Config Profiles|Config Profiles]]
- [[_COMMUNITY_Session Workflow|Session Workflow]]
- [[_COMMUNITY_Editor History AddEditorHistoryEntry|Editor History AddEditorHistoryEntry]]
- [[_COMMUNITY_Terminal Runtime|Terminal Runtime]]
- [[_COMMUNITY_Bindings Constructor Disconnect|Bindings Constructor Disconnect]]
- [[_COMMUNITY_Telegram Integration|Telegram Integration]]
- [[_COMMUNITY_Find Latest Release|Find Latest Release]]
- [[_COMMUNITY_Terminal Runtime|Terminal Runtime]]
- [[_COMMUNITY_BuildRemoveKeyboard BuildReplyKeyboard IsReplyKeyboardPress|BuildRemoveKeyboard BuildReplyKeyboard IsReplyKeyboardPress]]
- [[_COMMUNITY_Terminal Runtime|Terminal Runtime]]
- [[_COMMUNITY_Actions BuildSettingsDom Chipbar|Actions BuildSettingsDom Chipbar]]
- [[_COMMUNITY_Helm MCP|Helm MCP]]
- [[_COMMUNITY_Boat Paper Accent|Boat Paper Accent]]
- [[_COMMUNITY_NextRunMs SchedulerSection TimeRemaining|NextRunMs SchedulerSection TimeRemaining]]
- [[_COMMUNITY_Release Packaging|Release Packaging]]
- [[_COMMUNITY_Terminal Runtime|Terminal Runtime]]
- [[_COMMUNITY_Config Profiles|Config Profiles]]
- [[_COMMUNITY_Modal UI|Modal UI]]
- [[_COMMUNITY_Session Workflow|Session Workflow]]
- [[_COMMUNITY_Map Structure|Map Structure]]

## God Nodes (most connected - your core abstractions)
1. `ConfigLoader` - 80 edges
2. `get()` - 73 edges
3. `HelmControlService` - 54 edges
4. `ensureLoaded()` - 53 edges
5. `PlanManager` - 47 edges
6. `callTool()` - 46 edges
7. `delete()` - 35 edges
8. `has()` - 30 edges
9. `registerIPCHandlers()` - 30 edges
10. `TerminalManager` - 29 edges

## Surprising Connections (you probably didn't know these)
- `PlanManager` --semantically_similar_to--> `Directory Plans NCN`  [INFERRED] [semantically similar]
  Plans/plan-directory-plans-ncn.html → CLAUDE.md
- `handleGamepadEvent()` --calls--> `handlePlanDeleteConfirmButton()`  [INFERRED]
  renderer\navigation.ts → renderer\modals\plan-delete-confirm.ts
- `bootstrap()` --calls--> `setupKeyboardRelay()`  [INFERRED]
  renderer\composables\useAppBootstrap.ts → renderer\paste-handler.ts
- `renderBindingsDisplay()` --calls--> `sortBindingEntries()`  [INFERRED]
  renderer\screens\settings-bindings.ts → renderer\sort-logic.ts
- `Gamepad Control` --semantically_similar_to--> `Browser Gamepad API`  [INFERRED] [semantically similar]
  README.md → CLAUDE.md

## Hyperedges (group relationships)
- **Helm Core Product Surface** — readme_multi_cli_workflows, readme_embedded_terminals, readme_gamepad_control, readme_telegram_bot, readme_helm_mcp_server [EXTRACTED 1.00]
- **MCP Prompt Delivery Semantics** — release_142_inter_llm_handoff, changelog_submit_suffix, plan_sequence_delivery_refactor, plan_sequence_delivery_helper, plan_submit_suffix_module [INFERRED 0.86]
- **Directory Planning Evolution** — plan_directory_plans_ncn, claude_directory_plans_ncn, group1_plan_draft_core, group2_plan_state_visibility, readme_directory_planning [INFERRED 0.88]
- **Helm MCP Coordination Contract** — config_system_localhost_mcp_server, helm_mcp_protocol_inter_session_coordination, helm_mcp_client_json_envelope, helm_mcp_protocol_session_scoped_token, helm_session_info_tool [EXTRACTED 0.95]
- **Directory Plan Persistence Flow** — directory_plans_ncn, directory_plans_plan_manager, plans_file_individual_json_storage, plans_file_dependency_registry, plan_backup_restore_system [EXTRACTED 0.94]
- **Embedded Terminal Runtime Loop** — terminal_architecture_embedded_pty, terminal_architecture_input_routing, terminal_architecture_activity_dots, modules_terminal_manager, modules_state_detector, group_overview_pty_preview [EXTRACTED 0.92]
- **Renderer Vue Bootstrap** — index_helm_renderer_entrypoint, index_vue_mount, index_vue_main_module [EXTRACTED 1.00]
- **Default Profile Surface** — default_default_profile, default_profile_tools, default_profile_working_directories, default_profile_bindings [EXTRACTED 1.00]
- **Helm v1.2.2 Major Themes** — release_notes_vue_ui_migration, release_notes_planner_chip_workflow, release_notes_cli_integration_improvements, release_notes_tooling_modal_improvements [EXTRACTED 1.00]
- **Helm Paper Boat Brand Mark** — helm-paper-boat_helm_paper_boat_icon, helm-paper-boat_paper_boat_symbol, helm-paper-boat_terminal_prompt_mark, helm-paper-boat_green_wave_accent [INFERRED 0.85]

## Communities

### Community 0 - "Terminal Runtime"
Cohesion: 0.01
Nodes (524): absoluteStoragePath(), actionToPtyData(), add(), addBookmarkedDir(), addCliType(), addDependency(), addPattern(), addPlanAttachment() (+516 more)

### Community 1 - "Terminal Runtime"
Cohesion: 0.01
Nodes (97): clearStartupFallbackTimer(), closeSplashWindow(), createSplashWindow(), createWindow(), maybeShowMainWindow(), readWindowBounds(), resolveSplashLogoUrl(), buildSplashHtml() (+89 more)

### Community 2 - "Terminal Runtime"
Cohesion: 0.02
Nodes (129): autoResumeSessions(), bootstrap(), clamp(), cleanupRendererSession(), doCloseSession(), doSpawn(), doSpawnShell(), getSessionCwd() (+121 more)

### Community 3 - "Terminal Runtime"
Cohesion: 0.01
Nodes (106): createSortControl(), useEscProtection(), useModalStack(), useNavigation(), handleDraftEditorButton(), isDraftEditorVisible(), showDraftEditor(), hideEditorPopup() (+98 more)

### Community 4 - "Plan Workflow"
Cohesion: 0.04
Nodes (84): showView(), handlePlanDeleteConfirmButton(), hidePlanDeleteConfirm(), showPlanDeleteConfirm(), ensureOverlay(), hidePlanHelpModal(), isPlanHelpVisible(), showPlanHelpModal() (+76 more)

### Community 5 - "Helm MCP"
Cohesion: 0.05
Nodes (9): buildLegacySpawnCommand(), ConfigLoader, isCliTypeOptions(), normalizeMcpPort(), normalizeToolConfig(), parseCliArgs(), parseCommandTemplate(), slugify() (+1 more)

### Community 6 - "Plan Workflow"
Cohesion: 0.06
Nodes (5): decodeBase64Content(), HelmControlService, parseSubmitSuffix(), requireResult(), validateMobileFriendlyTelegramText()

### Community 7 - "Helm MCP"
Cohesion: 0.05
Nodes (53): Chip-Bar Action Buttons, Folder Name Inconsistency Fix, Plan Attachments and Sequence Memory MCP Guidance, Configurable Submit Suffix, Telegram Rewrite, Activity Dots, Browser Gamepad API, Directory Plans NCN (+45 more)

### Community 8 - "Plan Workflow"
Cohesion: 0.05
Nodes (15): handleButton(), onSave(), handleButton(), handleButton(), executeDraftAction(), handleActionButton(), handleSubmenuButton(), onActionClick() (+7 more)

### Community 9 - "Plan Workflow"
Cohesion: 0.09
Nodes (2): formatHumanId(), PlanManager

### Community 10 - "Session Workflow"
Cohesion: 0.08
Nodes (25): bestStateEmoji(), buildDashboardKeyboardWithTopics(), buildTopicUrl(), capitalize(), commandPaletteKeyboard(), confirmSendKeyboard(), countStates(), directoryListKeyboard() (+17 more)

### Community 11 - "Terminal Runtime"
Cohesion: 0.06
Nodes (9): applyFocus(), doAutoSave(), handleButton(), onCancel(), onKeyDown(), onLabelKeyDown(), onSave(), makeSections() (+1 more)

### Community 12 - "Gamepad Input"
Cohesion: 0.1
Nodes (5): BrowserGamepadPoller, makeButton(), makeGamepad(), startAndTick(), tick()

### Community 13 - "Helm MCP"
Cohesion: 0.08
Nodes (31): GitHub App Update Provider, Deploy Config Stripping, Two Step Release Workflow, Localhost MCP Server, Self Contained Profile Model, Directory Plan Controls, Default Profile, Profile Bindings Config (+23 more)

### Community 14 - "Session Workflow"
Cohesion: 0.17
Nodes (28): editOriginalMessage(), expandSequence(), findSequenceByLabel(), flattenSequences(), handleAccept(), handleCancel(), handleCloseAll(), handleCommandExec() (+20 more)

### Community 15 - "Terminal Runtime"
Cohesion: 0.1
Nodes (1): TerminalManager

### Community 16 - "Helm MCP"
Cohesion: 0.15
Nodes (12): asAiagentState(), asPlanStatus(), asPlanTypeOrNull(), asRecord(), asString(), asTerminalOutputMode(), getToolReminder(), LocalhostMcpServer (+4 more)

### Community 17 - "Terminal Runtime"
Cohesion: 0.15
Nodes (6): fitToLimit(), simpleHash(), stripEchoes(), stripInputToText(), TerminalMirror, truncateMiddle()

### Community 18 - "Plan Workflow"
Cohesion: 0.19
Nodes (2): PlanBackupManager, toFsSafeTimestamp()

### Community 19 - "Telegram Integration"
Cohesion: 0.16
Nodes (1): TelegramBotCore

### Community 20 - "Keyboard Handlers ComboDown"
Cohesion: 0.13
Nodes (2): setupKeyboardHandlers(), KeyboardSimulator

### Community 21 - "CancelTask ClearTimer CompleteOrReschedule"
Cohesion: 0.21
Nodes (3): parseSubmitSuffix(), ScheduledTaskManager, splitCliParams()

### Community 22 - "Plan Workflow"
Cohesion: 0.1
Nodes (2): handleButton(), navigateTab()

### Community 23 - "Terminal Runtime"
Cohesion: 0.11
Nodes (1): TerminalView

### Community 24 - "Telegram Integration"
Cohesion: 0.24
Nodes (19): applyStartStopStyle(), buildActionButtons(), buildChatIdRow(), buildConnectionSection(), buildEnabledRow(), buildInstanceNameRow(), buildNotificationsSection(), buildSecuritySection() (+11 more)

### Community 25 - "Session Workflow"
Cohesion: 0.19
Nodes (1): SessionManager

### Community 26 - "Session Workflow"
Cohesion: 0.18
Nodes (2): StateDetector, stripAnsi()

### Community 27 - "Session Workflow"
Cohesion: 0.16
Nodes (2): buildContent(), NotificationManager

### Community 28 - "Terminal Runtime"
Cohesion: 0.12
Nodes (18): Binding Action Types, Pattern Rules, Sequence Parser Syntax, Navigation Priority Chain, Default Profile Gamepad Bindings, Group Overview Mode, PTY Output Preview Grid, StateDetector Module (+10 more)

### Community 29 - "Session Workflow"
Cohesion: 0.2
Nodes (1): TopicManager

### Community 30 - "Session Workflow"
Cohesion: 0.14
Nodes (1): WindowManager

### Community 31 - "Print Command Header"
Cohesion: 0.2
Nodes (15): _cleanup(), _command_wrapper_name(), dependencies_ready(), _install_signal_handlers(), main(), print_header(), print_step(), Print a formatted header (+7 more)

### Community 32 - "Gamepad Input"
Cohesion: 0.17
Nodes (2): createGamepadInput(), GamepadInput

### Community 33 - "Session Workflow"
Cohesion: 0.22
Nodes (1): PatternMatcher

### Community 34 - "Terminal Runtime"
Cohesion: 0.18
Nodes (2): escapeShellArg(), PtyManager

### Community 35 - "Session Workflow"
Cohesion: 0.24
Nodes (2): groupByDirectory(), PinnedDashboard

### Community 36 - "Plan Workflow"
Cohesion: 0.34
Nodes (2): PlanAttachmentManager, sanitizeFilename()

### Community 37 - "Plan Workflow"
Cohesion: 0.14
Nodes (15): Renderer Content Security Policy, Helm Renderer Entrypoint, vue-main.ts Module, Vue App Mount Point, xterm Stylesheet, Bracketed Paste Support, CLI Integration Improvements, IncomingPlansWatcher (+7 more)

### Community 38 - "Terminal Runtime"
Cohesion: 0.22
Nodes (13): bump_version(), check_git_clean(), cleanup_deploy_configs(), create_deploy_configs(), main(), patch_native_modules(), Remove the config-deploy/ staging directory., Abort if working tree is dirty. (+5 more)

### Community 39 - "Cleanup Constructor EnsureScriptExists"
Cohesion: 0.26
Nodes (1): WindowsWindowManager

### Community 40 - "Telegram Integration"
Cohesion: 0.22
Nodes (4): escapeHtml(), formatMessageForTelegram(), TelegramRelayService, wrapTelegramEnvelope()

### Community 41 - "Terminal Runtime"
Cohesion: 0.15
Nodes (1): MockResizeObserver

### Community 42 - "Run Results Command"
Cohesion: 0.27
Nodes (11): extract_test_results(), format_markdown_output(), main(), Run tests based on mode., Run ESLint if available., Run a command and return result info., Extract test results from output., Format results as markdown. (+3 more)

### Community 43 - "Plan Workflow"
Cohesion: 0.2
Nodes (1): IncomingPlansWatcher

### Community 44 - "Clear Dequeue Enqueue"
Cohesion: 0.18
Nodes (1): PipelineQueue

### Community 45 - "ClearBuffer Dispose ExtractErrors"
Cohesion: 0.23
Nodes (5): extractErrors(), extractModifiedFiles(), extractTestResults(), formatRecentOutput(), OutputSummarizer

### Community 46 - "Session Workflow"
Cohesion: 0.18
Nodes (2): flush(), loadAndFlush()

### Community 47 - "Session Workflow"
Cohesion: 0.44
Nodes (8): registerIPCHandlers(), setupAppHandlers(), setupConfigHandlers(), setupGamepadHandlers(), setupKeyboardHandlers(), setupSessionHandlers(), setupSpawnHandlers(), setupWindowHandlers()

### Community 48 - "Session Workflow"
Cohesion: 0.25
Nodes (1): DraftManager

### Community 50 - "Terminal Runtime"
Cohesion: 0.31
Nodes (1): TerminalOutputBuffer

### Community 51 - "Terminal Runtime"
Cohesion: 0.28
Nodes (1): FakePtyManager

### Community 53 - "GetAllProcesses GetProcess GetProcessesByCliType"
Cohesion: 0.32
Nodes (1): ProcessSpawner

### Community 54 - "Session Workflow"
Cohesion: 0.32
Nodes (1): TelegramNotifier

### Community 56 - "Helm MCP"
Cohesion: 0.29
Nodes (2): normalizePort(), onPortBlur()

### Community 57 - "Config Profiles"
Cohesion: 0.43
Nodes (1): ConfigLoader

### Community 58 - "Session Workflow"
Cohesion: 0.29
Nodes (1): FakeSessionManager

### Community 60 - "Editor History AddEditorHistoryEntry"
Cohesion: 0.47
Nodes (3): addEditorHistoryEntry(), loadEditorHistory(), saveEditorHistory()

### Community 61 - "Terminal Runtime"
Cohesion: 0.33
Nodes (1): MockResizeObserver

### Community 62 - "Bindings Constructor Disconnect"
Cohesion: 0.33
Nodes (1): MockResizeObserver

### Community 64 - "Telegram Integration"
Cohesion: 0.33
Nodes (1): MockTelegramBot

### Community 65 - "Find Latest Release"
Cohesion: 0.6
Nodes (4): find_latest_release(), main(), Find the latest dated release folder., run()

### Community 66 - "Terminal Runtime"
Cohesion: 0.6
Nodes (4): actionToPtyData(), comboToPtySequence(), keyToPtySequence(), scheduleInitialPrompt()

### Community 67 - "BuildRemoveKeyboard BuildReplyKeyboard IsReplyKeyboardPress"
Cohesion: 0.5
Nodes (2): buildReplyKeyboard(), sendWithReplyKeyboard()

### Community 69 - "Terminal Runtime"
Cohesion: 0.67
Nodes (2): applyPtyFilters(), stripAltScreen()

### Community 70 - "Actions BuildSettingsDom Chipbar"
Cohesion: 0.67
Nodes (2): getMockWindow(), getModule()

### Community 71 - "Helm MCP"
Cohesion: 0.67
Nodes (2): setupTestFiles(), writeYaml()

### Community 74 - "Boat Paper Accent"
Cohesion: 0.67
Nodes (4): Green Wave Accent, Helm Paper Boat Icon, Paper Boat Symbol, Terminal Prompt Mark

### Community 75 - "NextRunMs SchedulerSection TimeRemaining"
Cohesion: 1.0
Nodes (2): nextRunMs(), timeRemaining()

### Community 94 - "Release Packaging"
Cohesion: 1.0
Nodes (2): Electron MIT License, Chromium Third Party Credits

### Community 95 - "Terminal Runtime"
Cohesion: 1.0
Nodes (2): Empty Drafts Config, Empty Sessions Config

### Community 96 - "Config Profiles"
Cohesion: 1.0
Nodes (2): Haptic Feedback Setting, Notifications Setting

### Community 134 - "Modal UI"
Cohesion: 1.0
Nodes (1): Modal Guard Regression Fixes

### Community 135 - "Session Workflow"
Cohesion: 1.0
Nodes (1): Persisted Sessions

### Community 136 - "Map Structure"
Cohesion: 1.0
Nodes (1): File Structure Module Map

## Ambiguous Edges - Review These
- `Group 1 Plan Screen and Draft Editor Core` → `Drafts Config Empty`  [AMBIGUOUS]
  config/drafts.yaml · relation: conceptually_related_to
- `Legacy Helm Envelope Reference` → `Helm JSON Envelope`  [AMBIGUOUS]
  docs/helm-envelope-reference.md · relation: semantically_similar_to
- `Helm v1.2.2 Release Notes` → `Preserve Me User File`  [AMBIGUOUS]
  tmp/user-file.txt · relation: conceptually_related_to

## Knowledge Gaps
- **74 isolated node(s):** `Run shell command, printing output in real-time.`, `Patch node-pty .gyp files to disable Spectre mitigation requirement.      VS 2`, `Bump version in package.json and return (old_version, new_version).`, `Create stripped config files in config-deploy/ for packaging.      Original co`, `Remove the config-deploy/ staging directory.` (+69 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Plan Workflow`** (48 nodes): `plan-manager.js`, `formatHumanId()`, `PlanManager`, `.addDependency()`, `.allocateHumanId()`, `.applyItem()`, `.assignSequence()`, `.bulkAssignSequence()`, `.canAddDependency()`, `.canSetState()`, `.cleanupOrphanSequenceMemberships()`, `.completeItem()`, `.constructor()`, `.create()`, `.createSequence()`, `.createWithType()`, `.delete()`, `.deleteCompletedForDirectory()`, `.deleteSequence()`, `.deleteSequenceWithPlans()`, `.ensurePlanMetadata()`, `.exportAll()`, `.exportDirectory()`, `.exportItem()`, `.getAllDoingForDirectory()`, `.getDoingForSession()`, `.getForDirectory()`, `.getItem()`, `.getSequence()`, `.getSequencesForDirectory()`, `.getStartableForDirectory()`, `.hasItem()`, `.importAll()`, `.importItem()`, `.loadFromDisk()`, `.migrateOldStatus()`, `.noteHumanId()`, `.recomputeStartable()`, `.removeDependency()`, `.reopenItem()`, `.resolveItemRef()`, `.resolveUniqueTitle()`, `.saveDir()`, `.setState()`, `.update()`, `.updateSequence()`, `.updateWithType()`, `.wouldCreateCycle()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Terminal Runtime`** (29 nodes): `TerminalManager`, `.adoptTerminal()`, `.constructor()`, `.createTerminal()`, `.deselect()`, `.destroyTerminal()`, `.detachTerminal()`, `.dispose()`, `.fitActive()`, `.fitAll()`, `.focusActive()`, `.getActiveSessionId()`, `.getActiveView()`, `.getCount()`, `.getOutputBuffer()`, `.getSession()`, `.getSessionIds()`, `.getTerminalLines()`, `.getTitle()`, `.has()`, `.hasTerminal()`, `.renameSession()`, `.setOnEmpty()`, `.setOnSwitch()`, `.setOnTitleChange()`, `.setupIpcListeners()`, `.setupResizeObserver()`, `.switchTo()`, `.writeToTerminal()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Plan Workflow`** (22 nodes): `PlanBackupManager`, `.constructor()`, `.createSnapshot()`, `.deleteAllSnapshots()`, `.deleteSnapshot()`, `.getBackupDirForPath()`, `.getBackupSummary()`, `.getConfig()`, `.getDefaultConfig()`, `.getNewestSnapshot()`, `.getNextIndexForTimestamp()`, `.getOldestSnapshot()`, `.listSnapshots()`, `.loadConfig()`, `.pruneOldSnapshots()`, `.resolveBackupsRootDir()`, `.restoreFromSnapshot()`, `.saveConfig()`, `.updateConfig()`, `.validateConfig()`, `.validateSnapshot()`, `toFsSafeTimestamp()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Telegram Integration`** (22 nodes): `bot.js`, `TelegramBotCore`, `.answerCallback()`, `.closeForumTopic()`, `.createForumTopic()`, `.deleteForumTopic()`, `.editForumTopic()`, `.editMessageDebounced()`, `.flushEdit()`, `.getBot()`, `.getChatId()`, `.handleCallbackQuery()`, `.handleMessage()`, `.isAuthorized()`, `.isRateLimited()`, `.isRunning()`, `.reopenForumTopic()`, `.sendMessage()`, `.sendToTopic()`, `.start()`, `.stop()`, `.withTimeout()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Keyboard Handlers ComboDown`** (22 nodes): `keyboard.js`, `keyboard-handlers.js`, `keyboard.js`, `setupKeyboardHandlers()`, `KeyboardSimulator`, `.comboDown()`, `.comboUp()`, `.constructor()`, `.getKeyDelay()`, `.keyDown()`, `.keyTap()`, `.keyUp()`, `.longPress()`, `.normalizeKey()`, `.sendKey()`, `.sendKeyCombo()`, `.sendKeys()`, `.setKeyDelay()`, `.typeString()`, `keyboard-handlers.ts`, `keyboard.ts`, `keyboard.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Plan Workflow`** (21 nodes): `BindingsTab.vue`, `PlansGrid.vue`, `ProfilesTab.vue`, `SessionCard.vue`, `SessionGroup.vue`, `SessionList.vue`, `SettingsPanel.vue`, `SortBar.vue`, `SpawnGrid.vue`, `StatusStrip.vue`, `TelegramTab.vue`, `ToolsTab.vue`, `colClass()`, `onRenameKeydown()`, `selectState()`, `handleButton()`, `navigateTab()`, `makeCardProps()`, `makeGroupProps()`, `makeSessionListProps()`, `sidebar.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Terminal Runtime`** (20 nodes): `TerminalView`, `.blur()`, `.clear()`, `.clearSelection()`, `.constructor()`, `.dispose()`, `.findNext()`, `.findPrevious()`, `.fit()`, `.focus()`, `.getBufferLines()`, `.getDimensions()`, `.getSelection()`, `.hasSelection()`, `.isBracketedPasteEnabled()`, `.paste()`, `.scroll()`, `.scrollLines()`, `.scrollToBottom()`, `.write()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Session Workflow`** (19 nodes): `manager.js`, `manager.js`, `SessionManager`, `.addSession()`, `.clear()`, `.constructor()`, `.getActiveSession()`, `.getAllSessions()`, `.getSession()`, `.getSessionCount()`, `.hasSession()`, `.nextSession()`, `.persistSessions()`, `.previousSession()`, `.removeSession()`, `.renameSession()`, `.restoreSessions()`, `.setActiveSession()`, `.updateSession()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Session Workflow`** (19 nodes): `state-detector.js`, `StateDetector`, `.clearActivityTimers()`, `.constructor()`, `.dispose()`, `.getLastOutputTime()`, `.getOrCreate()`, `.getState()`, `.hasQuestion()`, `.markActive()`, `.markResizing()`, `.markRestored()`, `.markScrolling()`, `.markSwitching()`, `.processOutput()`, `.promoteIfRecentOutput()`, `.removeSession()`, `.resetActivityTimers()`, `stripAnsi()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Session Workflow`** (18 nodes): `notification-manager.js`, `buildContent()`, `NotificationManager`, `.constructor()`, `.dispose()`, `.feedOutput()`, `.getAppVisibility()`, `.getAppVisibilityDetails()`, `.getLastLines()`, `.handleActivityChange()`, `.maybeNotify()`, `.notifyLlmDirected()`, `.removeSession()`, `.setActiveSessionIdGetter()`, `.setScreenLockChecker()`, `.setTelegramNotifier()`, `.shouldNotify()`, `.showNotification()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Session Workflow`** (17 nodes): `topic-manager.js`, `TopicManager`, `.closeSessionTopic()`, `.constructor()`, `.createTopicForSession()`, `.deleteTopic()`, `.ensureAllTopics()`, `.ensureTopic()`, `.findSessionByTopicId()`, `.formatTopicName()`, `.getSessionIdByTopic()`, `.getTopicId()`, `.handleTopicClosed()`, `.probeTopic()`, `.renameSessionTopic()`, `.setInstanceName()`, `.updateSessionTopicId()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Session Workflow`** (17 nodes): `WindowManager`, `.assignSessionToWindow()`, `.closeAllChildWindows()`, `.focusWindowForSession()`, `.getAllWindows()`, `.getChildWindowIds()`, `.getMainWindow()`, `.getSessionsInWindow()`, `.getSnappedOutSessions()`, `.getWindow()`, `.getWindowForSession()`, `.getWindowIdForSession()`, `.isSessionSnappedOut()`, `.registerWindow()`, `.setMainWindow()`, `.unassignSession()`, `.unregisterWindow()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Gamepad Input`** (16 nodes): `gamepad.js`, `createGamepadInput()`, `GamepadInput`, `.checkButton()`, `.constructor()`, `.emitButtonEvent()`, `.getConnectedGamepadCount()`, `.handleButtonPress()`, `.isButtonPressed()`, `.off()`, `.on()`, `.onButton()`, `.processState()`, `.setDebounceTime()`, `.start()`, `.stop()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Session Workflow`** (15 nodes): `pattern-matcher.js`, `PatternMatcher`, `.cancelSchedule()`, `.constructor()`, `.dispose()`, `.executeSendText()`, `.executeWaitUntil()`, `.getPendingSchedule()`, `.getRegex()`, `.isReady()`, `.processOutput()`, `.recordFired()`, `.removeSession()`, `.sequenceToString()`, `.stripAnsi()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Terminal Runtime`** (15 nodes): `pty-manager.js`, `escapeShellArg()`, `PtyManager`, `.constructor()`, `.deliverText()`, `.getPid()`, `.getSessionIds()`, `.getTerminalTail()`, `.has()`, `.kill()`, `.killAll()`, `.resize()`, `.setTextDeliveryHandler()`, `.spawn()`, `.write()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Session Workflow`** (15 nodes): `pinned-dashboard.js`, `groupByDirectory()`, `PinnedDashboard`, `.appendSessionGroups()`, `.buildDashboardKeyboard()`, `.buildDashboardText()`, `.constructor()`, `.createOrUpdate()`, `.dispose()`, `.handleEditError()`, `.pinMessage()`, `.setInstanceName()`, `.start()`, `.stop()`, `.update()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Plan Workflow`** (15 nodes): `PlanAttachmentManager`, `.absoluteStoragePath()`, `.add()`, `.assertInside()`, `.constructor()`, `.delete()`, `.deletePlanAttachments()`, `.getToTempFile()`, `.hasAnyForPlanIds()`, `.list()`, `.loadIndex()`, `.planStorageDir()`, `.requirePlan()`, `.saveIndex()`, `sanitizeFilename()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cleanup Constructor EnsureScriptExists`** (13 nodes): `windows.js`, `WindowsWindowManager`, `.cleanup()`, `.constructor()`, `.ensureScriptExists()`, `.enumerateWindows()`, `.executeWindowScript()`, `.findTerminalWindows()`, `.findWindowsByProcessName()`, `.findWindowsByTitle()`, `.focusWindow()`, `.getActiveWindow()`, `.getProcesses()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Terminal Runtime`** (13 nodes): `createContainer()`, `lastFitAddon()`, `lastSearchAddon()`, `lastTerminal()`, `makeMockFitAddon()`, `makeMockSearchAddon()`, `makeMockTerminal()`, `MockResizeObserver`, `.constructor()`, `.disconnect()`, `.observe()`, `.unobserve()`, `terminal-manager.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Plan Workflow`** (12 nodes): `incoming-plans-watcher.js`, `IncomingPlansWatcher`, `.close()`, `.constructor()`, `.deleteFile()`, `.getFailedFiles()`, `.getIncomingDir()`, `.listFiles()`, `.processFile()`, `.rejectFile()`, `.start()`, `.validate()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Clear Dequeue Enqueue`** (12 nodes): `pipeline-queue.js`, `PipelineQueue`, `.clear()`, `.dequeue()`, `.enqueue()`, `.getAll()`, `.getPosition()`, `.has()`, `.length()`, `.peek()`, `.pop()`, `.triggerHandoff()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Session Workflow`** (12 nodes): `buildSidebarDom()`, `createMockTerminalManager()`, `enterRenameMode()`, `flush()`, `getSessions()`, `getSessionsState()`, `getState()`, `loadAndFlush()`, `makeSessions()`, `pressKey()`, `setMockTerminalSessions()`, `sessions-screen.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Session Workflow`** (11 nodes): `draft-manager.js`, `DraftManager`, `.clearSession()`, `.count()`, `.create()`, `.delete()`, `.exportAll()`, `.get()`, `.getForSession()`, `.importAll()`, `.update()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Terminal Runtime`** (10 nodes): `TerminalOutputBuffer`, `.append()`, `.appendToLineBuffer()`, `.clear()`, `.clearAll()`, `.collapseCarriageReturn()`, `.constructor()`, `.getLines()`, `.getOrCreate()`, `.tail()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Terminal Runtime`** (9 nodes): `FakePtyManager`, `.constructor()`, `.deliverText()`, `.emitExit()`, `.getWrites()`, `.has()`, `.spawn()`, `.spawnCommand()`, `.write()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `GetAllProcesses GetProcess GetProcessesByCliType`** (8 nodes): `spawner.js`, `ProcessSpawner`, `.getAllProcesses()`, `.getProcess()`, `.getProcessesByCliType()`, `.kill()`, `.killAll()`, `.spawn()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Session Workflow`** (8 nodes): `notifier.js`, `TelegramNotifier`, `.constructor()`, `.dispose()`, `.handleStateChange()`, `.removeSession()`, `.sendNotification()`, `.shouldNotify()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Helm MCP`** (8 nodes): `McpTab.vue`, `normalizePort()`, `onClearToken()`, `onGenerateToken()`, `onPortBlur()`, `onToggleEnabled()`, `onTokenBlur()`, `mcp-tab.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Config Profiles`** (7 nodes): `config-loader.js`, `ConfigLoader`, `.constructor()`, `.getCliTypes()`, `.getSpawnConfig()`, `.load()`, `.reload()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Session Workflow`** (7 nodes): `FakeSessionManager`, `.addSession()`, `.getActiveSession()`, `.getSession()`, `.removeSession()`, `.setActiveSession()`, `.spawn()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Terminal Runtime`** (6 nodes): `MockResizeObserver`, `.constructor()`, `.disconnect()`, `.observe()`, `.unobserve()`, `bindings-pty.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Bindings Constructor Disconnect`** (6 nodes): `MockResizeObserver`, `.constructor()`, `.disconnect()`, `.observe()`, `.unobserve()`, `bindings-target.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Telegram Integration`** (6 nodes): `MockTelegramBot`, `.constructor()`, `._emit()`, `.on()`, `startedBot()`, `telegram-bot.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `BuildRemoveKeyboard BuildReplyKeyboard IsReplyKeyboardPress`** (5 nodes): `reply-keyboard.js`, `buildRemoveKeyboard()`, `buildReplyKeyboard()`, `isReplyKeyboardPress()`, `sendWithReplyKeyboard()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Terminal Runtime`** (4 nodes): `pty-filter.ts`, `applyPtyFilters()`, `stripAltScreen()`, `pty-filter.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Actions BuildSettingsDom Chipbar`** (4 nodes): `buildSettingsDom()`, `getMockWindow()`, `getModule()`, `chipbar-actions-settings.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Helm MCP`** (4 nodes): `readYaml()`, `setupTestFiles()`, `mcp-config.test.ts`, `writeYaml()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `NextRunMs SchedulerSection TimeRemaining`** (3 nodes): `SchedulerSection.vue`, `nextRunMs()`, `timeRemaining()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Release Packaging`** (2 nodes): `Electron MIT License`, `Chromium Third Party Credits`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Terminal Runtime`** (2 nodes): `Empty Drafts Config`, `Empty Sessions Config`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Config Profiles`** (2 nodes): `Haptic Feedback Setting`, `Notifications Setting`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Modal UI`** (1 nodes): `Modal Guard Regression Fixes`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Session Workflow`** (1 nodes): `Persisted Sessions`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Map Structure`** (1 nodes): `File Structure Module Map`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Group 1 Plan Screen and Draft Editor Core` and `Drafts Config Empty`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Legacy Helm Envelope Reference` and `Helm JSON Envelope`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **What is the exact relationship between `Helm v1.2.2 Release Notes` and `Preserve Me User File`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `PlanManager` connect `Plan Workflow` to `Terminal Runtime`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Why does `ConfigLoader` connect `Helm MCP` to `Terminal Runtime`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Why does `TerminalManager` connect `Terminal Runtime` to `Terminal Runtime`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **What connects `Run shell command, printing output in real-time.`, `Patch node-pty .gyp files to disable Spectre mitigation requirement.      VS 2`, `Bump version in package.json and return (old_version, new_version).` to the rest of the system?**
  _74 weakly-connected nodes found - possible documentation gaps or missing edges._