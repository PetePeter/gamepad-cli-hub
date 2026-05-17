# Graph Report - gamepad-cli-hub  (2026-05-17)

## Corpus Check
- 411 files · ~3,146,253 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3260 nodes · 6691 edges · 73 communities detected
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 302 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 97|Community 97]]
- [[_COMMUNITY_Community 98|Community 98]]
- [[_COMMUNITY_Community 99|Community 99]]
- [[_COMMUNITY_Community 129|Community 129]]
- [[_COMMUNITY_Community 130|Community 130]]
- [[_COMMUNITY_Community 131|Community 131]]

## God Nodes (most connected - your core abstractions)
1. `get()` - 84 edges
2. `HelmControlService` - 78 edges
3. `ConfigLoader` - 76 edges
4. `callTool()` - 68 edges
5. `callMcpTool()` - 68 edges
6. `ensureLoaded()` - 55 edges
7. `PlanManager` - 54 edges
8. `set()` - 47 edges
9. `delete()` - 42 edges
10. `TerminalManager` - 34 edges

## Surprising Connections (you probably didn't know these)
- `executeCliBinding()` --calls--> `showDraftEditor()`  [INFERRED]
  renderer\bindings.ts → renderer\drafts\draft-editor.ts
- `handleCloseConfirmButton()` --calls--> `handleGamepadEvent()`  [INFERRED]
  renderer\modals\close-confirm.ts → renderer\navigation.ts
- `handleSequencePickerButton()` --calls--> `handleGamepadEvent()`  [INFERRED]
  renderer\modals\sequence-picker.ts → renderer\navigation.ts
- `Gamepad Control` --semantically_similar_to--> `Browser Gamepad API`  [INFERRED] [semantically similar]
  README.md → CLAUDE.md
- `Directory Planning` --semantically_similar_to--> `Directory Plans NCN`  [INFERRED] [semantically similar]
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

### Community 0 - "Community 0"
Cohesion: 0.01
Nodes (654): absoluteStoragePath(), actionToPtyData(), add(), addDependency(), addDirectory(), addPlanAttachment(), addProjectDir(), addSession() (+646 more)

### Community 1 - "Community 1"
Cohesion: 0.01
Nodes (122): resolveEnvWithMode(), TelegramConfigManager, clearStartupFallbackTimer(), closeSplashWindow(), createSplashWindow(), createWindow(), maybeShowMainWindow(), readWindowBounds() (+114 more)

### Community 2 - "Community 2"
Cohesion: 0.01
Nodes (146): cb(), createSortControl(), createController(), autoResumeSessions(), bootstrap(), clamp(), cleanupRendererSession(), doCloseSession() (+138 more)

### Community 3 - "Community 3"
Cohesion: 0.03
Nodes (129): useModalStack(), useNavigation(), handleDraftEditorButton(), isDraftEditorVisible(), showDraftEditor(), handleBindingEditorButton(), handleDraftActionButton(), handleDraftSubmenuButton() (+121 more)

