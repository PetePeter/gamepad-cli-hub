# Graph Report - gamepad-cli-hub  (2026-05-17)

## Corpus Check
- 419 files · ~3,156,518 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3404 nodes · 7002 edges · 83 communities detected
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 324 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 100|Community 100]]
- [[_COMMUNITY_Community 101|Community 101]]
- [[_COMMUNITY_Community 102|Community 102]]
- [[_COMMUNITY_Community 133|Community 133]]
- [[_COMMUNITY_Community 134|Community 134]]
- [[_COMMUNITY_Community 135|Community 135]]
- [[_COMMUNITY_Community 136|Community 136]]
- [[_COMMUNITY_Community 137|Community 137]]
- [[_COMMUNITY_Community 138|Community 138]]

## God Nodes (most connected - your core abstractions)
1. `HelmControlService` - 87 edges
2. `get()` - 86 edges
3. `ConfigLoader` - 77 edges
4. `callTool()` - 75 edges
5. `callMcpTool()` - 68 edges
6. `ensureLoaded()` - 55 edges
7. `PlanManager` - 54 edges
8. `set()` - 47 edges
9. `delete()` - 45 edges
10. `TerminalManager` - 34 edges

## Surprising Connections (you probably didn't know these)
- `Gamepad Control` --semantically_similar_to--> `Browser Gamepad API`  [INFERRED] [semantically similar]
  README.md → CLAUDE.md
- `Directory Planning` --semantically_similar_to--> `Directory Plans NCN`  [INFERRED] [semantically similar]
  README.md → CLAUDE.md
- `Plan Backups` --semantically_similar_to--> `Plan Backup and Restore`  [INFERRED] [semantically similar]
  README.md → CLAUDE.md
- `Plan Integration Patterns` --references--> `getToolReminder Post-Call Hints`  [INFERRED]
  docs/helm-session-info.md → src/mcp/localhost-mcp-server.ts
- `initConfigCache()` --calls--> `bootstrap()`  [INFERRED]
  renderer\bindings.ts → renderer\composables\useAppBootstrap.ts

## Hyperedges (group relationships)
- **MCP Tool Dispatch Chain** — localhostmcp_LocalhostMcpServer, dispatcher_callMcpTool, helmcontrol_HelmControlService [EXTRACTED 1.00]
- **Session Info Assembly** — sessioninfoguide_getSessionInfo, availabletools_getAvailableTools, helmcontrol_HelmControlService [EXTRACTED 1.00]
- **Skill Management Lifecycle** — skillmanager_SkillManager, helmcontrol_HelmControlService, types_skill_SkillInterface [EXTRACTED 1.00]
- **Skills IPC bridge: IPC handlers -> preload impl -> renderer client -> composable -> Vue component** —  [INFERRED]
- **Preload API domain registry: method name -> domain lookup -> domain builder** —  [INFERRED]
- **MCP layer test suites covering HelmControlService + LocalhostMcpServer** —  [INFERRED]

## Communities

### Community 0 - "Community 0"
Cohesion: 0.01
Nodes (683): absoluteStoragePath(), actionToPtyData(), add(), addDependency(), addDirectory(), addPlanAttachment(), addProjectDir(), addSession() (+675 more)

### Community 1 - "Community 1"
Cohesion: 0.01
Nodes (108): resolveEnvWithMode(), TelegramConfigManager, buildAgentPlanGuide(), buildAiagentStateGuide(), getAiagentStates(), buildNotificationGuide(), getAvailableDirectories(), getAvailableProjects() (+100 more)

### Community 2 - "Community 2"
Cohesion: 0.01
Nodes (149): createSortControl(), createController(), autoResumeSessions(), bootstrap(), clamp(), cleanupRendererSession(), doCloseSession(), doSpawn() (+141 more)

### Community 3 - "Community 3"
Cohesion: 0.02
Nodes (86): createRouter(), useEscProtection(), isEditableElementInsideModal(), useInputRouter(), useModalStack(), useNavigation(), handleDraftEditorButton(), isDraftEditorVisible() (+78 more)

