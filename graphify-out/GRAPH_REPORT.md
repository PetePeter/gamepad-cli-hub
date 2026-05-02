# Graph Report - gamepad-cli-hub  (2026-05-02)

## Corpus Check
- 393 files · ~3,096,694 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2738 nodes · 5239 edges · 71 communities detected
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 213 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 90|Community 90]]
- [[_COMMUNITY_Community 91|Community 91]]
- [[_COMMUNITY_Community 92|Community 92]]
- [[_COMMUNITY_Community 130|Community 130]]
- [[_COMMUNITY_Community 131|Community 131]]
- [[_COMMUNITY_Community 132|Community 132]]

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
- `Directory Plans NCN` --semantically_similar_to--> `PlanManager`  [INFERRED] [semantically similar]
  CLAUDE.md → Plans/plan-directory-plans-ncn.html
- `executeCliBinding()` --calls--> `showDraftEditor()`  [INFERRED]
  renderer\bindings.ts → renderer\drafts\draft-editor.ts
- `handleGamepadEvent()` --calls--> `handleCloseConfirmButton()`  [INFERRED]
  renderer\navigation.ts → renderer\modals\close-confirm.ts
- `handleGamepadEvent()` --calls--> `handleSequencePickerButton()`  [INFERRED]
  renderer\navigation.ts → renderer\modals\sequence-picker.ts
- `setupKeyboardRelay()` --calls--> `bootstrap()`  [INFERRED]
  renderer\paste-handler.ts → renderer\composables\useAppBootstrap.ts

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

### Community 0 - "Community 0"
Cohesion: 0.01
Nodes (525): absoluteStoragePath(), actionToPtyData(), add(), addBookmarkedDir(), addCliType(), addDependency(), addPattern(), addPlanAttachment() (+517 more)

### Community 1 - "Community 1"
Cohesion: 0.01
Nodes (93): setupConfigHandlers(), setupDraftHandlers(), setupEditorHandlers(), setupPlanHandlers(), setupProfileHandlers(), cancelAllPrompts(), setupPtyHandlers(), setupSessionHandlers() (+85 more)

### Community 2 - "Community 2"
Cohesion: 0.02
Nodes (137): createSortControl(), autoResumeSessions(), bootstrap(), clamp(), cleanupRendererSession(), doCloseSession(), doSpawn(), doSpawnShell() (+129 more)

### Community 3 - "Community 3"
Cohesion: 0.02
Nodes (89): useEscProtection(), hideEditorPopup(), actionToPtyData(), comboToPtySequence(), executeSequenceString(), keyToPtySequence(), appendText(), canonicalizeKey() (+81 more)

### Community 4 - "Community 4"
Cohesion: 0.03
Nodes (93): useModalStack(), useNavigation(), handleDraftEditorButton(), isDraftEditorVisible(), showDraftEditor(), handleBindingEditorButton(), handleDraftActionButton(), handleDraftSubmenuButton() (+85 more)

### Community 5 - "Community 5"
Cohesion: 0.05
Nodes (17): buildLegacySpawnCommand(), ConfigLoader, isCliTypeOptions(), normalizeMcpPort(), normalizeToolConfig(), parseCliArgs(), parseCommandTemplate(), slugify() (+9 more)

### Community 6 - "Community 6"
Cohesion: 0.06
Nodes (5): decodeBase64Content(), HelmControlService, parseSubmitSuffix(), requireResult(), validateMobileFriendlyTelegramText()

### Community 7 - "Community 7"
Cohesion: 0.05
Nodes (53): Chip-Bar Action Buttons, Folder Name Inconsistency Fix, Plan Attachments and Sequence Memory MCP Guidance, Configurable Submit Suffix, Telegram Rewrite, Activity Dots, Browser Gamepad API, Directory Plans NCN (+45 more)

### Community 8 - "Community 8"
Cohesion: 0.05
Nodes (15): handleButton(), onSave(), handleButton(), handleButton(), executeDraftAction(), handleActionButton(), handleSubmenuButton(), onActionClick() (+7 more)