### Community 4 - "Community 4"
Cohesion: 0.02
Nodes (77): createRouter(), useEscProtection(), isEditableElementInsideModal(), useInputRouter(), hideEditorPopup(), asElement(), getActiveInputContext(), getEditableOwner() (+69 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (7): buildLegacySpawnCommand(), ConfigLoader, isCliTypeOptions(), normalizeMcpPort(), normalizeToolConfig(), parseCliArgs(), parseCommandTemplate()

### Community 6 - "Community 6"
Cohesion: 0.04
Nodes (5): decodeBase64Content(), HelmControlService, parseSubmitSuffix(), requireResult(), validateMobileFriendlyTelegramText()

### Community 7 - "Community 7"
Cohesion: 0.05
Nodes (48): editOriginalMessage(), formatTopicCleanupPreview(), formatTopicCleanupResult(), handleAccept(), handleCancel(), handleCloseAll(), handleContinue(), handleDirectoryDrill() (+40 more)

### Community 8 - "Community 8"
Cohesion: 0.04
Nodes (31): handleButton(), onSave(), handleButton(), handleButton(), actionForIndex(), clampIndex(), close(), handleButton() (+23 more)

### Community 9 - "Community 9"
Cohesion: 0.07
Nodes (13): cleanupOrphanDependencies(), encodeFilename(), listPlanFiles(), loadDependencies(), loadPlanFile(), loadPlanSequences(), saveDependencies(), savePlanFile() (+5 more)

### Community 10 - "Community 10"
Cohesion: 0.06
Nodes (54): addBookmarkedDir(), addCliType(), addPattern(), addWorkingDirectory(), clearSnapOutWindowPrefs(), copyCliBindings(), ensureLoaded(), getActivityTimeout() (+46 more)

### Community 11 - "Community 11"
Cohesion: 0.07
Nodes (16): asAiagentState(), asContextBindingTargetType(), asPlanStatus(), asPlanTypeOrNull(), asRecord(), asString(), asTerminalOutputMode(), getToolReminder() (+8 more)

### Community 12 - "Community 12"
Cohesion: 0.05
Nodes (14): loadDrafts(), sanitizeDrafts(), isAnyString(), cleanupOrphanDependencies(), decodeFilename(), deletePlanFile(), encodeFilename(), isDirectoryPlan() (+6 more)

### Community 13 - "Community 13"
Cohesion: 0.08
Nodes (11): HelmTelegramService, validateMobileFriendlyTelegramText(), escapeHtml(), extractAttachmentInfo(), formatMessageForTelegram(), isAudioAttachment(), oneLine(), TelegramRelayService (+3 more)

### Community 14 - "Community 14"
Cohesion: 0.1
Nodes (3): SessionManager, saveSessions(), TopicManager

### Community 15 - "Community 15"
Cohesion: 0.06
Nodes (9): applyFocus(), doAutoSave(), handleButton(), onCancel(), onKeyDown(), onLabelKeyDown(), onSave(), makeSections() (+1 more)

### Community 16 - "Community 16"
Cohesion: 0.1
Nodes (5): BrowserGamepadPoller, makeButton(), makeGamepad(), startAndTick(), tick()

### Community 17 - "Community 17"
Cohesion: 0.09
Nodes (1): TerminalManager

### Community 18 - "Community 18"
Cohesion: 0.11
Nodes (5): ContextManager, loadPlanContextBindings(), loadPlanContexts(), savePlanContextBindings(), savePlanContexts()

### Community 19 - "Community 19"
Cohesion: 0.12
Nodes (19): bump_version(), check_git_clean(), cleanup_deploy_configs(), create_deploy_configs(), main(), patch_native_modules(), Remove the config-deploy/ staging directory., Abort if working tree is dirty. (+11 more)

### Community 20 - "Community 20"
Cohesion: 0.11
Nodes (3): IncomingPlansWatcher, PlanBackupManager, toFsSafeTimestamp()

### Community 21 - "Community 21"
Cohesion: 0.13
Nodes (1): TelegramBotCore

### Community 22 - "Community 22"
Cohesion: 0.08
Nodes (27): Plan Attachments and Sequence Memory MCP Guidance, Configurable Submit Suffix, Telegram Rewrite, Activity Dots, Browser Gamepad API, Directory Plans NCN, IPC Bridge Pattern, Plan Backup and Restore (+19 more)

### Community 23 - "Community 23"
Cohesion: 0.18
Nodes (5): loadScheduledTasks(), saveScheduledTasks(), parseSubmitSuffix(), ScheduledTaskManager, splitCliParams()

### Community 24 - "Community 24"
Cohesion: 0.1
Nodes (2): handleButton(), navigateTab()

### Community 25 - "Community 25"
Cohesion: 0.18
Nodes (2): StateDetector, stripAnsi()

### Community 26 - "Community 26"
Cohesion: 0.16
Nodes (2): buildContent(), NotificationManager

### Community 27 - "Community 27"
Cohesion: 0.14
Nodes (1): WindowManager

### Community 28 - "Community 28"
Cohesion: 0.21
Nodes (1): HelmPlanService

### Community 29 - "Community 29"
Cohesion: 0.14
Nodes (17): Localhost MCP Server, Directory Plan Controls, Directory Plans NCN, Plan Lifecycle, PlanManager, Sugiyama Plan Layout, Legacy Helm Envelope Reference, Helm JSON Envelope (+9 more)

### Community 30 - "Community 30"
Cohesion: 0.2
Nodes (15): _cleanup(), _command_wrapper_name(), dependencies_ready(), _install_signal_handlers(), main(), print_header(), print_step(), Print a formatted header (+7 more)

### Community 31 - "Community 31"
Cohesion: 0.17
Nodes (1): HelmContextService

### Community 32 - "Community 32"
Cohesion: 0.24
Nodes (2): HelmSessionService, requireResult()

### Community 33 - "Community 33"
Cohesion: 0.19
Nodes (2): escapeShellArg(), PtyManager

### Community 34 - "Community 34"
Cohesion: 0.26
Nodes (10): findFreePort(), OpenWhisprTranscriber, replaceExtension(), requestTranscription(), resolveFfmpegPath(), resolveModelPath(), resolveWhisperServerPath(), runProcess() (+2 more)

### Community 35 - "Community 35"
Cohesion: 0.15
Nodes (14): Binding Action Types, Pattern Rules, Sequence Parser Syntax, Navigation Priority Chain, Group Overview Mode, PTY Output Preview Grid, StateDetector Module, TerminalManager Module (+6 more)

### Community 36 - "Community 36"
Cohesion: 0.19
Nodes (6): buildLegacySpawnCommand(), normalizeToolConfig(), parseCliArgs(), parseCommandTemplate(), setupTestFiles(), writeYaml()

### Community 37 - "Community 37"
Cohesion: 0.15
Nodes (1): MockResizeObserver

### Community 38 - "Community 38"
Cohesion: 0.27
Nodes (11): extract_test_results(), format_markdown_output(), main(), Run tests based on mode., Run ESLint if available., Run a command and return result info., Extract test results from output., Format results as markdown. (+3 more)

### Community 39 - "Community 39"
Cohesion: 0.26
Nodes (7): commitPort(), commitToken(), normalizePort(), onPortBlur(), onPortChange(), onTokenBlur(), onTokenInput()

### Community 40 - "Community 40"
Cohesion: 0.24
Nodes (1): HelmPlanSequenceService

### Community 41 - "Community 41"
Cohesion: 0.29
Nodes (8): captureDeliverySnapshot(), classifyDelivery(), deliverySnippets(), makeResult(), retrySubmit(), tailToText(), verifyDeliveryAfterDelay(), wait()

### Community 42 - "Community 42"
Cohesion: 0.3
Nodes (1): DraftManager

### Community 43 - "Community 43"
Cohesion: 0.18
Nodes (2): flush(), loadAndFlush()

### Community 44 - "Community 44"
Cohesion: 0.2
Nodes (1): PipelineQueue

### Community 45 - "Community 45"
Cohesion: 0.25
Nodes (1): ProjectStore

### Community 47 - "Community 47"
Cohesion: 0.36
Nodes (1): ProfileManager

### Community 48 - "Community 48"
Cohesion: 0.31
Nodes (1): SettingsManager

### Community 49 - "Community 49"
Cohesion: 0.31
Nodes (1): TerminalOutputBuffer

### Community 52 - "Community 52"
Cohesion: 0.39
Nodes (1): KeyboardSimulator

### Community 53 - "Community 53"
Cohesion: 0.28
Nodes (1): FakePtyManager

### Community 55 - "Community 55"
Cohesion: 0.39
Nodes (2): decodeBase64Content(), HelmPlanAttachmentService

### Community 56 - "Community 56"
Cohesion: 0.25
Nodes (1): HelmSchedulerService

### Community 57 - "Community 57"
Cohesion: 0.29
Nodes (1): CronEngine

### Community 58 - "Community 58"
Cohesion: 0.29
Nodes (1): FakeSessionManager

### Community 59 - "Community 59"
Cohesion: 0.4
Nodes (2): clampHeight(), onResizeMove()

### Community 61 - "Community 61"
Cohesion: 0.33
Nodes (1): HelmProjectService

### Community 62 - "Community 62"
Cohesion: 0.47
Nodes (2): HelmSessionPlanService, normalizeDirectoryPath()

### Community 63 - "Community 63"
Cohesion: 0.33
Nodes (1): MockResizeObserver

### Community 64 - "Community 64"
Cohesion: 0.33
Nodes (1): MockResizeObserver

### Community 67 - "Community 67"
Cohesion: 0.4
Nodes (1): HelmDirectoryService

### Community 71 - "Community 71"
Cohesion: 0.4
Nodes (5): GitHub App Update Provider, Deploy Config Stripping, Two Step Release Workflow, Self Contained Profile Model, ConfigLoader Module

### Community 72 - "Community 72"
Cohesion: 0.4
Nodes (5): Renderer Content Security Policy, Helm Renderer Entrypoint, vue-main.ts Module, Vue App Mount Point, xterm Stylesheet

### Community 73 - "Community 73"
Cohesion: 0.67
Nodes (2): nextRunMs(), timeRemaining()

### Community 74 - "Community 74"
Cohesion: 0.67
Nodes (2): applyPtyFilters(), stripAltScreen()

### Community 78 - "Community 78"
Cohesion: 0.5
Nodes (4): Default Profile, Profile Bindings Config, Profile Tools Config, Default Profile Reference

### Community 79 - "Community 79"
Cohesion: 0.67
Nodes (4): Green Wave Accent, Helm Paper Boat Icon, Paper Boat Symbol, Terminal Prompt Mark

### Community 97 - "Community 97"
Cohesion: 1.0
Nodes (2): Electron MIT License, Chromium Third Party Credits

### Community 98 - "Community 98"
Cohesion: 1.0
Nodes (2): Empty Drafts Config, Empty Sessions Config

### Community 99 - "Community 99"
Cohesion: 1.0
Nodes (2): Haptic Feedback Setting, Notifications Setting

### Community 129 - "Community 129"
Cohesion: 1.0
Nodes (1): Navigation State Ownership Fix

### Community 130 - "Community 130"
Cohesion: 1.0
Nodes (1): Modal Guard Regression Fixes

### Community 131 - "Community 131"
Cohesion: 1.0
Nodes (1): File Structure Module Map

## Ambiguous Edges - Review These
- `Legacy Helm Envelope Reference` → `Helm JSON Envelope`  [AMBIGUOUS]
  docs/helm-envelope-reference.md · relation: semantically_similar_to

## Knowledge Gaps
- **66 isolated node(s):** `Run shell command, printing output in real-time.`, `Patch node-pty .gyp files to disable Spectre mitigation requirement.      VS 2`, `Bump version in package.json and return (old_version, new_version).`, `Create stripped config files in config-deploy/ for packaging.      Original co`, `Remove the config-deploy/ staging directory.` (+61 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 17`** (34 nodes): `TerminalManager`, `.adoptTerminal()`, `.constructor()`, `.createTerminal()`, `.deselect()`, `.destroyTerminal()`, `.detachTerminal()`, `.dispose()`, `.fitActive()`, `.fitAll()`, `.focusActive()`, `.getActiveSessionId()`, `.getActiveView()`, `.getCount()`, `.getManagedSessions()`, `.getOutputBuffer()`, `.getSession()`, `.getSessionIds()`, `.getTerminalLines()`, `.getTitle()`, `.has()`, `.hasTerminal()`, `.hydrateFromStore()`, `.hydrateSessions()`, `.removeManagedSession()`, `.renameSession()`, `.setOnEmpty()`, `.setOnSwitch()`, `.setOnTitleChange()`, `.setupIpcListeners()`, `.setupResizeObserver()`, `.switchTo()`, `.upsertManagedSession()`, `.writeToTerminal()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (29 nodes): `TelegramBotCore`, `.answerCallback()`, `.closeForumTopic()`, `.createForumTopic()`, `.deleteForumTopic()`, `.downloadFile()`, `.editForumTopic()`, `.editMessageDebounced()`, `.flushEdit()`, `.getBot()`, `.getChatId()`, `.handleCallbackQuery()`, `.handleMessage()`, `.handleMessageReaction()`, `.isAuthorized()`, `.isPathInsideDirectory()`, `.isRateLimited()`, `.isRunning()`, `.reopenForumTopic()`, `.resolveDownloadFileName()`, `.sanitizeFileName()`, `.sendDocument()`, `.sendMessage()`, `.sendPhoto()`, `.sendToTopic()`, `.sendVideo()`, `.start()`, `.stop()`, `.withTimeout()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (22 nodes): `BindingsTab.vue`, `ChipbarActionsTab.vue`, `PlansGrid.vue`, `SessionCard.vue`, `SessionGroup.vue`, `SessionList.vue`, `SettingsPanel.vue`, `SortBar.vue`, `SpawnGrid.vue`, `StatusStrip.vue`, `TelegramTab.vue`, `ToolsTab.vue`, `colClass()`, `onCardClick()`, `onRenameKeydown()`, `selectState()`, `handleButton()`, `navigateTab()`, `makeCardProps()`, `makeGroupProps()`, `makeSessionListProps()`, `sidebar.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (18 nodes): `StateDetector`, `.clearActivityTimers()`, `.constructor()`, `.dispose()`, `.getLastOutputTime()`, `.getOrCreate()`, `.getState()`, `.hasQuestion()`, `.markActive()`, `.markResizing()`, `.markRestored()`, `.markScrolling()`, `.markSwitching()`, `.processOutput()`, `.promoteIfRecentOutput()`, `.removeSession()`, `.resetActivityTimers()`, `stripAnsi()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (18 nodes): `buildContent()`, `NotificationManager`, `.constructor()`, `.dispatchLlmInAppNotification()`, `.dispose()`, `.feedOutput()`, `.getAppVisibility()`, `.getAppVisibilityDetails()`, `.getLastLines()`, `.handleActivityChange()`, `.maybeNotify()`, `.notifyLlmDirected()`, `.removeSession()`, `.setActiveSessionIdGetter()`, `.setScreenLockChecker()`, `.setTelegramNotifier()`, `.shouldNotify()`, `.showNotification()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (17 nodes): `WindowManager`, `.assignSessionToWindow()`, `.closeAllChildWindows()`, `.focusWindowForSession()`, `.getAllWindows()`, `.getChildWindowIds()`, `.getMainWindow()`, `.getSessionsInWindow()`, `.getSnappedOutSessions()`, `.getWindow()`, `.getWindowForSession()`, `.getWindowIdForSession()`, `.isSessionSnappedOut()`, `.registerWindow()`, `.setMainWindow()`, `.unassignSession()`, `.unregisterWindow()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (17 nodes): `HelmPlanService`, `.completePlan()`, `.constructor()`, `.createPlan()`, `.deletePlan()`, `.exportDirectory()`, `.exportItem()`, `.getPlan()`, `.linkPlans()`, `.listPlans()`, `.plansSummary()`, `.reopenPlan()`, `.requireWorkingDirectory()`, `.resolvePlanRef()`, `.setPlanState()`, `.unlinkPlans()`, `.updatePlan()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (16 nodes): `HelmContextService`, `.appendContext()`, `.bindContext()`, `.constructor()`, `.createContext()`, `.deleteContext()`, `.getContext()`, `.getProjectIdForDirectory()`, `.listContexts()`, `.listPlanContexts()`, `.requireProject()`, `.requireWorkingDirectory()`, `.resolvePlanRef()`, `.setContextPosition()`, `.unbindContext()`, `.updateContext()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 32`** (14 nodes): `HelmSessionService`, `.closeSession()`, `.constructor()`, `.findSession()`, `.getSession()`, `.listSessions()`, `.readSessionTerminal()`, `.requireCliEntry()`, `.requireWorkingDirectory()`, `.setAiagentState()`, `.setSessionWorkingPlan()`, `.spawnCli()`, `.toSessionSummary()`, `requireResult()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (14 nodes): `escapeShellArg()`, `PtyManager`, `.constructor()`, `.deliverText()`, `.getPid()`, `.getSessionIds()`, `.getTerminalTail()`, `.has()`, `.kill()`, `.killAll()`, `.resize()`, `.setTextDeliveryHandler()`, `.spawn()`, `.write()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (13 nodes): `createContainer()`, `lastFitAddon()`, `lastSearchAddon()`, `lastTerminal()`, `makeMockFitAddon()`, `makeMockSearchAddon()`, `makeMockTerminal()`, `MockResizeObserver`, `.constructor()`, `.disconnect()`, `.observe()`, `.unobserve()`, `terminal-manager.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (12 nodes): `HelmPlanSequenceService`, `.appendPlanSequenceMemory()`, `.assertSequenceMutex()`, `.assignPlanSequence()`, `.constructor()`, `.createPlanSequence()`, `.deletePlanSequence()`, `.getPlanSequence()`, `.listPlanSequences()`, `.requireWorkingDirectory()`, `.resolvePlanRef()`, `.updatePlanSequence()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (12 nodes): `DraftManager`, `.clearSession()`, `.constructor()`, `.count()`, `.create()`, `.delete()`, `.exportAll()`, `.get()`, `.getForSession()`, `.importAll()`, `.markChanged()`, `.update()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (12 nodes): `buildSidebarDom()`, `createMockTerminalManager()`, `enterRenameMode()`, `flush()`, `getSessions()`, `getSessionsState()`, `getState()`, `loadAndFlush()`, `makeSessions()`, `pressKey()`, `setMockTerminalSessions()`, `sessions-screen.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (11 nodes): `PipelineQueue`, `.clear()`, `.dequeue()`, `.enqueue()`, `.getAll()`, `.getPosition()`, `.has()`, `.length()`, `.peek()`, `.pop()`, `.triggerHandoff()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (11 nodes): `ProjectStore`, `.addDirectory()`, `.constructor()`, `.delete()`, `.getById()`, `.isDirty()`, `.list()`, `.removeDirectory()`, `.rename()`, `.requireRecord()`, `.save()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (10 nodes): `ProfileManager`, `.constructor()`, `.loadActiveProfile()`, `.migrateGlobalFiles()`, `.migrateProfile()`, `.profilePath()`, `.readYaml()`, `.reloadIfChanged()`, `.save()`, `.saveRaw()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (10 nodes): `SettingsManager`, `.constructor()`, `.flush()`, `.load()`, `.normalize()`, `.readYaml()`, `.save()`, `.saveNow()`, `.settingsPath()`, `.write()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (10 nodes): `TerminalOutputBuffer`, `.append()`, `.appendToLineBuffer()`, `.clear()`, `.clearAll()`, `.collapseCarriageReturn()`, `.constructor()`, `.getLines()`, `.getOrCreate()`, `.tail()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (9 nodes): `KeyboardSimulator`, `.comboDown()`, `.comboUp()`, `.keyDown()`, `.keyTap()`, `.keyUp()`, `.normalizeKey()`, `.sendKeyCombo()`, `.typeString()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (9 nodes): `FakePtyManager`, `.constructor()`, `.deliverText()`, `.emitExit()`, `.getWrites()`, `.has()`, `.spawn()`, `.spawnCommand()`, `.write()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 55`** (8 nodes): `decodeBase64Content()`, `HelmPlanAttachmentService`, `.addPlanAttachment()`, `.constructor()`, `.deletePlanAttachment()`, `.getPlanAttachment()`, `.listPlanAttachments()`, `.resolvePlanRef()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 56`** (8 nodes): `HelmSchedulerService`, `.cancelTask()`, `.constructor()`, `.createTask()`, `.deleteTask()`, `.getTask()`, `.listTasks()`, `.updateTask()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 57`** (8 nodes): `cron-engine.test.ts`, `cron-engine.ts`, `CronEngine`, `.isValid()`, `.nextRunTime()`, `.nextRunTimeBeforeDate()`, `.validate()`, `expectLocalDateTime()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 58`** (7 nodes): `FakeSessionManager`, `.addSession()`, `.getActiveSession()`, `.getSession()`, `.removeSession()`, `.setActiveSession()`, `.spawn()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 59`** (6 nodes): `clampHeight()`, `focus()`, `onResizeMove()`, `startResize()`, `stopResize()`, `PromptTextarea.vue`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 61`** (6 nodes): `HelmProjectService`, `.addProjectDir()`, `.constructor()`, `.listProjectDirs()`, `.listProjects()`, `.removeProjectDir()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 62`** (6 nodes): `HelmSessionPlanService`, `.constructor()`, `.findSession()`, `.resolvePlanRef()`, `.setWorkingPlan()`, `normalizeDirectoryPath()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 63`** (6 nodes): `MockResizeObserver`, `.constructor()`, `.disconnect()`, `.observe()`, `.unobserve()`, `bindings-pty.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 64`** (6 nodes): `MockResizeObserver`, `.constructor()`, `.disconnect()`, `.observe()`, `.unobserve()`, `bindings-target.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 67`** (5 nodes): `HelmDirectoryService`, `.constructor()`, `.listClis()`, `.listDirectories()`, `.requireCliEntry()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 73`** (4 nodes): `SchedulerSection.vue`, `nextRunMs()`, `timeRemaining()`, `scheduler-section.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 74`** (4 nodes): `pty-filter.ts`, `applyPtyFilters()`, `stripAltScreen()`, `pty-filter.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 97`** (2 nodes): `Electron MIT License`, `Chromium Third Party Credits`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 98`** (2 nodes): `Empty Drafts Config`, `Empty Sessions Config`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 99`** (2 nodes): `Haptic Feedback Setting`, `Notifications Setting`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 129`** (1 nodes): `Navigation State Ownership Fix`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 130`** (1 nodes): `Modal Guard Regression Fixes`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 131`** (1 nodes): `File Structure Module Map`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Legacy Helm Envelope Reference` and `Helm JSON Envelope`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **Why does `ConfigLoader` connect `Community 5` to `Community 1`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Why does `HelmControlService` connect `Community 6` to `Community 1`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Why does `TerminalManager` connect `Community 17` to `Community 2`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **What connects `Run shell command, printing output in real-time.`, `Patch node-pty .gyp files to disable Spectre mitigation requirement.      VS 2`, `Bump version in package.json and return (old_version, new_version).` to the rest of the system?**
  _66 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._