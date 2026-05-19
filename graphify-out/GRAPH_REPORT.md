# Graph Report - gamepad-cli-hub  (2026-05-20)

## Corpus Check
- 433 files · ~3,164,847 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3539 nodes · 7255 edges · 89 communities detected
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 324 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 83|Community 83]]
- [[_COMMUNITY_Community 84|Community 84]]
- [[_COMMUNITY_Community 88|Community 88]]
- [[_COMMUNITY_Community 89|Community 89]]
- [[_COMMUNITY_Community 90|Community 90]]
- [[_COMMUNITY_Community 109|Community 109]]
- [[_COMMUNITY_Community 110|Community 110]]
- [[_COMMUNITY_Community 111|Community 111]]
- [[_COMMUNITY_Community 143|Community 143]]
- [[_COMMUNITY_Community 144|Community 144]]
- [[_COMMUNITY_Community 145|Community 145]]
- [[_COMMUNITY_Community 146|Community 146]]
- [[_COMMUNITY_Community 147|Community 147]]
- [[_COMMUNITY_Community 148|Community 148]]

## God Nodes (most connected - your core abstractions)
1. `HelmControlService` - 98 edges
2. `get()` - 91 edges
3. `callMcpTool()` - 79 edges
4. `ConfigLoader` - 78 edges
5. `callTool()` - 77 edges
6. `ensureLoaded()` - 55 edges
7. `PlanManager` - 54 edges
8. `set()` - 47 edges
9. `delete()` - 45 edges
10. `TerminalManager` - 35 edges

## Surprising Connections (you probably didn't know these)
- `registerIPCHandlers()` --calls--> `setupSystemHandlers()`  [INFERRED]
  src\electron\ipc\handlers.ts → src\electron\ipc\system-handlers.ts
- `Gamepad Control` --semantically_similar_to--> `Browser Gamepad API`  [INFERRED] [semantically similar]
  README.md → CLAUDE.md
- `Directory Planning` --semantically_similar_to--> `Directory Plans NCN`  [INFERRED] [semantically similar]
  README.md → CLAUDE.md
- `Plan Backups` --semantically_similar_to--> `Plan Backup and Restore`  [INFERRED] [semantically similar]
  README.md → CLAUDE.md
- `Plan Integration Patterns` --references--> `getToolReminder Post-Call Hints`  [INFERRED]
  docs/helm-session-info.md → src/mcp/localhost-mcp-server.ts

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
Nodes (712): absoluteStoragePath(), actionToPtyData(), activateSkill(), add(), addDependency(), addDirectory(), addPlanAttachment(), addProjectDir() (+704 more)

### Community 1 - "Community 1"
Cohesion: 0.01
Nodes (217): createSortControl(), createRouter(), createController(), autoResumeSessions(), bootstrap(), clamp(), cleanupRendererSession(), doCloseSession() (+209 more)

### Community 2 - "Community 2"
Cohesion: 0.01
Nodes (125): resolveEnvWithMode(), TelegramConfigManager, buildAgentPlanGuide(), buildAiagentStateGuide(), getAiagentStates(), buildNotificationGuide(), getAvailableDirectories(), getAvailableProjects() (+117 more)

### Community 3 - "Community 3"
Cohesion: 0.03
Nodes (118): hidePlanDeleteConfirm(), showPlanDeleteConfirm(), ensureOverlay(), hidePlanHelpModal(), isPlanHelpVisible(), showPlanHelpModal(), applySequenceBandLayout(), assignCoordinates() (+110 more)

### Community 4 - "Community 4"
Cohesion: 0.03
Nodes (6): appendSkillFeedbackFooter(), decodeBase64Content(), HelmControlService, parseSubmitSuffix(), requireResult(), validateMobileFriendlyTelegramText()

### Community 5 - "Community 5"
Cohesion: 0.05
Nodes (7): buildLegacySpawnCommand(), ConfigLoader, isCliTypeOptions(), normalizeMcpPort(), normalizeToolConfig(), parseCliArgs(), parseCommandTemplate()

### Community 6 - "Community 6"
Cohesion: 0.05
Nodes (49): editOriginalMessage(), formatTopicCleanupPreview(), formatTopicCleanupResult(), handleAccept(), handleCancel(), handleCloseAll(), handleCloseSession(), handleContinue() (+41 more)