### Community 4 - "Community 4"
Cohesion: 0.04
Nodes (116): hidePlanDeleteConfirm(), showPlanDeleteConfirm(), ensureOverlay(), hidePlanHelpModal(), isPlanHelpVisible(), showPlanHelpModal(), applySequenceBandLayout(), assignCoordinates() (+108 more)

### Community 5 - "Community 5"
Cohesion: 0.03
Nodes (21): ContextManager, cleanupOrphanDependencies(), decodeFilename(), deletePlanFile(), encodeFilename(), listPlanFiles(), loadDependencies(), loadPlanContextBindings() (+13 more)

### Community 6 - "Community 6"
Cohesion: 0.04
Nodes (5): decodeBase64Content(), HelmControlService, parseSubmitSuffix(), requireResult(), validateMobileFriendlyTelegramText()

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (7): buildLegacySpawnCommand(), ConfigLoader, isCliTypeOptions(), normalizeMcpPort(), normalizeToolConfig(), parseCliArgs(), parseCommandTemplate()

### Community 8 - "Community 8"
Cohesion: 0.05
Nodes (48): editOriginalMessage(), formatTopicCleanupPreview(), formatTopicCleanupResult(), handleAccept(), handleCancel(), handleCloseAll(), handleCloseSession(), handleContinue() (+40 more)

### Community 9 - "Community 9"
Cohesion: 0.04
Nodes (31): handleButton(), onSave(), handleButton(), handleButton(), actionForIndex(), clampIndex(), close(), handleButton() (+23 more)

### Community 10 - "Community 10"
Cohesion: 0.05
Nodes (31): clearStartupFallbackTimer(), closeSplashWindow(), createSplashWindow(), createWindow(), maybeShowMainWindow(), readWindowBounds(), resolveSplashLogoUrl(), buildSplashHtml() (+23 more)

### Community 11 - "Community 11"
Cohesion: 0.06
Nodes (54): addBookmarkedDir(), addCliType(), addPattern(), addWorkingDirectory(), clearSnapOutWindowPrefs(), copyCliBindings(), ensureLoaded(), getActivityTimeout() (+46 more)

### Community 12 - "Community 12"
Cohesion: 0.05
Nodes (14): loadDrafts(), sanitizeDrafts(), isAnyString(), cleanupOrphanDependencies(), decodeFilename(), deletePlanFile(), encodeFilename(), isDirectoryPlan() (+6 more)

### Community 13 - "Community 13"
Cohesion: 0.09
Nodes (14): asAiagentState(), asContextBindingTargetType(), asPlanStatus(), asPlanTypeOrNull(), asRecord(), asString(), asTerminalOutputMode(), getToolReminder() (+6 more)

### Community 14 - "Community 14"
Cohesion: 0.06
Nodes (9): applyFocus(), doAutoSave(), handleButton(), onCancel(), onKeyDown(), onLabelKeyDown(), onSave(), makeSections() (+1 more)

### Community 15 - "Community 15"
Cohesion: 0.1
Nodes (3): SessionManager, saveSessions(), TopicManager

### Community 16 - "Community 16"
Cohesion: 0.09
Nodes (1): TerminalManager

### Community 17 - "Community 17"
Cohesion: 0.12
Nodes (19): bump_version(), check_git_clean(), cleanup_deploy_configs(), create_deploy_configs(), main(), patch_native_modules(), Remove the config-deploy/ staging directory., Abort if working tree is dirty. (+11 more)

### Community 18 - "Community 18"
Cohesion: 0.07
Nodes (3): cb(), PtyOutputBuffer, TerminalView

### Community 19 - "Community 19"
Cohesion: 0.13
Nodes (1): TelegramBotCore

### Community 20 - "Community 20"
Cohesion: 0.09
Nodes (29): getAvailableTools Function, MCP_TOOLS Registry, Required Plan Description Sections, McpToolDispatcherDeps Interface, callMcpTool Dispatcher, AIAGENT State Registry, Session-Scoped vs Global Auth, session_info MCP Tool Documentation (+21 more)