### Community 9 - "Community 9"
Cohesion: 0.09
Nodes (2): formatHumanId(), PlanManager

### Community 10 - "Community 10"
Cohesion: 0.08
Nodes (25): bestStateEmoji(), buildDashboardKeyboardWithTopics(), buildTopicUrl(), capitalize(), commandPaletteKeyboard(), confirmSendKeyboard(), countStates(), directoryListKeyboard() (+17 more)

### Community 11 - "Community 11"
Cohesion: 0.06
Nodes (9): applyFocus(), doAutoSave(), handleButton(), onCancel(), onKeyDown(), onLabelKeyDown(), onSave(), makeSections() (+1 more)

### Community 12 - "Community 12"
Cohesion: 0.1
Nodes (5): BrowserGamepadPoller, makeButton(), makeGamepad(), startAndTick(), tick()

### Community 13 - "Community 13"
Cohesion: 0.08
Nodes (31): GitHub App Update Provider, Deploy Config Stripping, Two Step Release Workflow, Localhost MCP Server, Self Contained Profile Model, Directory Plan Controls, Default Profile, Profile Bindings Config (+23 more)

### Community 14 - "Community 14"
Cohesion: 0.17
Nodes (28): editOriginalMessage(), expandSequence(), findSequenceByLabel(), flattenSequences(), handleAccept(), handleCancel(), handleCloseAll(), handleCommandExec() (+20 more)

### Community 15 - "Community 15"
Cohesion: 0.1
Nodes (1): TerminalManager

### Community 16 - "Community 16"
Cohesion: 0.15
Nodes (12): asAiagentState(), asPlanStatus(), asPlanTypeOrNull(), asRecord(), asString(), asTerminalOutputMode(), getToolReminder(), LocalhostMcpServer (+4 more)

### Community 17 - "Community 17"
Cohesion: 0.12
Nodes (13): clearStartupFallbackTimer(), closeSplashWindow(), createSplashWindow(), createWindow(), maybeShowMainWindow(), readWindowBounds(), resolveSplashLogoUrl(), buildSplashHtml() (+5 more)

### Community 18 - "Community 18"
Cohesion: 0.15
Nodes (6): fitToLimit(), simpleHash(), stripEchoes(), stripInputToText(), TerminalMirror, truncateMiddle()

### Community 19 - "Community 19"
Cohesion: 0.13
Nodes (2): setupKeyboardHandlers(), KeyboardSimulator

### Community 20 - "Community 20"
Cohesion: 0.16
Nodes (1): TelegramBotCore

### Community 21 - "Community 21"
Cohesion: 0.19
Nodes (2): PlanBackupManager, toFsSafeTimestamp()

### Community 22 - "Community 22"
Cohesion: 0.1
Nodes (2): handleButton(), navigateTab()

### Community 23 - "Community 23"
Cohesion: 0.21
Nodes (3): parseSubmitSuffix(), ScheduledTaskManager, splitCliParams()

### Community 24 - "Community 24"
Cohesion: 0.11
Nodes (1): TerminalView

### Community 25 - "Community 25"
Cohesion: 0.24
Nodes (19): applyStartStopStyle(), buildActionButtons(), buildChatIdRow(), buildConnectionSection(), buildEnabledRow(), buildInstanceNameRow(), buildNotificationsSection(), buildSecuritySection() (+11 more)

### Community 26 - "Community 26"
Cohesion: 0.19
Nodes (1): SessionManager

### Community 27 - "Community 27"
Cohesion: 0.18
Nodes (2): StateDetector, stripAnsi()

### Community 28 - "Community 28"
Cohesion: 0.16
Nodes (2): buildContent(), NotificationManager

### Community 29 - "Community 29"
Cohesion: 0.12
Nodes (18): Binding Action Types, Pattern Rules, Sequence Parser Syntax, Navigation Priority Chain, Default Profile Gamepad Bindings, Group Overview Mode, PTY Output Preview Grid, StateDetector Module (+10 more)

### Community 30 - "Community 30"
Cohesion: 0.2
Nodes (1): TopicManager

### Community 31 - "Community 31"
Cohesion: 0.14
Nodes (1): WindowManager