### Community 7 - "Community 7"
Cohesion: 0.04
Nodes (31): handleButton(), onSave(), handleButton(), handleButton(), actionForIndex(), clampIndex(), close(), handleButton() (+23 more)

### Community 8 - "Community 8"
Cohesion: 0.07
Nodes (13): cleanupOrphanDependencies(), encodeFilename(), listPlanFiles(), loadDependencies(), loadPlanFile(), loadPlanSequences(), saveDependencies(), savePlanFile() (+5 more)

### Community 9 - "Community 9"
Cohesion: 0.05
Nodes (25): clearStartupFallbackTimer(), closeSplashWindow(), createSplashWindow(), createWindow(), maybeShowMainWindow(), readWindowBounds(), resolveSplashLogoUrl(), buildSplashHtml() (+17 more)

### Community 10 - "Community 10"
Cohesion: 0.06
Nodes (54): addBookmarkedDir(), addCliType(), addPattern(), addWorkingDirectory(), clearSnapOutWindowPrefs(), copyCliBindings(), ensureLoaded(), getActivityTimeout() (+46 more)

### Community 11 - "Community 11"
Cohesion: 0.07
Nodes (17): asAiagentState(), asContextBindingTargetType(), asPlanStatus(), asPlanTypeOrNull(), asRecord(), asString(), asTerminalOutputMode(), getToolReminder() (+9 more)

### Community 12 - "Community 12"
Cohesion: 0.05
Nodes (14): loadDrafts(), sanitizeDrafts(), isAnyString(), cleanupOrphanDependencies(), decodeFilename(), deletePlanFile(), encodeFilename(), isDirectoryPlan() (+6 more)

### Community 13 - "Community 13"
Cohesion: 0.05
Nodes (12): clampHeight(), onResizeMove(), setHeight(), applyFocus(), doAutoSave(), handleButton(), onCancel(), onKeyDown() (+4 more)

### Community 14 - "Community 14"
Cohesion: 0.1
Nodes (3): SessionManager, saveSessions(), TopicManager

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
Cohesion: 0.13
Nodes (8): detectMimeType(), escapeHtml(), extractAttachmentInfo(), formatMessageForTelegram(), isAudioAttachment(), oneLine(), TelegramRelayService, wrapTelegramEnvelope()

### Community 24 - "Community 24"
Cohesion: 0.17
Nodes (8): assertNoDuplicateType(), dedupSummaries(), normalizeOptional(), normalizeOptionalType(), normalizePersistedSkill(), normalizeRequired(), normalizeScope(), SkillManager

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
Cohesion: 0.19
Nodes (1): HelmPlanService

### Community 30 - "Community 30"
Cohesion: 0.18
Nodes (2): StateDetector, stripAnsi()

### Community 31 - "Community 31"
Cohesion: 0.16
Nodes (2): buildContent(), NotificationManager

### Community 32 - "Community 32"
Cohesion: 0.14
Nodes (1): WindowManager

### Community 33 - "Community 33"
Cohesion: 0.13
Nodes (2): FakeSkillAnalyticsManager, FakeSkillManager

### Community 34 - "Community 34"
Cohesion: 0.16
Nodes (5): chooseCanonicalPath(), findProjectByPath(), mergeProjectPath(), ProjectStore, sortProjectPaths()

### Community 35 - "Community 35"
Cohesion: 0.14
Nodes (17): Localhost MCP Server, Directory Plan Controls, Directory Plans NCN, Plan Lifecycle, PlanManager, Sugiyama Plan Layout, Legacy Helm Envelope Reference, Helm JSON Envelope (+9 more)

### Community 36 - "Community 36"
Cohesion: 0.2
Nodes (15): _cleanup(), _command_wrapper_name(), dependencies_ready(), _install_signal_handlers(), main(), print_header(), print_step(), Print a formatted header (+7 more)

### Community 37 - "Community 37"
Cohesion: 0.17
Nodes (1): HelmContextService

### Community 38 - "Community 38"
Cohesion: 0.24
Nodes (2): HelmSessionService, requireResult()

### Community 39 - "Community 39"
Cohesion: 0.19
Nodes (2): escapeShellArg(), PtyManager

### Community 40 - "Community 40"
Cohesion: 0.26
Nodes (10): findFreePort(), OpenWhisprTranscriber, replaceExtension(), requestTranscription(), resolveFfmpegPath(), resolveModelPath(), resolveWhisperServerPath(), runProcess() (+2 more)