### Community 21 - "Community 21"
Cohesion: 0.14
Nodes (1): BrowserGamepadPoller

### Community 22 - "Community 22"
Cohesion: 0.08
Nodes (27): Plan Attachments and Sequence Memory MCP Guidance, Configurable Submit Suffix, Telegram Rewrite, Activity Dots, Browser Gamepad API, Directory Plans NCN, IPC Bridge Pattern, Plan Backup and Restore (+19 more)

### Community 23 - "Community 23"
Cohesion: 0.17
Nodes (8): assertNoDuplicateType(), dedupSummaries(), normalizeOptional(), normalizeOptionalType(), normalizePersistedSkill(), normalizeRequired(), normalizeScope(), SkillManager

### Community 24 - "Community 24"
Cohesion: 0.14
Nodes (7): escapeHtml(), extractAttachmentInfo(), formatMessageForTelegram(), isAudioAttachment(), oneLine(), TelegramRelayService, wrapTelegramEnvelope()

### Community 25 - "Community 25"
Cohesion: 0.21
Nodes (3): parseSubmitSuffix(), ScheduledTaskManager, splitCliParams()

### Community 26 - "Community 26"
Cohesion: 0.1
Nodes (2): handleButton(), navigateTab()

### Community 27 - "Community 27"
Cohesion: 0.19
Nodes (2): PlanBackupManager, toFsSafeTimestamp()

### Community 28 - "Community 28"
Cohesion: 0.16
Nodes (4): PatternMatcher, parseAbsolute(), parseRelative(), parseScheduledTime()

### Community 29 - "Community 29"
Cohesion: 0.16
Nodes (2): buildContent(), NotificationManager

### Community 30 - "Community 30"
Cohesion: 0.18
Nodes (2): StateDetector, stripAnsi()

### Community 31 - "Community 31"
Cohesion: 0.14
Nodes (1): WindowManager

### Community 32 - "Community 32"
Cohesion: 0.21
Nodes (1): HelmPlanService

### Community 33 - "Community 33"
Cohesion: 0.14
Nodes (17): Localhost MCP Server, Directory Plan Controls, Directory Plans NCN, Plan Lifecycle, PlanManager, Sugiyama Plan Layout, Legacy Helm Envelope Reference, Helm JSON Envelope (+9 more)

### Community 34 - "Community 34"
Cohesion: 0.2
Nodes (15): _cleanup(), _command_wrapper_name(), dependencies_ready(), _install_signal_handlers(), main(), print_header(), print_step(), Print a formatted header (+7 more)

### Community 35 - "Community 35"
Cohesion: 0.17
Nodes (1): HelmContextService

### Community 36 - "Community 36"
Cohesion: 0.24
Nodes (2): HelmSessionService, requireResult()

### Community 37 - "Community 37"
Cohesion: 0.2
Nodes (2): findProjectByPath(), ProjectStore

### Community 38 - "Community 38"
Cohesion: 0.19
Nodes (2): escapeShellArg(), PtyManager

### Community 39 - "Community 39"
Cohesion: 0.26
Nodes (10): findFreePort(), OpenWhisprTranscriber, replaceExtension(), requestTranscription(), resolveFfmpegPath(), resolveModelPath(), resolveWhisperServerPath(), runProcess() (+2 more)

### Community 40 - "Community 40"
Cohesion: 0.15
Nodes (14): Binding Action Types, Pattern Rules, Sequence Parser Syntax, Navigation Priority Chain, Group Overview Mode, PTY Output Preview Grid, StateDetector Module, TerminalManager Module (+6 more)

### Community 41 - "Community 41"
Cohesion: 0.19
Nodes (6): buildLegacySpawnCommand(), normalizeToolConfig(), parseCliArgs(), parseCommandTemplate(), setupTestFiles(), writeYaml()

### Community 42 - "Community 42"
Cohesion: 0.22
Nodes (2): HelmTelegramService, validateMobileFriendlyTelegramText()

