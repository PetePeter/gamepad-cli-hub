# Graph Report - gamepad-cli-hub  (2026-05-15)

## Corpus Check
- 387 files · ~3,141,865 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3299 nodes · 6532 edges · 81 communities detected
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 341 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 84|Community 84]]
- [[_COMMUNITY_Community 105|Community 105]]
- [[_COMMUNITY_Community 106|Community 106]]
- [[_COMMUNITY_Community 107|Community 107]]
- [[_COMMUNITY_Community 146|Community 146]]
- [[_COMMUNITY_Community 147|Community 147]]
- [[_COMMUNITY_Community 148|Community 148]]

## God Nodes (most connected - your core abstractions)
1. `get()` - 83 edges
2. `ConfigLoader` - 82 edges
3. `HelmControlService` - 77 edges
4. `callTool()` - 68 edges
5. `ensureLoaded()` - 55 edges
6. `PlanManager` - 55 edges
7. `delete()` - 41 edges
8. `TerminalManager` - 34 edges
9. `has()` - 32 edges
10. `registerIPCHandlers()` - 31 edges

## Surprising Connections (you probably didn't know these)
- `Directory Plans NCN` --semantically_similar_to--> `PlanManager`  [INFERRED] [semantically similar]
  CLAUDE.md → Plans/plan-directory-plans-ncn.html
- `initConfigCache()` --calls--> `bootstrap()`  [INFERRED]
  renderer\bindings.ts → renderer\composables\useAppBootstrap.ts
- `handleGamepadEvent()` --calls--> `handlePlanDeleteConfirmButton()`  [INFERRED]
  renderer\navigation.ts → renderer\modals\plan-delete-confirm.ts
- `toDirection()` --calls--> `handleButton()`  [INFERRED]
  renderer\utils.ts → renderer\components\modals\ClearDonePlansModal.vue
- `toDirection()` --calls--> `handleButton()`  [INFERRED]
  renderer\utils.ts → renderer\components\modals\CloseConfirmModal.vue

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
Nodes (583): absoluteStoragePath(), actionToPtyData(), add(), addDependency(), addDirectory(), addPlanAttachment(), addProjectDir(), addSession() (+575 more)

### Community 1 - "Community 1"
Cohesion: 0.01
Nodes (149): resolveEnvWithMode(), clearStartupFallbackTimer(), closeSplashWindow(), createSplashWindow(), createWindow(), maybeShowMainWindow(), readWindowBounds(), resolveSplashLogoUrl() (+141 more)

### Community 2 - "Community 2"
Cohesion: 0.02
Nodes (137): autoResumeSessions(), bootstrap(), clamp(), cleanupRendererSession(), doCloseSession(), doSpawn(), doSpawnShell(), findProjectForPath() (+129 more)

### Community 3 - "Community 3"
Cohesion: 0.02
Nodes (75): useEscProtection(), useModalStack(), useNavigation(), handleDraftEditorButton(), isDraftEditorVisible(), showDraftEditor(), hideEditorPopup(), asElement() (+67 more)

### Community 4 - "Community 4"
Cohesion: 0.04
Nodes (104): handlePlanDeleteConfirmButton(), hidePlanDeleteConfirm(), showPlanDeleteConfirm(), ensureOverlay(), hidePlanHelpModal(), isPlanHelpVisible(), showPlanHelpModal(), applySequenceBandLayout() (+96 more)

### Community 5 - "Community 5"
Cohesion: 0.03
Nodes (64): createSortControl(), addEditorHistoryEntry(), getScopedEntries(), loadEditorHistory(), safeParseHistory(), saveEditorHistory(), focusFirstInvalidField(), getFieldError() (+56 more)

### Community 6 - "Community 6"
Cohesion: 0.05
Nodes (9): buildLegacySpawnCommand(), ConfigLoader, isCliTypeOptions(), normalizeMcpPort(), normalizeToolConfig(), parseCliArgs(), parseCommandTemplate(), slugify() (+1 more)