### Community 41 - "Community 41"
Cohesion: 0.15
Nodes (14): Binding Action Types, Pattern Rules, Sequence Parser Syntax, Navigation Priority Chain, Group Overview Mode, PTY Output Preview Grid, StateDetector Module, TerminalManager Module (+6 more)

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
Cohesion: 0.27
Nodes (11): extract_test_results(), format_markdown_output(), main(), Run tests based on mode., Run ESLint if available., Run a command and return result info., Extract test results from output., Format results as markdown. (+3 more)

### Community 46 - "Community 46"
Cohesion: 0.26
Nodes (7): commitPort(), commitToken(), normalizePort(), onPortBlur(), onPortChange(), onTokenBlur(), onTokenInput()

### Community 47 - "Community 47"
Cohesion: 0.24
Nodes (1): HelmPlanSequenceService

### Community 48 - "Community 48"
Cohesion: 0.3
Nodes (1): DraftManager

### Community 49 - "Community 49"
Cohesion: 0.42
Nodes (3): ensureEntry(), SkillAnalyticsManager, toStats()

### Community 50 - "Community 50"
Cohesion: 0.18
Nodes (2): flush(), loadAndFlush()

### Community 51 - "Community 51"
Cohesion: 0.2
Nodes (1): PipelineQueue

### Community 52 - "Community 52"
Cohesion: 0.2
Nodes (2): isDynamicImportFailure(), reloadAfterDynamicImportFailure()

### Community 53 - "Community 53"
Cohesion: 0.36
Nodes (1): ProfileManager

### Community 54 - "Community 54"
Cohesion: 0.31
Nodes (1): SettingsManager

### Community 55 - "Community 55"
Cohesion: 0.2
Nodes (3): FakeCapabilityDetector, FakeConfigLoader, FakeSessionManager

### Community 56 - "Community 56"
Cohesion: 0.31
Nodes (1): TerminalOutputBuffer

### Community 57 - "Community 57"
Cohesion: 0.22
Nodes (10): MainWindowApp.vue (app shell), SettingsSkillDraft interface, SettingsSkillSummary interface (useSettingsController), SkillSummary interface (SettingsTab), SkillsTab.vue (settings skills panel), configClient (IPC client), skillsClient (IPC client), telegramClient (IPC client) (+2 more)

### Community 58 - "Community 58"
Cohesion: 0.28
Nodes (1): FakePtyManager

### Community 59 - "Community 59"
Cohesion: 0.39
Nodes (1): KeyboardSimulator

### Community 63 - "Community 63"
Cohesion: 0.39
Nodes (5): addEditorHistoryEntry(), getScopedEntries(), loadEditorHistory(), safeParseHistory(), saveEditorHistory()

### Community 64 - "Community 64"
Cohesion: 0.39
Nodes (2): decodeBase64Content(), HelmPlanAttachmentService

### Community 65 - "Community 65"
Cohesion: 0.25
Nodes (1): HelmSchedulerService

### Community 66 - "Community 66"
Cohesion: 0.29
Nodes (1): CronEngine

### Community 67 - "Community 67"
Cohesion: 0.25
Nodes (1): MockResizeObserver

### Community 68 - "Community 68"
Cohesion: 0.29
Nodes (1): FakeSessionManager

### Community 70 - "Community 70"
Cohesion: 0.33
Nodes (1): HelmProjectService

### Community 71 - "Community 71"
Cohesion: 0.33
Nodes (1): MockResizeObserver

### Community 72 - "Community 72"
Cohesion: 0.33
Nodes (1): MockResizeObserver

### Community 73 - "Community 73"
Cohesion: 0.47
Nodes (4): makeButton(), makeGamepad(), startAndTick(), tick()

### Community 77 - "Community 77"
Cohesion: 0.4
Nodes (1): FakeConfigLoader

### Community 78 - "Community 78"
Cohesion: 0.5
Nodes (1): CapabilityDetector

### Community 80 - "Community 80"
Cohesion: 0.4
Nodes (5): GitHub App Update Provider, Deploy Config Stripping, Two Step Release Workflow, Self Contained Profile Model, ConfigLoader Module

### Community 81 - "Community 81"
Cohesion: 0.4
Nodes (5): Renderer Content Security Policy, Helm Renderer Entrypoint, vue-main.ts Module, Vue App Mount Point, xterm Stylesheet