### Community 43 - "Community 43"
Cohesion: 0.15
Nodes (1): MockResizeObserver

### Community 44 - "Community 44"
Cohesion: 0.27
Nodes (11): extract_test_results(), format_markdown_output(), main(), Run tests based on mode., Run ESLint if available., Run a command and return result info., Extract test results from output., Format results as markdown. (+3 more)

### Community 45 - "Community 45"
Cohesion: 0.26
Nodes (7): commitPort(), commitToken(), normalizePort(), onPortBlur(), onPortChange(), onTokenBlur(), onTokenInput()

### Community 46 - "Community 46"
Cohesion: 0.24
Nodes (1): HelmPlanSequenceService

### Community 47 - "Community 47"
Cohesion: 0.3
Nodes (1): DraftManager

### Community 48 - "Community 48"
Cohesion: 0.18
Nodes (2): flush(), loadAndFlush()

### Community 49 - "Community 49"
Cohesion: 0.15
Nodes (1): FakeSessionManager

### Community 50 - "Community 50"
Cohesion: 0.2
Nodes (2): isDynamicImportFailure(), reloadAfterDynamicImportFailure()

### Community 51 - "Community 51"
Cohesion: 0.24
Nodes (3): createHelmPreloadApi(), createHelmPreloadApi(), createPreloadDomains()

### Community 52 - "Community 52"
Cohesion: 0.2
Nodes (1): PipelineQueue

### Community 53 - "Community 53"
Cohesion: 0.36
Nodes (1): ProfileManager

### Community 54 - "Community 54"
Cohesion: 0.31
Nodes (1): SettingsManager

### Community 55 - "Community 55"
Cohesion: 0.31
Nodes (1): TerminalOutputBuffer

### Community 56 - "Community 56"
Cohesion: 0.22
Nodes (10): MainWindowApp.vue (app shell), SettingsSkillDraft interface, SettingsSkillSummary interface (useSettingsController), SkillSummary interface (SettingsTab), SkillsTab.vue (settings skills panel), configClient (IPC client), skillsClient (IPC client), telegramClient (IPC client) (+2 more)

### Community 58 - "Community 58"
Cohesion: 0.39
Nodes (1): KeyboardSimulator

### Community 59 - "Community 59"
Cohesion: 0.28
Nodes (1): FakePtyManager

### Community 61 - "Community 61"
Cohesion: 0.25
Nodes (1): HelmSchedulerService

### Community 62 - "Community 62"
Cohesion: 0.29
Nodes (1): CronEngine

### Community 63 - "Community 63"
Cohesion: 0.47
Nodes (4): makeButton(), makeGamepad(), startAndTick(), tick()

### Community 64 - "Community 64"
Cohesion: 0.4
Nodes (2): clampHeight(), onResizeMove()

### Community 66 - "Community 66"
Cohesion: 0.33
Nodes (1): MockResizeObserver

### Community 67 - "Community 67"
Cohesion: 0.33
Nodes (1): MockResizeObserver

### Community 71 - "Community 71"
Cohesion: 0.4
Nodes (5): GitHub App Update Provider, Deploy Config Stripping, Two Step Release Workflow, Self Contained Profile Model, ConfigLoader Module

### Community 72 - "Community 72"
Cohesion: 0.4
Nodes (5): Renderer Content Security Policy, Helm Renderer Entrypoint, vue-main.ts Module, Vue App Mount Point, xterm Stylesheet

### Community 73 - "Community 73"
Cohesion: 0.5
Nodes (5): HelmControlService (MCP control service), LocalhostMcpServer (MCP HTTP server), HelmControlService test suite, LocalhostMcpServer test suite, getAvailableTools (session info guide)

### Community 74 - "Community 74"
Cohesion: 0.67
Nodes (2): nextRunMs(), timeRemaining()

### Community 75 - "Community 75"
Cohesion: 0.67
Nodes (2): applyPtyFilters(), stripAltScreen()

### Community 76 - "Community 76"
Cohesion: 0.67
Nodes (2): setupTestFiles(), writeYaml()