### Community 7 - "Community 7"
Cohesion: 0.05
Nodes (57): editOriginalMessage(), expandSequence(), findSequenceByLabel(), flattenSequences(), handleAccept(), handleCancel(), handleCloseAll(), handleCommandExec() (+49 more)

### Community 8 - "Community 8"
Cohesion: 0.04
Nodes (5): decodeBase64Content(), HelmControlService, parseSubmitSuffix(), requireResult(), validateMobileFriendlyTelegramText()

### Community 9 - "Community 9"
Cohesion: 0.04
Nodes (22): handleButton(), onSave(), handleButton(), handleButton(), actionForIndex(), clampIndex(), close(), handleButton() (+14 more)

### Community 10 - "Community 10"
Cohesion: 0.08
Nodes (4): savePlanFile(), savePlanSequences(), formatHumanId(), PlanManager

### Community 11 - "Community 11"
Cohesion: 0.06
Nodes (55): addBookmarkedDir(), addCliType(), addPattern(), addWorkingDirectory(), clearSnapOutWindowPrefs(), copyCliBindings(), ensureLoaded(), getActivityTimeout() (+47 more)

### Community 12 - "Community 12"
Cohesion: 0.05
Nodes (53): Chip-Bar Action Buttons, Folder Name Inconsistency Fix, Plan Attachments and Sequence Memory MCP Guidance, Configurable Submit Suffix, Telegram Rewrite, Activity Dots, Browser Gamepad API, Directory Plans NCN (+45 more)

### Community 13 - "Community 13"
Cohesion: 0.06
Nodes (9): applyFocus(), doAutoSave(), handleButton(), onCancel(), onKeyDown(), onLabelKeyDown(), onSave(), makeSections() (+1 more)

### Community 14 - "Community 14"
Cohesion: 0.1
Nodes (5): BrowserGamepadPoller, makeButton(), makeGamepad(), startAndTick(), tick()

### Community 15 - "Community 15"
Cohesion: 0.09
Nodes (1): TerminalManager

### Community 16 - "Community 16"
Cohesion: 0.11
Nodes (5): ContextManager, loadPlanContextBindings(), loadPlanContexts(), savePlanContextBindings(), savePlanContexts()

### Community 17 - "Community 17"
Cohesion: 0.12
Nodes (19): bump_version(), check_git_clean(), cleanup_deploy_configs(), create_deploy_configs(), main(), patch_native_modules(), Remove the config-deploy/ staging directory., Abort if working tree is dirty. (+11 more)

### Community 18 - "Community 18"
Cohesion: 0.08
Nodes (31): GitHub App Update Provider, Deploy Config Stripping, Two Step Release Workflow, Localhost MCP Server, Self Contained Profile Model, Directory Plan Controls, Default Profile, Profile Bindings Config (+23 more)

### Community 19 - "Community 19"
Cohesion: 0.14
Nodes (13): asAiagentState(), asContextBindingTargetType(), asPlanStatus(), asPlanTypeOrNull(), asRecord(), asString(), asTerminalOutputMode(), getToolReminder() (+5 more)

### Community 20 - "Community 20"
Cohesion: 0.14
Nodes (1): TelegramBotCore

### Community 21 - "Community 21"
Cohesion: 0.18
Nodes (5): loadScheduledTasks(), saveScheduledTasks(), parseSubmitSuffix(), ScheduledTaskManager, splitCliParams()

### Community 22 - "Community 22"
Cohesion: 0.15
Nodes (6): fitToLimit(), simpleHash(), stripEchoes(), stripInputToText(), TerminalMirror, truncateMiddle()

### Community 23 - "Community 23"
Cohesion: 0.1
Nodes (2): handleButton(), navigateTab()

### Community 24 - "Community 24"
Cohesion: 0.19
Nodes (2): PlanBackupManager, toFsSafeTimestamp()

### Community 25 - "Community 25"
Cohesion: 0.11
Nodes (1): TerminalView