### Community 82 - "Community 82"
Cohesion: 0.5
Nodes (5): HelmControlService (MCP control service), LocalhostMcpServer (MCP HTTP server), HelmControlService test suite, LocalhostMcpServer test suite, getAvailableTools (session info guide)

### Community 83 - "Community 83"
Cohesion: 0.67
Nodes (2): nextRunMs(), timeRemaining()

### Community 84 - "Community 84"
Cohesion: 0.67
Nodes (2): applyPtyFilters(), stripAltScreen()

### Community 88 - "Community 88"
Cohesion: 0.5
Nodes (4): Default Profile, Profile Bindings Config, Profile Tools Config, Default Profile Reference

### Community 89 - "Community 89"
Cohesion: 0.67
Nodes (4): Green Wave Accent, Helm Paper Boat Icon, Paper Boat Symbol, Terminal Prompt Mark

### Community 90 - "Community 90"
Cohesion: 0.67
Nodes (4): PRELOAD_API_DOMAINS (domain method registry), createPreloadDomains (domain builder), PRELOAD_METHOD_IMPLEMENTATIONS (preload bridge), setupSkillHandlers (IPC handler registration)

### Community 109 - "Community 109"
Cohesion: 1.0
Nodes (2): Electron MIT License, Chromium Third Party Credits

### Community 110 - "Community 110"
Cohesion: 1.0
Nodes (2): Empty Drafts Config, Empty Sessions Config

### Community 111 - "Community 111"
Cohesion: 1.0
Nodes (2): Haptic Feedback Setting, Notifications Setting

### Community 143 - "Community 143"
Cohesion: 1.0
Nodes (1): Navigation State Ownership Fix

### Community 144 - "Community 144"
Cohesion: 1.0
Nodes (1): Modal Guard Regression Fixes

### Community 145 - "Community 145"
Cohesion: 1.0
Nodes (1): File Structure Module Map

### Community 146 - "Community 146"
Cohesion: 1.0
Nodes (1): SessionSummary Interface

### Community 147 - "Community 147"
Cohesion: 1.0
Nodes (1): getPreloadApiDomain (domain resolver)

### Community 148 - "Community 148"
Cohesion: 1.0
Nodes (1): SkillManager test suite

## Ambiguous Edges - Review These
- `Legacy Helm Envelope Reference` → `Helm JSON Envelope`  [AMBIGUOUS]
  docs/helm-envelope-reference.md · relation: semantically_similar_to