### Community 80 - "Community 80"
Cohesion: 0.5
Nodes (4): Default Profile, Profile Bindings Config, Profile Tools Config, Default Profile Reference

### Community 81 - "Community 81"
Cohesion: 0.67
Nodes (4): Green Wave Accent, Helm Paper Boat Icon, Paper Boat Symbol, Terminal Prompt Mark

### Community 82 - "Community 82"
Cohesion: 0.67
Nodes (4): PRELOAD_API_DOMAINS (domain method registry), createPreloadDomains (domain builder), PRELOAD_METHOD_IMPLEMENTATIONS (preload bridge), setupSkillHandlers (IPC handler registration)

### Community 100 - "Community 100"
Cohesion: 1.0
Nodes (2): Electron MIT License, Chromium Third Party Credits

### Community 101 - "Community 101"
Cohesion: 1.0
Nodes (2): Empty Drafts Config, Empty Sessions Config

### Community 102 - "Community 102"
Cohesion: 1.0
Nodes (2): Haptic Feedback Setting, Notifications Setting

### Community 133 - "Community 133"
Cohesion: 1.0
Nodes (1): Navigation State Ownership Fix

### Community 134 - "Community 134"
Cohesion: 1.0
Nodes (1): Modal Guard Regression Fixes

### Community 135 - "Community 135"
Cohesion: 1.0
Nodes (1): File Structure Module Map

### Community 136 - "Community 136"
Cohesion: 1.0
Nodes (1): SessionSummary Interface

### Community 137 - "Community 137"
Cohesion: 1.0
Nodes (1): getPreloadApiDomain (domain resolver)

### Community 138 - "Community 138"
Cohesion: 1.0
Nodes (1): SkillManager test suite

## Ambiguous Edges - Review These
- `Legacy Helm Envelope Reference` → `Helm JSON Envelope`  [AMBIGUOUS]
  docs/helm-envelope-reference.md · relation: semantically_similar_to