### Community 26 - "Community 26"
Cohesion: 0.24
Nodes (19): applyStartStopStyle(), buildActionButtons(), buildChatIdRow(), buildConnectionSection(), buildEnabledRow(), buildInstanceNameRow(), buildNotificationsSection(), buildSecuritySection() (+11 more)

### Community 27 - "Community 27"
Cohesion: 0.18
Nodes (1): SessionManager

### Community 28 - "Community 28"
Cohesion: 0.16
Nodes (2): buildContent(), NotificationManager

### Community 29 - "Community 29"
Cohesion: 0.18
Nodes (2): StateDetector, stripAnsi()

### Community 30 - "Community 30"
Cohesion: 0.12
Nodes (18): Binding Action Types, Pattern Rules, Sequence Parser Syntax, Navigation Priority Chain, Default Profile Gamepad Bindings, Group Overview Mode, PTY Output Preview Grid, StateDetector Module (+10 more)

### Community 31 - "Community 31"
Cohesion: 0.14
Nodes (1): WindowManager

### Community 32 - "Community 32"
Cohesion: 0.21
Nodes (1): HelmPlanService

### Community 33 - "Community 33"
Cohesion: 0.2
Nodes (1): TopicManager

### Community 34 - "Community 34"
Cohesion: 0.19
Nodes (1): KeyboardSimulator

### Community 35 - "Community 35"
Cohesion: 0.2
Nodes (15): _cleanup(), _command_wrapper_name(), dependencies_ready(), _install_signal_handlers(), main(), print_header(), print_step(), Print a formatted header (+7 more)

### Community 36 - "Community 36"
Cohesion: 0.17
Nodes (1): HelmContextService

### Community 37 - "Community 37"
Cohesion: 0.17
Nodes (2): createGamepadInput(), GamepadInput

### Community 38 - "Community 38"
Cohesion: 0.18
Nodes (2): escapeShellArg(), PtyManager

### Community 39 - "Community 39"
Cohesion: 0.24
Nodes (2): groupByDirectory(), PinnedDashboard

### Community 40 - "Community 40"
Cohesion: 0.14
Nodes (15): Renderer Content Security Policy, Helm Renderer Entrypoint, vue-main.ts Module, Vue App Mount Point, xterm Stylesheet, Bracketed Paste Support, CLI Integration Improvements, IncomingPlansWatcher (+7 more)

### Community 41 - "Community 41"
Cohesion: 0.24
Nodes (2): HelmSessionService, requireResult()

### Community 42 - "Community 42"
Cohesion: 0.19
Nodes (6): buildLegacySpawnCommand(), normalizeToolConfig(), parseCliArgs(), parseCommandTemplate(), setupTestFiles(), writeYaml()

### Community 43 - "Community 43"
Cohesion: 0.22
Nodes (2): HelmTelegramService, validateMobileFriendlyTelegramText()

### Community 44 - "Community 44"
Cohesion: 0.15
Nodes (1): MockResizeObserver

### Community 45 - "Community 45"
Cohesion: 0.26
Nodes (1): WindowsWindowManager

### Community 46 - "Community 46"
Cohesion: 0.27
Nodes (11): extract_test_results(), format_markdown_output(), main(), Run tests based on mode., Run ESLint if available., Run a command and return result info., Extract test results from output., Format results as markdown. (+3 more)

### Community 47 - "Community 47"
Cohesion: 0.26
Nodes (7): commitPort(), commitToken(), normalizePort(), onPortBlur(), onPortChange(), onTokenBlur(), onTokenInput()

### Community 48 - "Community 48"
Cohesion: 0.24
Nodes (1): HelmPlanSequenceService

### Community 49 - "Community 49"
Cohesion: 0.18
Nodes (1): PipelineQueue

### Community 50 - "Community 50"
Cohesion: 0.23
Nodes (2): ProjectStore, sortProjectPaths()

### Community 51 - "Community 51"
Cohesion: 0.18
Nodes (2): flush(), loadAndFlush()