## Knowledge Gaps
- **85 isolated node(s):** `Run shell command, printing output in real-time.`, `Patch node-pty .gyp files to disable Spectre mitigation requirement.      VS 2`, `Bump version in package.json and return (old_version, new_version).`, `Create stripped config files in config-deploy/ for packaging.      Original co`, `Remove the config-deploy/ staging directory.` (+80 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 15`** (35 nodes): `TerminalManager`, `.adoptTerminal()`, `.constructor()`, `.createTerminal()`, `.deselect()`, `.destroyTerminal()`, `.detachTerminal()`, `.dispose()`, `.ensureTerminal()`, `.fitActive()`, `.fitAll()`, `.focusActive()`, `.getActiveSessionId()`, `.getActiveView()`, `.getCount()`, `.getManagedSessions()`, `.getOutputBuffer()`, `.getSession()`, `.getSessionIds()`, `.getTerminalLines()`, `.getTitle()`, `.has()`, `.hasTerminal()`, `.hydrateFromStore()`, `.hydrateSessions()`, `.removeManagedSession()`, `.renameSession()`, `.setOnEmpty()`, `.setOnSwitch()`, `.setOnTitleChange()`, `.setupIpcListeners()`, `.setupResizeObserver()`, `.switchTo()`, `.upsertManagedSession()`, `.writeToTerminal()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 19`** (29 nodes): `TelegramBotCore`, `.answerCallback()`, `.closeForumTopic()`, `.createForumTopic()`, `.deleteForumTopic()`, `.downloadFile()`, `.editForumTopic()`, `.editMessageDebounced()`, `.flushEdit()`, `.getBot()`, `.getChatId()`, `.handleCallbackQuery()`, `.handleMessage()`, `.handleMessageReaction()`, `.isAuthorized()`, `.isPathInsideDirectory()`, `.isRateLimited()`, `.isRunning()`, `.reopenForumTopic()`, `.resolveDownloadFileName()`, `.sanitizeFileName()`, `.sendDocument()`, `.sendMessage()`, `.sendPhoto()`, `.sendToTopic()`, `.sendVideo()`, `.start()`, `.stop()`, `.withTimeout()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (27 nodes): `BrowserGamepadPoller`, `.checkDpad()`, `.checkDpadAxes()`, `.checkDpadButtons()`, `.checkRepeats()`, `.checkStickVirtualButtons()`, `.constructor()`, `.decodeHatAxis()`, `.emitConnectionEvent()`, `.emitDpadDirection()`, `.findDualAxisPair()`, `.findHatAxisIndex()`, `.getCount()`, `.getRepeatConfig()`, `.handleButtonPress()`, `.handleButtonRelease()`, `.logAxesDiagnostic()`, `.logGamepadState()`, `.onButton()`, `.onRelease()`, `.poll()`, `.processGamepad()`, `.requestGamepadAccess()`, `.setRepeatConfig()`, `.setupEvents()`, `.start()`, `.stop()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (22 nodes): `BindingsTab.vue`, `ChipbarActionsTab.vue`, `PlansGrid.vue`, `SessionCard.vue`, `SessionGroup.vue`, `SessionList.vue`, `SettingsPanel.vue`, `SortBar.vue`, `SpawnGrid.vue`, `StatusStrip.vue`, `TelegramTab.vue`, `ToolsTab.vue`, `colClass()`, `onCardClick()`, `onRenameKeydown()`, `selectState()`, `handleButton()`, `navigateTab()`, `makeCardProps()`, `makeGroupProps()`, `makeSessionListProps()`, `sidebar.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (22 nodes): `PlanBackupManager`, `.constructor()`, `.createSnapshot()`, `.deleteAllSnapshots()`, `.deleteSnapshot()`, `.getBackupDirForPath()`, `.getBackupSummary()`, `.getConfig()`, `.getDefaultConfig()`, `.getNewestSnapshot()`, `.getNextIndexForTimestamp()`, `.getOldestSnapshot()`, `.listSnapshots()`, `.loadConfig()`, `.pruneOldSnapshots()`, `.resolveBackupsRootDir()`, `.restoreFromSnapshot()`, `.saveConfig()`, `.updateConfig()`, `.validateConfig()`, `.validateSnapshot()`, `toFsSafeTimestamp()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (18 nodes): `HelmPlanService`, `.completePlan()`, `.constructor()`, `.createPlan()`, `.deletePlan()`, `.exportDirectory()`, `.exportItem()`, `.getPlan()`, `.getPlanIdMapping()`, `.linkPlans()`, `.listPlans()`, `.plansSummary()`, `.reopenPlan()`, `.requireWorkingDirectory()`, `.resolvePlanRef()`, `.setPlanState()`, `.unlinkPlans()`, `.updatePlan()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (18 nodes): `StateDetector`, `.clearActivityTimers()`, `.constructor()`, `.dispose()`, `.getLastOutputTime()`, `.getOrCreate()`, `.getState()`, `.hasQuestion()`, `.markActive()`, `.markResizing()`, `.markRestored()`, `.markScrolling()`, `.markSwitching()`, `.processOutput()`, `.promoteIfRecentOutput()`, `.removeSession()`, `.resetActivityTimers()`, `stripAnsi()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (18 nodes): `buildContent()`, `NotificationManager`, `.constructor()`, `.dispatchLlmInAppNotification()`, `.dispose()`, `.feedOutput()`, `.getAppVisibility()`, `.getAppVisibilityDetails()`, `.getLastLines()`, `.handleActivityChange()`, `.maybeNotify()`, `.notifyLlmDirected()`, `.removeSession()`, `.setActiveSessionIdGetter()`, `.setScreenLockChecker()`, `.setTelegramNotifier()`, `.shouldNotify()`, `.showNotification()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 32`** (17 nodes): `WindowManager`, `.assignSessionToWindow()`, `.closeAllChildWindows()`, `.focusWindowForSession()`, `.getAllWindows()`, `.getChildWindowIds()`, `.getMainWindow()`, `.getSessionsInWindow()`, `.getSnappedOutSessions()`, `.getWindow()`, `.getWindowForSession()`, `.getWindowIdForSession()`, `.isSessionSnappedOut()`, `.registerWindow()`, `.setMainWindow()`, `.unassignSession()`, `.unregisterWindow()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (17 nodes): `FakeSkillAnalyticsManager`, `.addReview()`, `.clearReviews()`, `.getStats()`, `.incrementUseCount()`, `.resetAllCounts()`, `.resetUseCount()`, `FakeSkillManager`, `.constructor()`, `.create()`, `.delete()`, `.get()`, `.list()`, `.listForProject()`, `.registerSystemSkill()`, `.resolveEffective()`, `.update()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (16 nodes): `HelmContextService`, `.appendContext()`, `.bindContext()`, `.constructor()`, `.createContext()`, `.deleteContext()`, `.getContext()`, `.getProjectIdForDirectory()`, `.listContexts()`, `.listPlanContexts()`, `.requireProject()`, `.requireWorkingDirectory()`, `.resolvePlanRef()`, `.setContextPosition()`, `.unbindContext()`, `.updateContext()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (14 nodes): `HelmSessionService`, `.closeSession()`, `.constructor()`, `.findSession()`, `.getSession()`, `.listSessions()`, `.readSessionTerminal()`, `.requireCliEntry()`, `.requireWorkingDirectory()`, `.setAiagentState()`, `.setSessionWorkingPlan()`, `.spawnCli()`, `.toSessionSummary()`, `requireResult()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (14 nodes): `escapeShellArg()`, `PtyManager`, `.constructor()`, `.deliverText()`, `.getPid()`, `.getSessionIds()`, `.getTerminalTail()`, `.has()`, `.kill()`, `.killAll()`, `.resize()`, `.setTextDeliveryHandler()`, `.spawn()`, `.write()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (13 nodes): `HelmTelegramService`, `.closeTelegramChannel()`, `.constructor()`, `.findSession()`, `.getAppVisibility()`, `.getTelegramStatus()`, `.notifyUser()`, `.requireTelegramAvailable()`, `.requireTelegramBridge()`, `.sendTelegramChat()`, `.setNotificationManager()`, `.setTelegramBridge()`, `validateMobileFriendlyTelegramText()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (13 nodes): `createContainer()`, `lastFitAddon()`, `lastSearchAddon()`, `lastTerminal()`, `makeMockFitAddon()`, `makeMockSearchAddon()`, `makeMockTerminal()`, `MockResizeObserver`, `.constructor()`, `.disconnect()`, `.observe()`, `.unobserve()`, `terminal-manager.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (12 nodes): `HelmPlanSequenceService`, `.appendPlanSequenceMemory()`, `.assertSequenceMutex()`, `.assignPlanSequence()`, `.constructor()`, `.createPlanSequence()`, `.deletePlanSequence()`, `.getPlanSequence()`, `.listPlanSequences()`, `.requireWorkingDirectory()`, `.resolvePlanRef()`, `.updatePlanSequence()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (12 nodes): `DraftManager`, `.clearSession()`, `.constructor()`, `.count()`, `.create()`, `.delete()`, `.exportAll()`, `.get()`, `.getForSession()`, `.importAll()`, `.markChanged()`, `.update()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (12 nodes): `buildSidebarDom()`, `createMockTerminalManager()`, `enterRenameMode()`, `flush()`, `getSessions()`, `getSessionsState()`, `getState()`, `loadAndFlush()`, `makeSessions()`, `pressKey()`, `setMockTerminalSessions()`, `sessions-screen.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 51`** (11 nodes): `PipelineQueue`, `.clear()`, `.dequeue()`, `.enqueue()`, `.getAll()`, `.getPosition()`, `.has()`, `.length()`, `.peek()`, `.pop()`, `.triggerHandoff()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (11 nodes): `catch()`, `handlePlanScreenDpad()`, `if()`, `mapSession()`, `onTerminalEmpty()`, `onTerminalSwitch()`, `onTerminalTitleChange()`, `App.vue`, `isDynamicImportFailure()`, `reloadAfterDynamicImportFailure()`, `vue-main.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (10 nodes): `ProfileManager`, `.constructor()`, `.loadActiveProfile()`, `.migrateGlobalFiles()`, `.migrateProfile()`, `.profilePath()`, `.readYaml()`, `.reloadIfChanged()`, `.save()`, `.saveRaw()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (10 nodes): `SettingsManager`, `.constructor()`, `.flush()`, `.load()`, `.normalize()`, `.readYaml()`, `.save()`, `.saveNow()`, `.settingsPath()`, `.write()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 56`** (10 nodes): `TerminalOutputBuffer`, `.append()`, `.appendToLineBuffer()`, `.clear()`, `.clearAll()`, `.collapseCarriageReturn()`, `.constructor()`, `.getLines()`, `.getOrCreate()`, `.tail()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 58`** (9 nodes): `FakePtyManager`, `.constructor()`, `.deliverText()`, `.emitExit()`, `.getWrites()`, `.has()`, `.spawn()`, `.spawnCommand()`, `.write()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 59`** (9 nodes): `KeyboardSimulator`, `.comboDown()`, `.comboUp()`, `.keyDown()`, `.keyTap()`, `.keyUp()`, `.normalizeKey()`, `.sendKeyCombo()`, `.typeString()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 64`** (8 nodes): `decodeBase64Content()`, `HelmPlanAttachmentService`, `.addPlanAttachment()`, `.constructor()`, `.deletePlanAttachment()`, `.getPlanAttachment()`, `.listPlanAttachments()`, `.resolvePlanRef()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 65`** (8 nodes): `HelmSchedulerService`, `.cancelTask()`, `.constructor()`, `.createTask()`, `.deleteTask()`, `.getTask()`, `.listTasks()`, `.updateTask()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 66`** (8 nodes): `cron-engine.test.ts`, `cron-engine.ts`, `CronEngine`, `.isValid()`, `.nextRunTime()`, `.nextRunTimeBeforeDate()`, `.validate()`, `expectLocalDateTime()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 67`** (8 nodes): `createContainer()`, `makeGamepadCli()`, `makeMockTerminal()`, `MockResizeObserver`, `.disconnect()`, `.observe()`, `.unobserve()`, `terminal-manager.ensure-terminal.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 68`** (7 nodes): `FakeSessionManager`, `.addSession()`, `.getActiveSession()`, `.getSession()`, `.removeSession()`, `.setActiveSession()`, `.spawn()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 70`** (6 nodes): `HelmProjectService`, `.addProjectDir()`, `.constructor()`, `.listProjectDirs()`, `.listProjects()`, `.removeProjectDir()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 71`** (6 nodes): `MockResizeObserver`, `.constructor()`, `.disconnect()`, `.observe()`, `.unobserve()`, `bindings-pty.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 72`** (6 nodes): `MockResizeObserver`, `.constructor()`, `.disconnect()`, `.observe()`, `.unobserve()`, `bindings-target.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 77`** (5 nodes): `FakeConfigLoader`, `.constructor()`, `.getTelegramConfig()`, `.setTelegramConfig()`, `capability-detector.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 78`** (5 nodes): `CapabilityDetector`, `.constructor()`, `.getCapabilities()`, `.invalidateCache()`, `.verifyToolPath()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 83`** (4 nodes): `SchedulerSection.vue`, `nextRunMs()`, `timeRemaining()`, `scheduler-section.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 84`** (4 nodes): `pty-filter.ts`, `applyPtyFilters()`, `stripAltScreen()`, `pty-filter.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 109`** (2 nodes): `Electron MIT License`, `Chromium Third Party Credits`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 110`** (2 nodes): `Empty Drafts Config`, `Empty Sessions Config`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 111`** (2 nodes): `Haptic Feedback Setting`, `Notifications Setting`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 143`** (1 nodes): `Navigation State Ownership Fix`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 144`** (1 nodes): `Modal Guard Regression Fixes`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 145`** (1 nodes): `File Structure Module Map`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 146`** (1 nodes): `SessionSummary Interface`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 147`** (1 nodes): `getPreloadApiDomain (domain resolver)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 148`** (1 nodes): `SkillManager test suite`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Legacy Helm Envelope Reference` and `Helm JSON Envelope`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **Why does `HelmControlService` connect `Community 4` to `Community 2`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **Why does `TerminalManager` connect `Community 15` to `Community 1`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Why does `SessionManager` connect `Community 14` to `Community 2`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **What connects `Run shell command, printing output in real-time.`, `Patch node-pty .gyp files to disable Spectre mitigation requirement.      VS 2`, `Bump version in package.json and return (old_version, new_version).` to the rest of the system?**
  _85 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._