## Knowledge Gaps
- **85 isolated node(s):** `Run shell command, printing output in real-time.`, `Patch node-pty .gyp files to disable Spectre mitigation requirement.      VS 2`, `Bump version in package.json and return (old_version, new_version).`, `Create stripped config files in config-deploy/ for packaging.      Original co`, `Remove the config-deploy/ staging directory.` (+80 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 16`** (34 nodes): `TerminalManager`, `.adoptTerminal()`, `.constructor()`, `.createTerminal()`, `.deselect()`, `.destroyTerminal()`, `.detachTerminal()`, `.dispose()`, `.fitActive()`, `.fitAll()`, `.focusActive()`, `.getActiveSessionId()`, `.getActiveView()`, `.getCount()`, `.getManagedSessions()`, `.getOutputBuffer()`, `.getSession()`, `.getSessionIds()`, `.getTerminalLines()`, `.getTitle()`, `.has()`, `.hasTerminal()`, `.hydrateFromStore()`, `.hydrateSessions()`, `.removeManagedSession()`, `.renameSession()`, `.setOnEmpty()`, `.setOnSwitch()`, `.setOnTitleChange()`, `.setupIpcListeners()`, `.setupResizeObserver()`, `.switchTo()`, `.upsertManagedSession()`, `.writeToTerminal()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 19`** (29 nodes): `TelegramBotCore`, `.answerCallback()`, `.closeForumTopic()`, `.createForumTopic()`, `.deleteForumTopic()`, `.downloadFile()`, `.editForumTopic()`, `.editMessageDebounced()`, `.flushEdit()`, `.getBot()`, `.getChatId()`, `.handleCallbackQuery()`, `.handleMessage()`, `.handleMessageReaction()`, `.isAuthorized()`, `.isPathInsideDirectory()`, `.isRateLimited()`, `.isRunning()`, `.reopenForumTopic()`, `.resolveDownloadFileName()`, `.sanitizeFileName()`, `.sendDocument()`, `.sendMessage()`, `.sendPhoto()`, `.sendToTopic()`, `.sendVideo()`, `.start()`, `.stop()`, `.withTimeout()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (27 nodes): `BrowserGamepadPoller`, `.checkDpad()`, `.checkDpadAxes()`, `.checkDpadButtons()`, `.checkRepeats()`, `.checkStickVirtualButtons()`, `.constructor()`, `.decodeHatAxis()`, `.emitConnectionEvent()`, `.emitDpadDirection()`, `.findDualAxisPair()`, `.findHatAxisIndex()`, `.getCount()`, `.getRepeatConfig()`, `.handleButtonPress()`, `.handleButtonRelease()`, `.logAxesDiagnostic()`, `.logGamepadState()`, `.onButton()`, `.onRelease()`, `.poll()`, `.processGamepad()`, `.requestGamepadAccess()`, `.setRepeatConfig()`, `.setupEvents()`, `.start()`, `.stop()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (22 nodes): `BindingsTab.vue`, `ChipbarActionsTab.vue`, `PlansGrid.vue`, `SessionCard.vue`, `SessionGroup.vue`, `SessionList.vue`, `SettingsPanel.vue`, `SortBar.vue`, `SpawnGrid.vue`, `StatusStrip.vue`, `TelegramTab.vue`, `ToolsTab.vue`, `colClass()`, `onCardClick()`, `onRenameKeydown()`, `selectState()`, `handleButton()`, `navigateTab()`, `makeCardProps()`, `makeGroupProps()`, `makeSessionListProps()`, `sidebar.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (22 nodes): `PlanBackupManager`, `.constructor()`, `.createSnapshot()`, `.deleteAllSnapshots()`, `.deleteSnapshot()`, `.getBackupDirForPath()`, `.getBackupSummary()`, `.getConfig()`, `.getDefaultConfig()`, `.getNewestSnapshot()`, `.getNextIndexForTimestamp()`, `.getOldestSnapshot()`, `.listSnapshots()`, `.loadConfig()`, `.pruneOldSnapshots()`, `.resolveBackupsRootDir()`, `.restoreFromSnapshot()`, `.saveConfig()`, `.updateConfig()`, `.validateConfig()`, `.validateSnapshot()`, `toFsSafeTimestamp()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (18 nodes): `buildContent()`, `NotificationManager`, `.constructor()`, `.dispatchLlmInAppNotification()`, `.dispose()`, `.feedOutput()`, `.getAppVisibility()`, `.getAppVisibilityDetails()`, `.getLastLines()`, `.handleActivityChange()`, `.maybeNotify()`, `.notifyLlmDirected()`, `.removeSession()`, `.setActiveSessionIdGetter()`, `.setScreenLockChecker()`, `.setTelegramNotifier()`, `.shouldNotify()`, `.showNotification()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (18 nodes): `StateDetector`, `.clearActivityTimers()`, `.constructor()`, `.dispose()`, `.getLastOutputTime()`, `.getOrCreate()`, `.getState()`, `.hasQuestion()`, `.markActive()`, `.markResizing()`, `.markRestored()`, `.markScrolling()`, `.markSwitching()`, `.processOutput()`, `.promoteIfRecentOutput()`, `.removeSession()`, `.resetActivityTimers()`, `stripAnsi()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (17 nodes): `WindowManager`, `.assignSessionToWindow()`, `.closeAllChildWindows()`, `.focusWindowForSession()`, `.getAllWindows()`, `.getChildWindowIds()`, `.getMainWindow()`, `.getSessionsInWindow()`, `.getSnappedOutSessions()`, `.getWindow()`, `.getWindowForSession()`, `.getWindowIdForSession()`, `.isSessionSnappedOut()`, `.registerWindow()`, `.setMainWindow()`, `.unassignSession()`, `.unregisterWindow()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 32`** (17 nodes): `HelmPlanService`, `.completePlan()`, `.constructor()`, `.createPlan()`, `.deletePlan()`, `.exportDirectory()`, `.exportItem()`, `.getPlan()`, `.linkPlans()`, `.listPlans()`, `.plansSummary()`, `.reopenPlan()`, `.requireWorkingDirectory()`, `.resolvePlanRef()`, `.setPlanState()`, `.unlinkPlans()`, `.updatePlan()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (16 nodes): `HelmContextService`, `.appendContext()`, `.bindContext()`, `.constructor()`, `.createContext()`, `.deleteContext()`, `.getContext()`, `.getProjectIdForDirectory()`, `.listContexts()`, `.listPlanContexts()`, `.requireProject()`, `.requireWorkingDirectory()`, `.resolvePlanRef()`, `.setContextPosition()`, `.unbindContext()`, `.updateContext()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (14 nodes): `HelmSessionService`, `.closeSession()`, `.constructor()`, `.findSession()`, `.getSession()`, `.listSessions()`, `.readSessionTerminal()`, `.requireCliEntry()`, `.requireWorkingDirectory()`, `.setAiagentState()`, `.setSessionWorkingPlan()`, `.spawnCli()`, `.toSessionSummary()`, `requireResult()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (14 nodes): `findProjectByPath()`, `ProjectStore`, `.addDirectory()`, `.constructor()`, `.delete()`, `.findByPath()`, `.getById()`, `.isDirty()`, `.list()`, `.removeDirectory()`, `.rename()`, `.requireRecord()`, `.resolveForPath()`, `.save()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (14 nodes): `escapeShellArg()`, `PtyManager`, `.constructor()`, `.deliverText()`, `.getPid()`, `.getSessionIds()`, `.getTerminalTail()`, `.has()`, `.kill()`, `.killAll()`, `.resize()`, `.setTextDeliveryHandler()`, `.spawn()`, `.write()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (13 nodes): `HelmTelegramService`, `.closeTelegramChannel()`, `.constructor()`, `.findSession()`, `.getAppVisibility()`, `.getTelegramStatus()`, `.notifyUser()`, `.requireTelegramAvailable()`, `.requireTelegramBridge()`, `.sendTelegramChat()`, `.setNotificationManager()`, `.setTelegramBridge()`, `validateMobileFriendlyTelegramText()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (13 nodes): `createContainer()`, `lastFitAddon()`, `lastSearchAddon()`, `lastTerminal()`, `makeMockFitAddon()`, `makeMockSearchAddon()`, `makeMockTerminal()`, `MockResizeObserver`, `.constructor()`, `.disconnect()`, `.observe()`, `.unobserve()`, `terminal-manager.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (12 nodes): `HelmPlanSequenceService`, `.appendPlanSequenceMemory()`, `.assertSequenceMutex()`, `.assignPlanSequence()`, `.constructor()`, `.createPlanSequence()`, `.deletePlanSequence()`, `.getPlanSequence()`, `.listPlanSequences()`, `.requireWorkingDirectory()`, `.resolvePlanRef()`, `.updatePlanSequence()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (12 nodes): `DraftManager`, `.clearSession()`, `.constructor()`, `.count()`, `.create()`, `.delete()`, `.exportAll()`, `.get()`, `.getForSession()`, `.importAll()`, `.markChanged()`, `.update()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (12 nodes): `buildSidebarDom()`, `createMockTerminalManager()`, `enterRenameMode()`, `flush()`, `getSessions()`, `getSessionsState()`, `getState()`, `loadAndFlush()`, `makeSessions()`, `pressKey()`, `setMockTerminalSessions()`, `sessions-screen.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (12 nodes): `FakeSessionManager`, `.addSession()`, `.getActiveSession()`, `.getSession()`, `.removeSession()`, `.setActiveSession()`, `.spawn()`, `makeConfigLoader()`, `makePlanManager()`, `makeProjectStore()`, `makeSessionManager()`, `helm-directory-service.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (11 nodes): `catch()`, `handlePlanScreenDpad()`, `if()`, `mapSession()`, `onTerminalEmpty()`, `onTerminalSwitch()`, `onTerminalTitleChange()`, `App.vue`, `isDynamicImportFailure()`, `reloadAfterDynamicImportFailure()`, `vue-main.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (11 nodes): `PipelineQueue`, `.clear()`, `.dequeue()`, `.enqueue()`, `.getAll()`, `.getPosition()`, `.has()`, `.length()`, `.peek()`, `.pop()`, `.triggerHandoff()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (10 nodes): `ProfileManager`, `.constructor()`, `.loadActiveProfile()`, `.migrateGlobalFiles()`, `.migrateProfile()`, `.profilePath()`, `.readYaml()`, `.reloadIfChanged()`, `.save()`, `.saveRaw()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (10 nodes): `SettingsManager`, `.constructor()`, `.flush()`, `.load()`, `.normalize()`, `.readYaml()`, `.save()`, `.saveNow()`, `.settingsPath()`, `.write()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 55`** (10 nodes): `TerminalOutputBuffer`, `.append()`, `.appendToLineBuffer()`, `.clear()`, `.clearAll()`, `.collapseCarriageReturn()`, `.constructor()`, `.getLines()`, `.getOrCreate()`, `.tail()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 58`** (9 nodes): `KeyboardSimulator`, `.comboDown()`, `.comboUp()`, `.keyDown()`, `.keyTap()`, `.keyUp()`, `.normalizeKey()`, `.sendKeyCombo()`, `.typeString()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 59`** (9 nodes): `FakePtyManager`, `.constructor()`, `.deliverText()`, `.emitExit()`, `.getWrites()`, `.has()`, `.spawn()`, `.spawnCommand()`, `.write()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 61`** (8 nodes): `HelmSchedulerService`, `.cancelTask()`, `.constructor()`, `.createTask()`, `.deleteTask()`, `.getTask()`, `.listTasks()`, `.updateTask()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 62`** (8 nodes): `cron-engine.test.ts`, `cron-engine.ts`, `CronEngine`, `.isValid()`, `.nextRunTime()`, `.nextRunTimeBeforeDate()`, `.validate()`, `expectLocalDateTime()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 64`** (6 nodes): `clampHeight()`, `focus()`, `onResizeMove()`, `startResize()`, `stopResize()`, `PromptTextarea.vue`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 66`** (6 nodes): `MockResizeObserver`, `.constructor()`, `.disconnect()`, `.observe()`, `.unobserve()`, `bindings-pty.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 67`** (6 nodes): `MockResizeObserver`, `.constructor()`, `.disconnect()`, `.observe()`, `.unobserve()`, `bindings-target.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 74`** (4 nodes): `SchedulerSection.vue`, `nextRunMs()`, `timeRemaining()`, `scheduler-section.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 75`** (4 nodes): `pty-filter.ts`, `applyPtyFilters()`, `stripAltScreen()`, `pty-filter.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 76`** (4 nodes): `readYaml()`, `setupTestFiles()`, `mcp-config.test.ts`, `writeYaml()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 100`** (2 nodes): `Electron MIT License`, `Chromium Third Party Credits`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 101`** (2 nodes): `Empty Drafts Config`, `Empty Sessions Config`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 102`** (2 nodes): `Haptic Feedback Setting`, `Notifications Setting`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 133`** (1 nodes): `Navigation State Ownership Fix`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 134`** (1 nodes): `Modal Guard Regression Fixes`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 135`** (1 nodes): `File Structure Module Map`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 136`** (1 nodes): `SessionSummary Interface`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 137`** (1 nodes): `getPreloadApiDomain (domain resolver)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 138`** (1 nodes): `SkillManager test suite`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Legacy Helm Envelope Reference` and `Helm JSON Envelope`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **Why does `HelmControlService` connect `Community 6` to `Community 1`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Why does `PlanManager` connect `Community 5` to `Community 1`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Why does `TerminalView` connect `Community 18` to `Community 2`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **What connects `Run shell command, printing output in real-time.`, `Patch node-pty .gyp files to disable Spectre mitigation requirement.      VS 2`, `Bump version in package.json and return (old_version, new_version).` to the rest of the system?**
  _85 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._