### Community 52 - "Community 52"
Cohesion: 0.23
Nodes (5): extractErrors(), extractModifiedFiles(), extractTestResults(), formatRecentOutput(), OutputSummarizer

### Community 53 - "Community 53"
Cohesion: 0.25
Nodes (1): DraftManager

### Community 54 - "Community 54"
Cohesion: 0.22
Nodes (1): IncomingPlansWatcher

### Community 55 - "Community 55"
Cohesion: 0.31
Nodes (1): TerminalOutputBuffer

### Community 57 - "Community 57"
Cohesion: 0.25
Nodes (2): createHelmPreloadApi(), createPreloadDomains()

### Community 58 - "Community 58"
Cohesion: 0.28
Nodes (1): FakePtyManager

### Community 60 - "Community 60"
Cohesion: 0.39
Nodes (2): decodeBase64Content(), HelmPlanAttachmentService

### Community 61 - "Community 61"
Cohesion: 0.25
Nodes (1): HelmSchedulerService

### Community 62 - "Community 62"
Cohesion: 0.36
Nodes (4): defaultGitRunner(), inspectProjectIdentity(), normalizeProjectPath(), trimGitOutput()

### Community 63 - "Community 63"
Cohesion: 0.29
Nodes (1): CronEngine

### Community 64 - "Community 64"
Cohesion: 0.32
Nodes (1): ProcessSpawner

### Community 65 - "Community 65"
Cohesion: 0.29
Nodes (1): FakeSessionManager

### Community 66 - "Community 66"
Cohesion: 0.43
Nodes (1): ConfigLoader

### Community 67 - "Community 67"
Cohesion: 0.4
Nodes (2): clampHeight(), onResizeMove()

### Community 69 - "Community 69"
Cohesion: 0.33
Nodes (1): MockResizeObserver

### Community 70 - "Community 70"
Cohesion: 0.33
Nodes (1): MockResizeObserver

### Community 72 - "Community 72"
Cohesion: 0.33
Nodes (1): MockTelegramBot

### Community 77 - "Community 77"
Cohesion: 0.5
Nodes (2): buildReplyKeyboard(), sendWithReplyKeyboard()

### Community 78 - "Community 78"
Cohesion: 0.67
Nodes (2): nextRunMs(), timeRemaining()

### Community 79 - "Community 79"
Cohesion: 0.67
Nodes (2): applyPtyFilters(), stripAltScreen()

### Community 80 - "Community 80"
Cohesion: 0.67
Nodes (2): getMockWindow(), getModule()

### Community 81 - "Community 81"
Cohesion: 0.67
Nodes (2): setupTestFiles(), writeYaml()

### Community 84 - "Community 84"
Cohesion: 0.67
Nodes (4): Green Wave Accent, Helm Paper Boat Icon, Paper Boat Symbol, Terminal Prompt Mark

### Community 105 - "Community 105"
Cohesion: 1.0
Nodes (2): Electron MIT License, Chromium Third Party Credits

### Community 106 - "Community 106"
Cohesion: 1.0
Nodes (2): Empty Drafts Config, Empty Sessions Config

### Community 107 - "Community 107"
Cohesion: 1.0
Nodes (2): Haptic Feedback Setting, Notifications Setting

### Community 146 - "Community 146"
Cohesion: 1.0
Nodes (1): Modal Guard Regression Fixes

### Community 147 - "Community 147"
Cohesion: 1.0
Nodes (1): Persisted Sessions