### Community 32 - "Community 32"
Cohesion: 0.2
Nodes (15): _cleanup(), _command_wrapper_name(), dependencies_ready(), _install_signal_handlers(), main(), print_header(), print_step(), Print a formatted header (+7 more)

### Community 33 - "Community 33"
Cohesion: 0.17
Nodes (2): createGamepadInput(), GamepadInput

### Community 34 - "Community 34"
Cohesion: 0.34
Nodes (2): PlanAttachmentManager, sanitizeFilename()

### Community 35 - "Community 35"
Cohesion: 0.22
Nodes (1): PatternMatcher

### Community 36 - "Community 36"
Cohesion: 0.18
Nodes (2): escapeShellArg(), PtyManager

### Community 37 - "Community 37"
Cohesion: 0.24
Nodes (2): groupByDirectory(), PinnedDashboard

### Community 38 - "Community 38"
Cohesion: 0.14
Nodes (15): Renderer Content Security Policy, Helm Renderer Entrypoint, vue-main.ts Module, Vue App Mount Point, xterm Stylesheet, Bracketed Paste Support, CLI Integration Improvements, IncomingPlansWatcher (+7 more)

### Community 39 - "Community 39"
Cohesion: 0.22
Nodes (13): bump_version(), check_git_clean(), cleanup_deploy_configs(), create_deploy_configs(), main(), patch_native_modules(), Remove the config-deploy/ staging directory., Abort if working tree is dirty. (+5 more)

### Community 40 - "Community 40"
Cohesion: 0.26
Nodes (1): WindowsWindowManager

### Community 41 - "Community 41"
Cohesion: 0.22
Nodes (4): escapeHtml(), formatMessageForTelegram(), TelegramRelayService, wrapTelegramEnvelope()

### Community 42 - "Community 42"
Cohesion: 0.15
Nodes (1): MockResizeObserver

### Community 43 - "Community 43"
Cohesion: 0.27
Nodes (11): extract_test_results(), format_markdown_output(), main(), Run tests based on mode., Run ESLint if available., Run a command and return result info., Extract test results from output., Format results as markdown. (+3 more)

### Community 44 - "Community 44"
Cohesion: 0.2
Nodes (1): IncomingPlansWatcher

### Community 45 - "Community 45"
Cohesion: 0.18
Nodes (1): PipelineQueue

### Community 46 - "Community 46"
Cohesion: 0.23
Nodes (5): extractErrors(), extractModifiedFiles(), extractTestResults(), formatRecentOutput(), OutputSummarizer

### Community 47 - "Community 47"
Cohesion: 0.18
Nodes (2): flush(), loadAndFlush()

### Community 48 - "Community 48"
Cohesion: 0.25
Nodes (1): DraftManager

### Community 50 - "Community 50"
Cohesion: 0.31
Nodes (1): TerminalOutputBuffer

### Community 51 - "Community 51"
Cohesion: 0.28
Nodes (1): FakePtyManager

### Community 53 - "Community 53"
Cohesion: 0.32
Nodes (1): ProcessSpawner

### Community 54 - "Community 54"
Cohesion: 0.32
Nodes (1): TelegramNotifier

### Community 56 - "Community 56"
Cohesion: 0.29
Nodes (2): normalizePort(), onPortBlur()

### Community 57 - "Community 57"
Cohesion: 0.43
Nodes (1): ConfigLoader

### Community 59 - "Community 59"
Cohesion: 0.47
Nodes (3): addEditorHistoryEntry(), loadEditorHistory(), saveEditorHistory()

### Community 60 - "Community 60"
Cohesion: 0.33
Nodes (1): MockResizeObserver

### Community 61 - "Community 61"
Cohesion: 0.33
Nodes (1): MockResizeObserver

### Community 63 - "Community 63"
Cohesion: 0.33
Nodes (1): MockTelegramBot

### Community 64 - "Community 64"
Cohesion: 0.6
Nodes (4): find_latest_release(), main(), Find the latest dated release folder., run()