### Community 148 - "Community 148"
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
- **Thin community `Community 15`** (34 nodes): `TerminalManager`, `.adoptTerminal()`, `.constructor()`, `.createTerminal()`, `.deselect()`, `.destroyTerminal()`, `.detachTerminal()`, `.dispose()`, `.fitActive()`, `.fitAll()`, `.focusActive()`, `.getActiveSessionId()`, `.getActiveView()`, `.getCount()`, `.getManagedSessions()`, `.getOutputBuffer()`, `.getSession()`, `.getSessionIds()`, `.getTerminalLines()`, `.getTitle()`, `.has()`, `.hasTerminal()`, `.hydrateFromStore()`, `.hydrateSessions()`, `.removeManagedSession()`, `.renameSession()`, `.setOnEmpty()`, `.setOnSwitch()`, `.setOnTitleChange()`, `.setupIpcListeners()`, `.setupResizeObserver()`, `.switchTo()`, `.upsertManagedSession()`, `.writeToTerminal()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (25 nodes): `bot.js`, `TelegramBotCore`, `.answerCallback()`, `.closeForumTopic()`, `.createForumTopic()`, `.deleteForumTopic()`, `.editForumTopic()`, `.editMessageDebounced()`, `.flushEdit()`, `.getBot()`, `.getChatId()`, `.handleCallbackQuery()`, `.handleMessage()`, `.isAuthorized()`, `.isRateLimited()`, `.isRunning()`, `.reopenForumTopic()`, `.sendDocument()`, `.sendMessage()`, `.sendPhoto()`, `.sendToTopic()`, `.sendVideo()`, `.start()`, `.stop()`, `.withTimeout()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (22 nodes): `BindingsTab.vue`, `PlansGrid.vue`, `ProfilesTab.vue`, `SessionCard.vue`, `SessionGroup.vue`, `SessionList.vue`, `SettingsPanel.vue`, `SortBar.vue`, `SpawnGrid.vue`, `StatusStrip.vue`, `TelegramTab.vue`, `ToolsTab.vue`, `colClass()`, `onCardClick()`, `onRenameKeydown()`, `selectState()`, `handleButton()`, `navigateTab()`, `makeCardProps()`, `makeGroupProps()`, `makeSessionListProps()`, `sidebar.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (22 nodes): `PlanBackupManager`, `.constructor()`, `.createSnapshot()`, `.deleteAllSnapshots()`, `.deleteSnapshot()`, `.getBackupDirForPath()`, `.getBackupSummary()`, `.getConfig()`, `.getDefaultConfig()`, `.getNewestSnapshot()`, `.getNextIndexForTimestamp()`, `.getOldestSnapshot()`, `.listSnapshots()`, `.loadConfig()`, `.pruneOldSnapshots()`, `.resolveBackupsRootDir()`, `.restoreFromSnapshot()`, `.saveConfig()`, `.updateConfig()`, `.validateConfig()`, `.validateSnapshot()`, `toFsSafeTimestamp()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (20 nodes): `TerminalView`, `.blur()`, `.clear()`, `.clearSelection()`, `.constructor()`, `.dispose()`, `.findNext()`, `.findPrevious()`, `.fit()`, `.focus()`, `.getBufferLines()`, `.getDimensions()`, `.getSelection()`, `.hasSelection()`, `.isBracketedPasteEnabled()`, `.paste()`, `.scroll()`, `.scrollLines()`, `.scrollToBottom()`, `.write()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (20 nodes): `manager.js`, `manager.js`, `SessionManager`, `.addSession()`, `.applyProjectIdentity()`, `.clear()`, `.constructor()`, `.getActiveSession()`, `.getAllSessions()`, `.getSession()`, `.getSessionCount()`, `.hasSession()`, `.nextSession()`, `.persistSessions()`, `.previousSession()`, `.removeSession()`, `.renameSession()`, `.restoreSessions()`, `.setActiveSession()`, `.updateSession()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (19 nodes): `notification-manager.js`, `buildContent()`, `NotificationManager`, `.constructor()`, `.dispatchLlmInAppNotification()`, `.dispose()`, `.feedOutput()`, `.getAppVisibility()`, `.getAppVisibilityDetails()`, `.getLastLines()`, `.handleActivityChange()`, `.maybeNotify()`, `.notifyLlmDirected()`, `.removeSession()`, `.setActiveSessionIdGetter()`, `.setScreenLockChecker()`, `.setTelegramNotifier()`, `.shouldNotify()`, `.showNotification()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (19 nodes): `state-detector.js`, `StateDetector`, `.clearActivityTimers()`, `.constructor()`, `.dispose()`, `.getLastOutputTime()`, `.getOrCreate()`, `.getState()`, `.hasQuestion()`, `.markActive()`, `.markResizing()`, `.markRestored()`, `.markScrolling()`, `.markSwitching()`, `.processOutput()`, `.promoteIfRecentOutput()`, `.removeSession()`, `.resetActivityTimers()`, `stripAnsi()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (17 nodes): `WindowManager`, `.assignSessionToWindow()`, `.closeAllChildWindows()`, `.focusWindowForSession()`, `.getAllWindows()`, `.getChildWindowIds()`, `.getMainWindow()`, `.getSessionsInWindow()`, `.getSnappedOutSessions()`, `.getWindow()`, `.getWindowForSession()`, `.getWindowIdForSession()`, `.isSessionSnappedOut()`, `.registerWindow()`, `.setMainWindow()`, `.unassignSession()`, `.unregisterWindow()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 32`** (17 nodes): `HelmPlanService`, `.completePlan()`, `.constructor()`, `.createPlan()`, `.deletePlan()`, `.exportDirectory()`, `.exportItem()`, `.getPlan()`, `.linkPlans()`, `.listPlans()`, `.plansSummary()`, `.reopenPlan()`, `.requireWorkingDirectory()`, `.resolvePlanRef()`, `.setPlanState()`, `.unlinkPlans()`, `.updatePlan()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (17 nodes): `topic-manager.js`, `TopicManager`, `.closeSessionTopic()`, `.constructor()`, `.createTopicForSession()`, `.deleteTopic()`, `.ensureAllTopics()`, `.ensureTopic()`, `.findSessionByTopicId()`, `.formatTopicName()`, `.getSessionIdByTopic()`, `.getTopicId()`, `.handleTopicClosed()`, `.probeTopic()`, `.renameSessionTopic()`, `.setInstanceName()`, `.updateSessionTopicId()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (17 nodes): `keyboard.js`, `keyboard.js`, `KeyboardSimulator`, `.comboDown()`, `.comboUp()`, `.constructor()`, `.getKeyDelay()`, `.keyDown()`, `.keyTap()`, `.keyUp()`, `.longPress()`, `.normalizeKey()`, `.sendKey()`, `.sendKeyCombo()`, `.sendKeys()`, `.setKeyDelay()`, `.typeString()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (16 nodes): `HelmContextService`, `.appendContext()`, `.bindContext()`, `.constructor()`, `.createContext()`, `.deleteContext()`, `.getContext()`, `.getProjectIdForDirectory()`, `.listContexts()`, `.listPlanContexts()`, `.requireProject()`, `.requireWorkingDirectory()`, `.resolvePlanRef()`, `.setContextPosition()`, `.unbindContext()`, `.updateContext()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (16 nodes): `gamepad.js`, `createGamepadInput()`, `GamepadInput`, `.checkButton()`, `.constructor()`, `.emitButtonEvent()`, `.getConnectedGamepadCount()`, `.handleButtonPress()`, `.isButtonPressed()`, `.off()`, `.on()`, `.onButton()`, `.processState()`, `.setDebounceTime()`, `.start()`, `.stop()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (15 nodes): `pty-manager.js`, `escapeShellArg()`, `PtyManager`, `.constructor()`, `.deliverText()`, `.getPid()`, `.getSessionIds()`, `.getTerminalTail()`, `.has()`, `.kill()`, `.killAll()`, `.resize()`, `.setTextDeliveryHandler()`, `.spawn()`, `.write()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (15 nodes): `pinned-dashboard.js`, `groupByDirectory()`, `PinnedDashboard`, `.appendSessionGroups()`, `.buildDashboardKeyboard()`, `.buildDashboardText()`, `.constructor()`, `.createOrUpdate()`, `.dispose()`, `.handleEditError()`, `.pinMessage()`, `.setInstanceName()`, `.start()`, `.stop()`, `.update()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (14 nodes): `HelmSessionService`, `.closeSession()`, `.constructor()`, `.findSession()`, `.getSession()`, `.listSessions()`, `.readSessionTerminal()`, `.requireCliEntry()`, `.requireWorkingDirectory()`, `.setAiagentState()`, `.setSessionWorkingPlan()`, `.spawnCli()`, `.toSessionSummary()`, `requireResult()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (13 nodes): `HelmTelegramService`, `.closeTelegramChannel()`, `.constructor()`, `.findSession()`, `.getAppVisibility()`, `.getTelegramStatus()`, `.notifyUser()`, `.requireTelegramAvailable()`, `.requireTelegramBridge()`, `.sendTelegramChat()`, `.setNotificationManager()`, `.setTelegramBridge()`, `validateMobileFriendlyTelegramText()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (13 nodes): `createContainer()`, `lastFitAddon()`, `lastSearchAddon()`, `lastTerminal()`, `makeMockFitAddon()`, `makeMockSearchAddon()`, `makeMockTerminal()`, `MockResizeObserver`, `.constructor()`, `.disconnect()`, `.observe()`, `.unobserve()`, `terminal-manager.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (13 nodes): `windows.js`, `WindowsWindowManager`, `.cleanup()`, `.constructor()`, `.ensureScriptExists()`, `.enumerateWindows()`, `.executeWindowScript()`, `.findTerminalWindows()`, `.findWindowsByProcessName()`, `.findWindowsByTitle()`, `.focusWindow()`, `.getActiveWindow()`, `.getProcesses()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (12 nodes): `HelmPlanSequenceService`, `.appendPlanSequenceMemory()`, `.assertSequenceMutex()`, `.assignPlanSequence()`, `.constructor()`, `.createPlanSequence()`, `.deletePlanSequence()`, `.getPlanSequence()`, `.listPlanSequences()`, `.requireWorkingDirectory()`, `.resolvePlanRef()`, `.updatePlanSequence()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (12 nodes): `pipeline-queue.js`, `PipelineQueue`, `.clear()`, `.dequeue()`, `.enqueue()`, `.getAll()`, `.getPosition()`, `.has()`, `.length()`, `.peek()`, `.pop()`, `.triggerHandoff()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (12 nodes): `ProjectStore`, `.addDirectory()`, `.constructor()`, `.delete()`, `.getById()`, `.isDirty()`, `.list()`, `.removeDirectory()`, `.rename()`, `.requireRecord()`, `.save()`, `sortProjectPaths()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 51`** (12 nodes): `buildSidebarDom()`, `createMockTerminalManager()`, `enterRenameMode()`, `flush()`, `getSessions()`, `getSessionsState()`, `getState()`, `loadAndFlush()`, `makeSessions()`, `pressKey()`, `setMockTerminalSessions()`, `sessions-screen.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (11 nodes): `draft-manager.js`, `DraftManager`, `.clearSession()`, `.count()`, `.create()`, `.delete()`, `.exportAll()`, `.get()`, `.getForSession()`, `.importAll()`, `.update()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (11 nodes): `incoming-plans-watcher.js`, `IncomingPlansWatcher`, `.close()`, `.deleteFile()`, `.getFailedFiles()`, `.getIncomingDir()`, `.listFiles()`, `.processFile()`, `.rejectFile()`, `.start()`, `.validate()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 55`** (10 nodes): `TerminalOutputBuffer`, `.append()`, `.appendToLineBuffer()`, `.clear()`, `.clearAll()`, `.collapseCarriageReturn()`, `.constructor()`, `.getLines()`, `.getOrCreate()`, `.tail()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 57`** (9 nodes): `getPreloadApiDomain()`, `createGamepadCliCompatibilityApi()`, `createHelmPreloadApi()`, `createPreloadDomains()`, `pickDomainApi()`, `preload-api-contract.ts`, `domain-bridge.ts`, `domain-builders.ts`, `preload.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 58`** (9 nodes): `FakePtyManager`, `.constructor()`, `.deliverText()`, `.emitExit()`, `.getWrites()`, `.has()`, `.spawn()`, `.spawnCommand()`, `.write()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 60`** (8 nodes): `decodeBase64Content()`, `HelmPlanAttachmentService`, `.addPlanAttachment()`, `.constructor()`, `.deletePlanAttachment()`, `.getPlanAttachment()`, `.listPlanAttachments()`, `.resolvePlanRef()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 61`** (8 nodes): `HelmSchedulerService`, `.cancelTask()`, `.constructor()`, `.createTask()`, `.deleteTask()`, `.getTask()`, `.listTasks()`, `.updateTask()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 63`** (8 nodes): `cron-engine.test.ts`, `cron-engine.ts`, `CronEngine`, `.isValid()`, `.nextRunTime()`, `.nextRunTimeBeforeDate()`, `.validate()`, `expectLocalDateTime()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 64`** (8 nodes): `spawner.js`, `ProcessSpawner`, `.getAllProcesses()`, `.getProcess()`, `.getProcessesByCliType()`, `.kill()`, `.killAll()`, `.spawn()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 65`** (7 nodes): `FakeSessionManager`, `.addSession()`, `.getActiveSession()`, `.getSession()`, `.removeSession()`, `.setActiveSession()`, `.spawn()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 66`** (7 nodes): `config-loader.js`, `ConfigLoader`, `.constructor()`, `.getCliTypes()`, `.getSpawnConfig()`, `.load()`, `.reload()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 67`** (6 nodes): `clampHeight()`, `focus()`, `onResizeMove()`, `startResize()`, `stopResize()`, `PromptTextarea.vue`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 69`** (6 nodes): `MockResizeObserver`, `.constructor()`, `.disconnect()`, `.observe()`, `.unobserve()`, `bindings-pty.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 70`** (6 nodes): `MockResizeObserver`, `.constructor()`, `.disconnect()`, `.observe()`, `.unobserve()`, `bindings-target.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 72`** (6 nodes): `MockTelegramBot`, `.constructor()`, `._emit()`, `.on()`, `startedBot()`, `telegram-bot.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 77`** (5 nodes): `reply-keyboard.js`, `buildRemoveKeyboard()`, `buildReplyKeyboard()`, `isReplyKeyboardPress()`, `sendWithReplyKeyboard()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 78`** (4 nodes): `SchedulerSection.vue`, `nextRunMs()`, `timeRemaining()`, `scheduler-section.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 79`** (4 nodes): `pty-filter.ts`, `applyPtyFilters()`, `stripAltScreen()`, `pty-filter.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 80`** (4 nodes): `buildSettingsDom()`, `getMockWindow()`, `getModule()`, `chipbar-actions-settings.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 81`** (4 nodes): `readYaml()`, `setupTestFiles()`, `mcp-config.test.ts`, `writeYaml()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 105`** (2 nodes): `Electron MIT License`, `Chromium Third Party Credits`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 106`** (2 nodes): `Empty Drafts Config`, `Empty Sessions Config`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 107`** (2 nodes): `Haptic Feedback Setting`, `Notifications Setting`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 146`** (1 nodes): `Modal Guard Regression Fixes`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 147`** (1 nodes): `Persisted Sessions`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 148`** (1 nodes): `File Structure Module Map`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Group 1 Plan Screen and Draft Editor Core` and `Drafts Config Empty`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Legacy Helm Envelope Reference` and `Helm JSON Envelope`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **What is the exact relationship between `Helm v1.2.2 Release Notes` and `Preserve Me User File`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `ConfigLoader` connect `Community 6` to `Community 1`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Why does `HelmControlService` connect `Community 8` to `Community 1`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Why does `TerminalManager` connect `Community 15` to `Community 2`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **What connects `Run shell command, printing output in real-time.`, `Patch node-pty .gyp files to disable Spectre mitigation requirement.      VS 2`, `Bump version in package.json and return (old_version, new_version).` to the rest of the system?**
  _74 weakly-connected nodes found - possible documentation gaps or missing edges._