### Community 65 - "Community 65"
Cohesion: 0.5
Nodes (2): buildReplyKeyboard(), sendWithReplyKeyboard()

### Community 66 - "Community 66"
Cohesion: 0.67
Nodes (2): applyPtyFilters(), stripAltScreen()

### Community 67 - "Community 67"
Cohesion: 0.67
Nodes (2): getMockWindow(), getModule()

### Community 70 - "Community 70"
Cohesion: 0.67
Nodes (4): Green Wave Accent, Helm Paper Boat Icon, Paper Boat Symbol, Terminal Prompt Mark

### Community 71 - "Community 71"
Cohesion: 1.0
Nodes (2): nextRunMs(), timeRemaining()

### Community 90 - "Community 90"
Cohesion: 1.0
Nodes (2): Electron MIT License, Chromium Third Party Credits

### Community 91 - "Community 91"
Cohesion: 1.0
Nodes (2): Empty Drafts Config, Empty Sessions Config

### Community 92 - "Community 92"
Cohesion: 1.0
Nodes (2): Haptic Feedback Setting, Notifications Setting

### Community 130 - "Community 130"
Cohesion: 1.0
Nodes (1): Modal Guard Regression Fixes

### Community 131 - "Community 131"
Cohesion: 1.0
Nodes (1): Persisted Sessions

### Community 132 - "Community 132"
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
- **Thin community `Community 9`** (48 nodes): `plan-manager.js`, `formatHumanId()`, `PlanManager`, `.addDependency()`, `.allocateHumanId()`, `.applyItem()`, `.assignSequence()`, `.bulkAssignSequence()`, `.canAddDependency()`, `.canSetState()`, `.cleanupOrphanSequenceMemberships()`, `.completeItem()`, `.constructor()`, `.create()`, `.createSequence()`, `.createWithType()`, `.delete()`, `.deleteCompletedForDirectory()`, `.deleteSequence()`, `.deleteSequenceWithPlans()`, `.ensurePlanMetadata()`, `.exportAll()`, `.exportDirectory()`, `.exportItem()`, `.getAllDoingForDirectory()`, `.getDoingForSession()`, `.getForDirectory()`, `.getItem()`, `.getSequence()`, `.getSequencesForDirectory()`, `.getStartableForDirectory()`, `.hasItem()`, `.importAll()`, `.importItem()`, `.loadFromDisk()`, `.migrateOldStatus()`, `.noteHumanId()`, `.recomputeStartable()`, `.removeDependency()`, `.reopenItem()`, `.resolveItemRef()`, `.resolveUniqueTitle()`, `.saveDir()`, `.setState()`, `.update()`, `.updateSequence()`, `.updateWithType()`, `.wouldCreateCycle()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 15`** (29 nodes): `TerminalManager`, `.adoptTerminal()`, `.constructor()`, `.createTerminal()`, `.deselect()`, `.destroyTerminal()`, `.detachTerminal()`, `.dispose()`, `.fitActive()`, `.fitAll()`, `.focusActive()`, `.getActiveSessionId()`, `.getActiveView()`, `.getCount()`, `.getOutputBuffer()`, `.getSession()`, `.getSessionIds()`, `.getTerminalLines()`, `.getTitle()`, `.has()`, `.hasTerminal()`, `.renameSession()`, `.setOnEmpty()`, `.setOnSwitch()`, `.setOnTitleChange()`, `.setupIpcListeners()`, `.setupResizeObserver()`, `.switchTo()`, `.writeToTerminal()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 19`** (22 nodes): `keyboard.js`, `keyboard-handlers.js`, `keyboard.js`, `setupKeyboardHandlers()`, `KeyboardSimulator`, `.comboDown()`, `.comboUp()`, `.constructor()`, `.getKeyDelay()`, `.keyDown()`, `.keyTap()`, `.keyUp()`, `.longPress()`, `.normalizeKey()`, `.sendKey()`, `.sendKeyCombo()`, `.sendKeys()`, `.setKeyDelay()`, `.typeString()`, `keyboard-handlers.ts`, `keyboard.ts`, `keyboard.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (22 nodes): `bot.js`, `TelegramBotCore`, `.answerCallback()`, `.closeForumTopic()`, `.createForumTopic()`, `.deleteForumTopic()`, `.editForumTopic()`, `.editMessageDebounced()`, `.flushEdit()`, `.getBot()`, `.getChatId()`, `.handleCallbackQuery()`, `.handleMessage()`, `.isAuthorized()`, `.isRateLimited()`, `.isRunning()`, `.reopenForumTopic()`, `.sendMessage()`, `.sendToTopic()`, `.start()`, `.stop()`, `.withTimeout()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (22 nodes): `PlanBackupManager`, `.constructor()`, `.createSnapshot()`, `.deleteAllSnapshots()`, `.deleteSnapshot()`, `.getBackupDirForPath()`, `.getBackupSummary()`, `.getConfig()`, `.getDefaultConfig()`, `.getNewestSnapshot()`, `.getNextIndexForTimestamp()`, `.getOldestSnapshot()`, `.listSnapshots()`, `.loadConfig()`, `.pruneOldSnapshots()`, `.resolveBackupsRootDir()`, `.restoreFromSnapshot()`, `.saveConfig()`, `.updateConfig()`, `.validateConfig()`, `.validateSnapshot()`, `toFsSafeTimestamp()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 22`** (21 nodes): `BindingsTab.vue`, `PlansGrid.vue`, `ProfilesTab.vue`, `SessionCard.vue`, `SessionGroup.vue`, `SessionList.vue`, `SettingsPanel.vue`, `SortBar.vue`, `SpawnGrid.vue`, `StatusStrip.vue`, `TelegramTab.vue`, `ToolsTab.vue`, `colClass()`, `onRenameKeydown()`, `selectState()`, `handleButton()`, `navigateTab()`, `makeCardProps()`, `makeGroupProps()`, `makeSessionListProps()`, `sidebar.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (20 nodes): `TerminalView`, `.blur()`, `.clear()`, `.clearSelection()`, `.constructor()`, `.dispose()`, `.findNext()`, `.findPrevious()`, `.fit()`, `.focus()`, `.getBufferLines()`, `.getDimensions()`, `.getSelection()`, `.hasSelection()`, `.isBracketedPasteEnabled()`, `.paste()`, `.scroll()`, `.scrollLines()`, `.scrollToBottom()`, `.write()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (19 nodes): `manager.js`, `manager.js`, `SessionManager`, `.addSession()`, `.clear()`, `.constructor()`, `.getActiveSession()`, `.getAllSessions()`, `.getSession()`, `.getSessionCount()`, `.hasSession()`, `.nextSession()`, `.persistSessions()`, `.previousSession()`, `.removeSession()`, `.renameSession()`, `.restoreSessions()`, `.setActiveSession()`, `.updateSession()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (19 nodes): `state-detector.js`, `StateDetector`, `.clearActivityTimers()`, `.constructor()`, `.dispose()`, `.getLastOutputTime()`, `.getOrCreate()`, `.getState()`, `.hasQuestion()`, `.markActive()`, `.markResizing()`, `.markRestored()`, `.markScrolling()`, `.markSwitching()`, `.processOutput()`, `.promoteIfRecentOutput()`, `.removeSession()`, `.resetActivityTimers()`, `stripAnsi()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (18 nodes): `notification-manager.js`, `buildContent()`, `NotificationManager`, `.constructor()`, `.dispose()`, `.feedOutput()`, `.getAppVisibility()`, `.getAppVisibilityDetails()`, `.getLastLines()`, `.handleActivityChange()`, `.maybeNotify()`, `.notifyLlmDirected()`, `.removeSession()`, `.setActiveSessionIdGetter()`, `.setScreenLockChecker()`, `.setTelegramNotifier()`, `.shouldNotify()`, `.showNotification()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (17 nodes): `topic-manager.js`, `TopicManager`, `.closeSessionTopic()`, `.constructor()`, `.createTopicForSession()`, `.deleteTopic()`, `.ensureAllTopics()`, `.ensureTopic()`, `.findSessionByTopicId()`, `.formatTopicName()`, `.getSessionIdByTopic()`, `.getTopicId()`, `.handleTopicClosed()`, `.probeTopic()`, `.renameSessionTopic()`, `.setInstanceName()`, `.updateSessionTopicId()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (17 nodes): `WindowManager`, `.assignSessionToWindow()`, `.closeAllChildWindows()`, `.focusWindowForSession()`, `.getAllWindows()`, `.getChildWindowIds()`, `.getMainWindow()`, `.getSessionsInWindow()`, `.getSnappedOutSessions()`, `.getWindow()`, `.getWindowForSession()`, `.getWindowIdForSession()`, `.isSessionSnappedOut()`, `.registerWindow()`, `.setMainWindow()`, `.unassignSession()`, `.unregisterWindow()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (16 nodes): `gamepad.js`, `createGamepadInput()`, `GamepadInput`, `.checkButton()`, `.constructor()`, `.emitButtonEvent()`, `.getConnectedGamepadCount()`, `.handleButtonPress()`, `.isButtonPressed()`, `.off()`, `.on()`, `.onButton()`, `.processState()`, `.setDebounceTime()`, `.start()`, `.stop()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (15 nodes): `PlanAttachmentManager`, `.absoluteStoragePath()`, `.add()`, `.assertInside()`, `.constructor()`, `.delete()`, `.deletePlanAttachments()`, `.getToTempFile()`, `.hasAnyForPlanIds()`, `.list()`, `.loadIndex()`, `.planStorageDir()`, `.requirePlan()`, `.saveIndex()`, `sanitizeFilename()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (15 nodes): `pattern-matcher.js`, `PatternMatcher`, `.cancelSchedule()`, `.constructor()`, `.dispose()`, `.executeSendText()`, `.executeWaitUntil()`, `.getPendingSchedule()`, `.getRegex()`, `.isReady()`, `.processOutput()`, `.recordFired()`, `.removeSession()`, `.sequenceToString()`, `.stripAnsi()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (15 nodes): `pty-manager.js`, `escapeShellArg()`, `PtyManager`, `.constructor()`, `.deliverText()`, `.getPid()`, `.getSessionIds()`, `.getTerminalTail()`, `.has()`, `.kill()`, `.killAll()`, `.resize()`, `.setTextDeliveryHandler()`, `.spawn()`, `.write()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (15 nodes): `pinned-dashboard.js`, `groupByDirectory()`, `PinnedDashboard`, `.appendSessionGroups()`, `.buildDashboardKeyboard()`, `.buildDashboardText()`, `.constructor()`, `.createOrUpdate()`, `.dispose()`, `.handleEditError()`, `.pinMessage()`, `.setInstanceName()`, `.start()`, `.stop()`, `.update()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (13 nodes): `windows.js`, `WindowsWindowManager`, `.cleanup()`, `.constructor()`, `.ensureScriptExists()`, `.enumerateWindows()`, `.executeWindowScript()`, `.findTerminalWindows()`, `.findWindowsByProcessName()`, `.findWindowsByTitle()`, `.focusWindow()`, `.getActiveWindow()`, `.getProcesses()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (13 nodes): `createContainer()`, `lastFitAddon()`, `lastSearchAddon()`, `lastTerminal()`, `makeMockFitAddon()`, `makeMockSearchAddon()`, `makeMockTerminal()`, `MockResizeObserver`, `.constructor()`, `.disconnect()`, `.observe()`, `.unobserve()`, `terminal-manager.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (12 nodes): `incoming-plans-watcher.js`, `IncomingPlansWatcher`, `.close()`, `.constructor()`, `.deleteFile()`, `.getFailedFiles()`, `.getIncomingDir()`, `.listFiles()`, `.processFile()`, `.rejectFile()`, `.start()`, `.validate()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (12 nodes): `pipeline-queue.js`, `PipelineQueue`, `.clear()`, `.dequeue()`, `.enqueue()`, `.getAll()`, `.getPosition()`, `.has()`, `.length()`, `.peek()`, `.pop()`, `.triggerHandoff()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (12 nodes): `buildSidebarDom()`, `createMockTerminalManager()`, `enterRenameMode()`, `flush()`, `getSessions()`, `getSessionsState()`, `getState()`, `loadAndFlush()`, `makeSessions()`, `pressKey()`, `setMockTerminalSessions()`, `sessions-screen.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (11 nodes): `draft-manager.js`, `DraftManager`, `.clearSession()`, `.count()`, `.create()`, `.delete()`, `.exportAll()`, `.get()`, `.getForSession()`, `.importAll()`, `.update()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (10 nodes): `TerminalOutputBuffer`, `.append()`, `.appendToLineBuffer()`, `.clear()`, `.clearAll()`, `.collapseCarriageReturn()`, `.constructor()`, `.getLines()`, `.getOrCreate()`, `.tail()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 51`** (9 nodes): `FakePtyManager`, `.constructor()`, `.deliverText()`, `.emitExit()`, `.getWrites()`, `.has()`, `.spawn()`, `.spawnCommand()`, `.write()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (8 nodes): `spawner.js`, `ProcessSpawner`, `.getAllProcesses()`, `.getProcess()`, `.getProcessesByCliType()`, `.kill()`, `.killAll()`, `.spawn()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (8 nodes): `notifier.js`, `TelegramNotifier`, `.constructor()`, `.dispose()`, `.handleStateChange()`, `.removeSession()`, `.sendNotification()`, `.shouldNotify()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 56`** (8 nodes): `McpTab.vue`, `normalizePort()`, `onClearToken()`, `onGenerateToken()`, `onPortBlur()`, `onToggleEnabled()`, `onTokenBlur()`, `mcp-tab.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 57`** (7 nodes): `config-loader.js`, `ConfigLoader`, `.constructor()`, `.getCliTypes()`, `.getSpawnConfig()`, `.load()`, `.reload()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 60`** (6 nodes): `MockResizeObserver`, `.constructor()`, `.disconnect()`, `.observe()`, `.unobserve()`, `bindings-pty.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 61`** (6 nodes): `MockResizeObserver`, `.constructor()`, `.disconnect()`, `.observe()`, `.unobserve()`, `bindings-target.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 63`** (6 nodes): `MockTelegramBot`, `.constructor()`, `._emit()`, `.on()`, `startedBot()`, `telegram-bot.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 65`** (5 nodes): `reply-keyboard.js`, `buildRemoveKeyboard()`, `buildReplyKeyboard()`, `isReplyKeyboardPress()`, `sendWithReplyKeyboard()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 66`** (4 nodes): `pty-filter.ts`, `applyPtyFilters()`, `stripAltScreen()`, `pty-filter.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 67`** (4 nodes): `buildSettingsDom()`, `getMockWindow()`, `getModule()`, `chipbar-actions-settings.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 71`** (3 nodes): `SchedulerSection.vue`, `nextRunMs()`, `timeRemaining()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 90`** (2 nodes): `Electron MIT License`, `Chromium Third Party Credits`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 91`** (2 nodes): `Empty Drafts Config`, `Empty Sessions Config`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 92`** (2 nodes): `Haptic Feedback Setting`, `Notifications Setting`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 130`** (1 nodes): `Modal Guard Regression Fixes`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 131`** (1 nodes): `Persisted Sessions`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 132`** (1 nodes): `File Structure Module Map`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Group 1 Plan Screen and Draft Editor Core` and `Drafts Config Empty`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Legacy Helm Envelope Reference` and `Helm JSON Envelope`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **What is the exact relationship between `Helm v1.2.2 Release Notes` and `Preserve Me User File`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `PlanManager` connect `Community 9` to `Community 1`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Why does `ConfigLoader` connect `Community 5` to `Community 1`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Why does `TerminalManager` connect `Community 15` to `Community 2`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **What connects `Run shell command, printing output in real-time.`, `Patch node-pty .gyp files to disable Spectre mitigation requirement.      VS 2`, `Bump version in package.json and return (old_version, new_version).` to the rest of the system?**
  _74 weakly-connected nodes found - possible documentation gaps or missing edges._