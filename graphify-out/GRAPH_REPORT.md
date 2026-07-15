# Graph Report - gamepad-cli-hub  (2026-07-16)

## Corpus Check
- 498 files · ~3,219,920 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 4105 nodes · 8482 edges · 106 communities detected
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 350 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 83|Community 83]]
- [[_COMMUNITY_Community 84|Community 84]]
- [[_COMMUNITY_Community 85|Community 85]]
- [[_COMMUNITY_Community 86|Community 86]]
- [[_COMMUNITY_Community 90|Community 90]]
- [[_COMMUNITY_Community 91|Community 91]]
- [[_COMMUNITY_Community 92|Community 92]]
- [[_COMMUNITY_Community 93|Community 93]]
- [[_COMMUNITY_Community 95|Community 95]]
- [[_COMMUNITY_Community 98|Community 98]]
- [[_COMMUNITY_Community 99|Community 99]]
- [[_COMMUNITY_Community 100|Community 100]]
- [[_COMMUNITY_Community 101|Community 101]]
- [[_COMMUNITY_Community 102|Community 102]]
- [[_COMMUNITY_Community 103|Community 103]]
- [[_COMMUNITY_Community 104|Community 104]]
- [[_COMMUNITY_Community 108|Community 108]]
- [[_COMMUNITY_Community 109|Community 109]]
- [[_COMMUNITY_Community 110|Community 110]]
- [[_COMMUNITY_Community 111|Community 111]]
- [[_COMMUNITY_Community 133|Community 133]]
- [[_COMMUNITY_Community 134|Community 134]]
- [[_COMMUNITY_Community 135|Community 135]]
- [[_COMMUNITY_Community 175|Community 175]]
- [[_COMMUNITY_Community 176|Community 176]]
- [[_COMMUNITY_Community 177|Community 177]]
- [[_COMMUNITY_Community 178|Community 178]]
- [[_COMMUNITY_Community 179|Community 179]]
- [[_COMMUNITY_Community 180|Community 180]]

## God Nodes (most connected - your core abstractions)
1. `get()` - 122 edges
2. `HelmControlService` - 108 edges
3. `callMcpTool()` - 91 edges
4. `ConfigLoader` - 82 edges
5. `callTool()` - 77 edges
6. `set()` - 70 edges
7. `ensureLoaded()` - 58 edges
8. `PlanManager` - 55 edges
9. `delete()` - 53 edges
10. `has()` - 42 edges

## Surprising Connections (you probably didn't know these)
- `executeCliBinding()` --calls--> `usePromptApplyFlow()`  [INFERRED]
  renderer\bindings.ts → renderer\composables\usePromptApplyFlow.ts
- `executeCliBinding()` --calls--> `showContextMenu()`  [INFERRED]
  renderer\bindings.ts → renderer\modals\context-menu.ts
- `executeCliBinding()` --calls--> `showDraftEditor()`  [INFERRED]
  renderer\bindings.ts → renderer\drafts\draft-editor.ts
- `setupKeyboardRelay()` --calls--> `bootstrap()`  [INFERRED]
  renderer\paste-handler.ts → renderer\composables\useAppBootstrap.ts
- `Gamepad Control` --semantically_similar_to--> `Browser Gamepad API`  [INFERRED] [semantically similar]
  README.md → CLAUDE.md

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
Nodes (884): absoluteStoragePath(), actionToPtyData(), activateSkill(), add(), addBookmarkedDir(), addCliType(), addDependency(), addDirectory() (+876 more)

### Community 1 - "Community 1"
Cohesion: 0.01
Nodes (131): buildLegacySpawnCommand(), normalizeToolConfig(), parseCliArgs(), parseCommandTemplate(), resolveEnvWithMode(), TelegramConfigManager, clearStartupFallbackTimer(), closeSplashWindow() (+123 more)

### Community 2 - "Community 2"
Cohesion: 0.01
Nodes (172): createSortControl(), createController(), autoResumeSessions(), bootstrap(), clamp(), cleanupRendererSession(), doCloseSession(), doSpawn() (+164 more)

### Community 3 - "Community 3"
Cohesion: 0.02
Nodes (145): usePromptApplyFlow(), handleDraftEditorButton(), isDraftEditorVisible(), showDraftEditor(), hideEditorPopup(), handleCloseConfirmButton(), hideCloseConfirm(), handleDraftActionButton() (+137 more)

### Community 4 - "Community 4"
Cohesion: 0.02
Nodes (59): createRouter(), useEscProtection(), isEditableElementInsideModal(), useInputRouter(), isEditableElementInsideModal(), useModalKeyboardBridge(), useModalStack(), useNavigation() (+51 more)

### Community 5 - "Community 5"
Cohesion: 0.03
Nodes (6): appendSkillFeedbackFooter(), decodeBase64Content(), HelmControlService, parseSubmitSuffix(), requireResult(), validateMobileFriendlyTelegramText()

### Community 6 - "Community 6"
Cohesion: 0.03
Nodes (13): cb(), requireChanges(), requireNonEmptyString(), requireOptionalParentId(), requireString(), factory(), makeTree(), PromptTemplateManager (+5 more)

### Community 7 - "Community 7"
Cohesion: 0.05
Nodes (7): buildLegacySpawnCommand(), ConfigLoader, isCliTypeOptions(), normalizeMcpPort(), normalizeToolConfig(), parseCliArgs(), parseCommandTemplate()

### Community 8 - "Community 8"
Cohesion: 0.05
Nodes (51): doSpawnSession(), editOriginalMessage(), formatTopicCleanupPreview(), formatTopicCleanupResult(), handleAccept(), handleCancel(), handleCloseAll(), handleCloseSession() (+43 more)

### Community 9 - "Community 9"
Cohesion: 0.04
Nodes (31): handleButton(), onSave(), handleButton(), handleButton(), actionForIndex(), clampIndex(), close(), handleButton() (+23 more)

### Community 10 - "Community 10"
Cohesion: 0.07
Nodes (13): cleanupOrphanDependencies(), encodeFilename(), listPlanFiles(), loadDependencies(), loadPlanFile(), loadPlanSequences(), saveDependencies(), savePlanFile() (+5 more)

### Community 11 - "Community 11"
Cohesion: 0.05
Nodes (19): asAiagentState(), asContextBindingTargetType(), asPlanStatus(), asPlanTypeOrNull(), asRecord(), asString(), asTerminalOutputMode(), delay() (+11 more)

### Community 12 - "Community 12"
Cohesion: 0.04
Nodes (14): clampHeight(), focus(), focusEnd(), onResizeMove(), setHeight(), applyFocus(), doAutoSave(), handleButton() (+6 more)

### Community 13 - "Community 13"
Cohesion: 0.09
Nodes (3): SessionManager, saveSessions(), TopicManager

### Community 14 - "Community 14"
Cohesion: 0.09
Nodes (1): TerminalManager

### Community 15 - "Community 15"
Cohesion: 0.11
Nodes (5): ContextManager, loadPlanContextBindings(), loadPlanContexts(), savePlanContextBindings(), savePlanContexts()

### Community 16 - "Community 16"
Cohesion: 0.12
Nodes (20): bump_version(), check_git_clean(), cleanup_deploy_configs(), create_deploy_configs(), main(), patch_native_modules(), Remove the config-deploy/ staging directory., Remove the config-deploy/ staging directory. (+12 more)

### Community 17 - "Community 17"
Cohesion: 0.12
Nodes (1): TelegramBotCore

### Community 18 - "Community 18"
Cohesion: 0.12
Nodes (9): detectMimeType(), escapeHtml(), extractAttachmentInfo(), formatMessageForTelegram(), isAudioAttachment(), oneLine(), reactionForStatus(), TelegramRelayService (+1 more)

### Community 19 - "Community 19"
Cohesion: 0.09
Nodes (29): getAvailableTools Function, MCP_TOOLS Registry, Required Plan Description Sections, McpToolDispatcherDeps Interface, callMcpTool Dispatcher, AIAGENT State Registry, Session-Scoped vs Global Auth, session_info MCP Tool Documentation (+21 more)

### Community 20 - "Community 20"
Cohesion: 0.07
Nodes (2): handleButton(), navigateTab()

### Community 21 - "Community 21"
Cohesion: 0.14
Nodes (1): BrowserGamepadPoller

### Community 22 - "Community 22"
Cohesion: 0.08
Nodes (27): Plan Attachments and Sequence Memory MCP Guidance, Configurable Submit Suffix, Telegram Rewrite, Activity Dots, Browser Gamepad API, Directory Plans NCN, IPC Bridge Pattern, Plan Backup and Restore (+19 more)

### Community 23 - "Community 23"
Cohesion: 0.18
Nodes (5): loadScheduledTasks(), saveScheduledTasks(), parseSubmitSuffix(), ScheduledTaskManager, splitCliParams()

### Community 24 - "Community 24"
Cohesion: 0.16
Nodes (9): assertNoDuplicateType(), dedupSummaries(), normalizeOptional(), normalizeOptionalType(), normalizePersistedSkill(), normalizeRequired(), normalizeScope(), SkillManager (+1 more)

### Community 25 - "Community 25"
Cohesion: 0.19
Nodes (2): PlanBackupManager, toFsSafeTimestamp()

### Community 26 - "Community 26"
Cohesion: 0.14
Nodes (2): buildContent(), NotificationManager

### Community 27 - "Community 27"
Cohesion: 0.15
Nodes (8): applySequenceBandLayout(), assignCoordinates(), assignLayers(), computeLayout(), groupByLayer(), layoutGroup(), orderWithinLayers(), topologicalSort()

### Community 28 - "Community 28"
Cohesion: 0.14
Nodes (12): isAnyString(), cleanupOrphanDependencies(), decodeFilename(), deletePlanFile(), encodeFilename(), isDirectoryPlan(), isPlanItem(), loadDependencies() (+4 more)

### Community 29 - "Community 29"
Cohesion: 0.17
Nodes (5): chooseCanonicalPath(), findProjectByPath(), mergeProjectPath(), ProjectStore, sortProjectPaths()

### Community 30 - "Community 30"
Cohesion: 0.2
Nodes (1): HelmPlanService

### Community 31 - "Community 31"
Cohesion: 0.18
Nodes (2): StateDetector, stripAnsi()

### Community 32 - "Community 32"
Cohesion: 0.15
Nodes (9): clear(), clearAll(), clearTimer(), __resetFlashAttention(), start(), makeButton(), makeGamepad(), startAndTick() (+1 more)

### Community 33 - "Community 33"
Cohesion: 0.16
Nodes (1): InputConfigStore

### Community 34 - "Community 34"
Cohesion: 0.14
Nodes (1): WindowManager

### Community 35 - "Community 35"
Cohesion: 0.13
Nodes (2): FakeSkillAnalyticsManager, FakeSkillManager

### Community 36 - "Community 36"
Cohesion: 0.14
Nodes (17): Localhost MCP Server, Directory Plan Controls, Directory Plans NCN, Plan Lifecycle, PlanManager, Sugiyama Plan Layout, Legacy Helm Envelope Reference, Helm JSON Envelope (+9 more)

### Community 37 - "Community 37"
Cohesion: 0.2
Nodes (15): _cleanup(), _command_wrapper_name(), dependencies_ready(), _install_signal_handlers(), main(), print_header(), print_step(), Print a formatted header (+7 more)

### Community 38 - "Community 38"
Cohesion: 0.17
Nodes (1): HelmContextService

### Community 39 - "Community 39"
Cohesion: 0.21
Nodes (2): HelmSessionService, requireResult()

### Community 40 - "Community 40"
Cohesion: 0.17
Nodes (2): escapeShellArg(), PtyManager

### Community 41 - "Community 41"
Cohesion: 0.28
Nodes (3): ensureEntry(), SkillAnalyticsManager, toStats()

### Community 42 - "Community 42"
Cohesion: 0.2
Nodes (2): HelmTelegramService, validateMobileFriendlyTelegramText()

### Community 43 - "Community 43"
Cohesion: 0.26
Nodes (10): findFreePort(), OpenWhisprTranscriber, replaceExtension(), requestTranscription(), resolveFfmpegPath(), resolveModelPath(), resolveWhisperServerPath(), runProcess() (+2 more)

### Community 44 - "Community 44"
Cohesion: 0.26
Nodes (10): captureDeliverySnapshot(), classifyDelivery(), currentLastOutputAt(), deliverySnippets(), makeResult(), pollUntil(), retrySubmit(), tailToText() (+2 more)

### Community 45 - "Community 45"
Cohesion: 0.15
Nodes (14): Binding Action Types, Pattern Rules, Sequence Parser Syntax, Navigation Priority Chain, Group Overview Mode, PTY Output Preview Grid, StateDetector Module, TerminalManager Module (+6 more)

### Community 46 - "Community 46"
Cohesion: 0.23
Nodes (1): BindingStore

### Community 47 - "Community 47"
Cohesion: 0.23
Nodes (1): CliTypeStore

### Community 48 - "Community 48"
Cohesion: 0.35
Nodes (3): getDeliveryVerifyDelayMs(), HelmSessionDeliveryService, substituteActionParams()

### Community 49 - "Community 49"
Cohesion: 0.15
Nodes (1): MockResizeObserver

### Community 50 - "Community 50"
Cohesion: 0.27
Nodes (11): extract_test_results(), format_markdown_output(), main(), Run tests based on mode., Run ESLint if available., Run a command and return result info., Extract test results from output., Format results as markdown. (+3 more)

### Community 51 - "Community 51"
Cohesion: 0.26
Nodes (7): commitPort(), commitToken(), normalizePort(), onPortBlur(), onPortChange(), onTokenBlur(), onTokenInput()

### Community 52 - "Community 52"
Cohesion: 0.24
Nodes (1): HelmPlanSequenceService

### Community 53 - "Community 53"
Cohesion: 0.3
Nodes (1): DraftManager

### Community 54 - "Community 54"
Cohesion: 0.18
Nodes (2): flush(), loadAndFlush()

### Community 55 - "Community 55"
Cohesion: 0.2
Nodes (2): isDynamicImportFailure(), reloadAfterDynamicImportFailure()

### Community 56 - "Community 56"
Cohesion: 0.22
Nodes (1): IncomingPlansWatcher

### Community 57 - "Community 57"
Cohesion: 0.2
Nodes (1): PipelineQueue

### Community 58 - "Community 58"
Cohesion: 0.31
Nodes (1): SettingsManager

### Community 59 - "Community 59"
Cohesion: 0.2
Nodes (3): FakeCapabilityDetector, FakeConfigLoader, FakeSessionManager

### Community 60 - "Community 60"
Cohesion: 0.24
Nodes (2): recordRemovedSession(), RecycleBinManager

### Community 61 - "Community 61"
Cohesion: 0.24
Nodes (1): FakePtyManager

### Community 62 - "Community 62"
Cohesion: 0.31
Nodes (1): TerminalOutputBuffer

### Community 63 - "Community 63"
Cohesion: 0.36
Nodes (1): ProfileManager

### Community 64 - "Community 64"
Cohesion: 0.22
Nodes (10): MainWindowApp.vue (app shell), SettingsSkillDraft interface, SettingsSkillSummary interface (useSettingsController), SkillSummary interface (SettingsTab), SkillsTab.vue (settings skills panel), configClient (IPC client), skillsClient (IPC client), telegramClient (IPC client) (+2 more)

### Community 65 - "Community 65"
Cohesion: 0.22
Nodes (1): HelmProjectService

### Community 66 - "Community 66"
Cohesion: 0.28
Nodes (1): HelmSchedulerService

### Community 67 - "Community 67"
Cohesion: 0.39
Nodes (1): KeyboardSimulator

### Community 69 - "Community 69"
Cohesion: 0.39
Nodes (2): decodeBase64Content(), HelmPlanAttachmentService

### Community 70 - "Community 70"
Cohesion: 0.39
Nodes (5): buildFfmpegArgs(), buildPiperArgs(), PiperTts, runPiper(), runProcess()

### Community 71 - "Community 71"
Cohesion: 0.29
Nodes (1): CronEngine

### Community 72 - "Community 72"
Cohesion: 0.25
Nodes (1): MockResizeObserver

### Community 76 - "Community 76"
Cohesion: 0.48
Nodes (2): HelmSessionPlanService, normalizeDirectoryPath()

### Community 77 - "Community 77"
Cohesion: 0.29
Nodes (1): FakeBridge

### Community 78 - "Community 78"
Cohesion: 0.29
Nodes (1): FakeSessionManager

### Community 79 - "Community 79"
Cohesion: 0.52
Nodes (1): TelegramTopicRegistry

### Community 81 - "Community 81"
Cohesion: 0.53
Nodes (3): accelerator(), acceleratorDigit(), tooltip()

### Community 83 - "Community 83"
Cohesion: 0.4
Nodes (1): ScheduledTaskHistoryManager

### Community 84 - "Community 84"
Cohesion: 0.33
Nodes (1): MockResizeObserver

### Community 85 - "Community 85"
Cohesion: 0.33
Nodes (1): MockResizeObserver

### Community 86 - "Community 86"
Cohesion: 0.47
Nodes (2): copyPlanRef(), useToast()

### Community 90 - "Community 90"
Cohesion: 0.4
Nodes (1): FakeConfigLoader

### Community 91 - "Community 91"
Cohesion: 0.5
Nodes (1): CapabilityDetector

### Community 92 - "Community 92"
Cohesion: 0.6
Nodes (3): contrastText(), linearise(), parseAccentColor()

### Community 93 - "Community 93"
Cohesion: 0.4
Nodes (1): FakeConfigLoader

### Community 95 - "Community 95"
Cohesion: 0.5
Nodes (2): makeDeps(), makeSession()

### Community 98 - "Community 98"
Cohesion: 0.5
Nodes (2): setupStores(), writeYaml()

### Community 99 - "Community 99"
Cohesion: 0.4
Nodes (5): GitHub App Update Provider, Deploy Config Stripping, Two Step Release Workflow, Self Contained Profile Model, ConfigLoader Module

### Community 100 - "Community 100"
Cohesion: 0.4
Nodes (5): Renderer Content Security Policy, Helm Renderer Entrypoint, vue-main.ts Module, Vue App Mount Point, xterm Stylesheet

### Community 101 - "Community 101"
Cohesion: 0.5
Nodes (5): HelmControlService (MCP control service), LocalhostMcpServer (MCP HTTP server), HelmControlService test suite, LocalhostMcpServer test suite, getAvailableTools (session info guide)

### Community 102 - "Community 102"
Cohesion: 0.67
Nodes (2): nextRunMs(), timeRemaining()

### Community 103 - "Community 103"
Cohesion: 0.67
Nodes (2): applyPtyFilters(), stripAltScreen()

### Community 104 - "Community 104"
Cohesion: 0.67
Nodes (2): setupTestFiles(), writeYaml()

### Community 108 - "Community 108"
Cohesion: 0.67
Nodes (2): setupTestFiles(), writeYaml()

### Community 109 - "Community 109"
Cohesion: 0.5
Nodes (4): Default Profile, Profile Bindings Config, Profile Tools Config, Default Profile Reference

### Community 110 - "Community 110"
Cohesion: 0.67
Nodes (4): Green Wave Accent, Helm Paper Boat Icon, Paper Boat Symbol, Terminal Prompt Mark

### Community 111 - "Community 111"
Cohesion: 0.67
Nodes (4): PRELOAD_API_DOMAINS (domain method registry), createPreloadDomains (domain builder), PRELOAD_METHOD_IMPLEMENTATIONS (preload bridge), setupSkillHandlers (IPC handler registration)

### Community 133 - "Community 133"
Cohesion: 1.0
Nodes (2): Electron MIT License, Chromium Third Party Credits

### Community 134 - "Community 134"
Cohesion: 1.0
Nodes (2): Empty Drafts Config, Empty Sessions Config

### Community 135 - "Community 135"
Cohesion: 1.0
Nodes (2): Haptic Feedback Setting, Notifications Setting

### Community 175 - "Community 175"
Cohesion: 1.0
Nodes (1): Navigation State Ownership Fix

### Community 176 - "Community 176"
Cohesion: 1.0
Nodes (1): Modal Guard Regression Fixes

### Community 177 - "Community 177"
Cohesion: 1.0
Nodes (1): File Structure Module Map

### Community 178 - "Community 178"
Cohesion: 1.0
Nodes (1): SessionSummary Interface

### Community 179 - "Community 179"
Cohesion: 1.0
Nodes (1): getPreloadApiDomain (domain resolver)

### Community 180 - "Community 180"
Cohesion: 1.0
Nodes (1): SkillManager test suite

## Ambiguous Edges - Review These
- `Legacy Helm Envelope Reference` → `Helm JSON Envelope`  [AMBIGUOUS]
  docs/helm-envelope-reference.md · relation: semantically_similar_to

## Knowledge Gaps
- **85 isolated node(s):** `Run shell command, printing output in real-time.`, `Patch node-pty .gyp files to disable Spectre mitigation requirement.      VS 2`, `Bump version in package.json and return (old_version, new_version).`, `Create stripped config files in config-deploy/ for packaging.      Original co`, `Abort if working tree is dirty.` (+80 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 14`** (35 nodes): `TerminalManager`, `.adoptTerminal()`, `.constructor()`, `.createTerminal()`, `.deselect()`, `.destroyTerminal()`, `.detachTerminal()`, `.dispose()`, `.ensureTerminal()`, `.fitActive()`, `.fitAll()`, `.focusActive()`, `.getActiveSessionId()`, `.getActiveView()`, `.getCount()`, `.getManagedSessions()`, `.getOutputBuffer()`, `.getSession()`, `.getSessionIds()`, `.getTerminalLines()`, `.getTitle()`, `.has()`, `.hasTerminal()`, `.hydrateFromStore()`, `.hydrateSessions()`, `.removeManagedSession()`, `.renameSession()`, `.setOnEmpty()`, `.setOnSwitch()`, `.setOnTitleChange()`, `.setupIpcListeners()`, `.setupResizeObserver()`, `.switchTo()`, `.upsertManagedSession()`, `.writeToTerminal()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 17`** (31 nodes): `TelegramBotCore`, `.answerCallback()`, `.closeForumTopic()`, `.createForumTopic()`, `.deleteForumTopic()`, `.downloadFile()`, `.editForumTopic()`, `.editMessageDebounced()`, `.flushEdit()`, `.getBot()`, `.getChatId()`, `.handleCallbackQuery()`, `.handleMessage()`, `.handleMessageReaction()`, `.isAuthorized()`, `.isPathInsideDirectory()`, `.isRateLimited()`, `.isRunning()`, `.reopenForumTopic()`, `.resolveDownloadFileName()`, `.sanitizeFileName()`, `.sendDocument()`, `.sendMessage()`, `.sendPhoto()`, `.sendToTopic()`, `.sendVideo()`, `.sendVoice()`, `.setMessageReaction()`, `.start()`, `.stop()`, `.withTimeout()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (28 nodes): `BindingsTab.vue`, `ChipbarActionsTab.vue`, `PlansGrid.vue`, `SessionCard.vue`, `SessionGroup.vue`, `SessionList.vue`, `SettingsPanel.vue`, `SortBar.vue`, `SpawnGrid.vue`, `StatusStrip.vue`, `TelegramTab.vue`, `ToolsTab.vue`, `mountTab()`, `deleteButton()`, `mountList()`, `colClass()`, `onCardClick()`, `onRenameKeydown()`, `selectState()`, `handleButton()`, `navigateTab()`, `makeCardProps()`, `makeGroupProps()`, `makeSessionListProps()`, `bindings-tab-no-sequence-groups.test.ts`, `chipbar-actions-tab.test.ts`, `session-list-focus.test.ts`, `sidebar.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (27 nodes): `BrowserGamepadPoller`, `.checkDpad()`, `.checkDpadAxes()`, `.checkDpadButtons()`, `.checkRepeats()`, `.checkStickVirtualButtons()`, `.constructor()`, `.decodeHatAxis()`, `.emitConnectionEvent()`, `.emitDpadDirection()`, `.findDualAxisPair()`, `.findHatAxisIndex()`, `.getCount()`, `.getRepeatConfig()`, `.handleButtonPress()`, `.handleButtonRelease()`, `.logAxesDiagnostic()`, `.logGamepadState()`, `.onButton()`, `.onRelease()`, `.poll()`, `.processGamepad()`, `.requestGamepadAccess()`, `.setRepeatConfig()`, `.setupEvents()`, `.start()`, `.stop()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (22 nodes): `PlanBackupManager`, `.constructor()`, `.createSnapshot()`, `.deleteAllSnapshots()`, `.deleteSnapshot()`, `.getBackupDirForPath()`, `.getBackupSummary()`, `.getConfig()`, `.getDefaultConfig()`, `.getNewestSnapshot()`, `.getNextIndexForTimestamp()`, `.getOldestSnapshot()`, `.listSnapshots()`, `.loadConfig()`, `.pruneOldSnapshots()`, `.resolveBackupsRootDir()`, `.restoreFromSnapshot()`, `.saveConfig()`, `.updateConfig()`, `.validateConfig()`, `.validateSnapshot()`, `toFsSafeTimestamp()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (21 nodes): `buildContent()`, `NotificationManager`, `.constructor()`, `.dispatchLlmInAppNotification()`, `.dispose()`, `.feedOutput()`, `.flashAttention()`, `.getAppVisibility()`, `.getAppVisibilityDetails()`, `.getLastLines()`, `.handleActivityChange()`, `.maybeNotify()`, `.notifyLlmDirected()`, `.readAccentColor()`, `.removeSession()`, `.setAccentColorReader()`, `.setActiveSessionIdGetter()`, `.setScreenLockChecker()`, `.setTelegramNotifier()`, `.shouldNotify()`, `.showNotification()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (18 nodes): `HelmPlanService`, `.completePlan()`, `.constructor()`, `.createPlan()`, `.deletePlan()`, `.exportDirectory()`, `.exportItem()`, `.getPlan()`, `.getPlanIdMapping()`, `.linkPlans()`, `.listPlans()`, `.plansSummary()`, `.reopenPlan()`, `.requireWorkingDirectory()`, `.resolvePlanRef()`, `.setPlanState()`, `.unlinkPlans()`, `.updatePlan()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (18 nodes): `StateDetector`, `.clearActivityTimers()`, `.constructor()`, `.dispose()`, `.getLastOutputTime()`, `.getOrCreate()`, `.getState()`, `.hasQuestion()`, `.markActive()`, `.markResizing()`, `.markRestored()`, `.markScrolling()`, `.markSwitching()`, `.processOutput()`, `.promoteIfRecentOutput()`, `.removeSession()`, `.resetActivityTimers()`, `stripAnsi()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (17 nodes): `InputConfigStore`, `.addWorkingDirectory()`, `.constructor()`, `.filePath()`, `.getActivityTimeout()`, `.getChipbarActions()`, `.getDpadConfig()`, `.getStickConfig()`, `.getWorkingDirectories()`, `.importFrom()`, `.load()`, `.removeWorkingDirectory()`, `.reorderWorkingDirectory()`, `.save()`, `.setActivityTimeout()`, `.setChipbarActions()`, `.updateWorkingDirectory()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (17 nodes): `WindowManager`, `.assignSessionToWindow()`, `.closeAllChildWindows()`, `.focusWindowForSession()`, `.getAllWindows()`, `.getChildWindowIds()`, `.getMainWindow()`, `.getSessionsInWindow()`, `.getSnappedOutSessions()`, `.getWindow()`, `.getWindowForSession()`, `.getWindowIdForSession()`, `.isSessionSnappedOut()`, `.registerWindow()`, `.setMainWindow()`, `.unassignSession()`, `.unregisterWindow()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (17 nodes): `FakeSkillAnalyticsManager`, `.addReview()`, `.clearReviews()`, `.getStats()`, `.incrementUseCount()`, `.resetAllCounts()`, `.resetUseCount()`, `FakeSkillManager`, `.constructor()`, `.create()`, `.delete()`, `.get()`, `.list()`, `.listForProject()`, `.registerSystemSkill()`, `.resolveEffective()`, `.update()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (16 nodes): `HelmContextService`, `.appendContext()`, `.bindContext()`, `.constructor()`, `.createContext()`, `.deleteContext()`, `.getContext()`, `.getProjectIdForDirectory()`, `.listContexts()`, `.listPlanContexts()`, `.requireProject()`, `.requireWorkingDirectory()`, `.resolvePlanRef()`, `.setContextPosition()`, `.unbindContext()`, `.updateContext()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (16 nodes): `HelmSessionService`, `.claimSessionPlan()`, `.closeSession()`, `.constructor()`, `.findSession()`, `.getSession()`, `.listSessions()`, `.readSessionTerminal()`, `.renameSession()`, `.requireCliEntry()`, `.requireWorkingDirectory()`, `.setAiagentState()`, `.setSessionWorkingPlan()`, `.spawnCli()`, `.toSessionSummary()`, `requireResult()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (16 nodes): `escapeShellArg()`, `PtyManager`, `.constructor()`, `.deliverText()`, `.getPid()`, `.getSessionIds()`, `.getTerminalTail()`, `.getWriteCount()`, `.has()`, `.kill()`, `.killAll()`, `.nudgeResize()`, `.resize()`, `.setTextDeliveryHandler()`, `.spawn()`, `.write()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (14 nodes): `HelmTelegramService`, `.closeTelegramChannel()`, `.constructor()`, `.findSession()`, `.getAppVisibility()`, `.getTelegramStatus()`, `.notifyUser()`, `.requireTelegramAvailable()`, `.requireTelegramBridge()`, `.sendTelegramChat()`, `.sendTelegramVoice()`, `.setNotificationManager()`, `.setTelegramBridge()`, `validateMobileFriendlyTelegramText()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (13 nodes): `BindingStore`, `.constructor()`, `.copy()`, `.ensureCliType()`, `.filePath()`, `.get()`, `.getAll()`, `.importBulk()`, `.load()`, `.migrateLegacyActions()`, `.removeButton()`, `.save()`, `.setButton()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (13 nodes): `CliTypeStore`, `.add()`, `.constructor()`, `.filePath()`, `.get()`, `.getAll()`, `.importBulk()`, `.list()`, `.load()`, `.remove()`, `.reorder()`, `.save()`, `.set()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (13 nodes): `createContainer()`, `lastFitAddon()`, `lastSearchAddon()`, `lastTerminal()`, `makeMockFitAddon()`, `makeMockSearchAddon()`, `makeMockTerminal()`, `MockResizeObserver`, `.constructor()`, `.disconnect()`, `.observe()`, `.unobserve()`, `terminal-manager.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (12 nodes): `HelmPlanSequenceService`, `.appendPlanSequenceMemory()`, `.assertSequenceMutex()`, `.assignPlanSequence()`, `.constructor()`, `.createPlanSequence()`, `.deletePlanSequence()`, `.getPlanSequence()`, `.listPlanSequences()`, `.requireWorkingDirectory()`, `.resolvePlanRef()`, `.updatePlanSequence()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (12 nodes): `DraftManager`, `.clearSession()`, `.constructor()`, `.count()`, `.create()`, `.delete()`, `.exportAll()`, `.get()`, `.getForSession()`, `.importAll()`, `.markChanged()`, `.update()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (12 nodes): `buildSidebarDom()`, `createMockTerminalManager()`, `enterRenameMode()`, `flush()`, `getSessions()`, `getSessionsState()`, `getState()`, `loadAndFlush()`, `makeSessions()`, `pressKey()`, `setMockTerminalSessions()`, `sessions-screen.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 55`** (11 nodes): `catch()`, `handlePlanScreenDpad()`, `if()`, `mapSession()`, `onTerminalEmpty()`, `onTerminalSwitch()`, `onTerminalTitleChange()`, `App.vue`, `isDynamicImportFailure()`, `reloadAfterDynamicImportFailure()`, `vue-main.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 56`** (11 nodes): `IncomingPlansWatcher`, `.close()`, `.constructor()`, `.deleteFile()`, `.getFailedFiles()`, `.getIncomingDir()`, `.listFiles()`, `.processFile()`, `.rejectFile()`, `.start()`, `.validate()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 57`** (11 nodes): `PipelineQueue`, `.clear()`, `.dequeue()`, `.enqueue()`, `.getAll()`, `.getPosition()`, `.has()`, `.length()`, `.peek()`, `.pop()`, `.triggerHandoff()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 58`** (10 nodes): `SettingsManager`, `.constructor()`, `.flush()`, `.load()`, `.normalize()`, `.readYaml()`, `.save()`, `.saveNow()`, `.settingsPath()`, `.write()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 60`** (10 nodes): `recordRemovedSession()`, `RecycleBinManager`, `.append()`, `.constructor()`, `.count()`, `.empty()`, `.forget()`, `.list()`, `.prune()`, `.restore()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 61`** (10 nodes): `FakePtyManager`, `.constructor()`, `.deliverText()`, `.emitExit()`, `.getWrites()`, `.has()`, `.nudgeResize()`, `.spawn()`, `.spawnCommand()`, `.write()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 62`** (10 nodes): `TerminalOutputBuffer`, `.append()`, `.appendToLineBuffer()`, `.clear()`, `.clearAll()`, `.collapseCarriageReturn()`, `.constructor()`, `.getLines()`, `.getOrCreate()`, `.tail()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 63`** (10 nodes): `ProfileManager`, `.constructor()`, `.loadActiveProfile()`, `.migrateGlobalFiles()`, `.migrateProfile()`, `.profilePath()`, `.readYaml()`, `.reloadIfChanged()`, `.save()`, `.saveRaw()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 65`** (9 nodes): `HelmProjectService`, `.addProjectDir()`, `.constructor()`, `.createProject()`, `.deleteProject()`, `.listProjectDirs()`, `.listProjects()`, `.removeProjectDir()`, `.renameProject()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 66`** (9 nodes): `HelmSchedulerService`, `.cancelTask()`, `.constructor()`, `.createTask()`, `.deleteTask()`, `.getTask()`, `.listTasks()`, `.updateTask()`, `.validateWorkingDir()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 67`** (9 nodes): `KeyboardSimulator`, `.comboDown()`, `.comboUp()`, `.keyDown()`, `.keyTap()`, `.keyUp()`, `.normalizeKey()`, `.sendKeyCombo()`, `.typeString()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 69`** (8 nodes): `decodeBase64Content()`, `HelmPlanAttachmentService`, `.addPlanAttachment()`, `.constructor()`, `.deletePlanAttachment()`, `.getPlanAttachment()`, `.listPlanAttachments()`, `.resolvePlanRef()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 71`** (8 nodes): `cron-engine.test.ts`, `cron-engine.ts`, `CronEngine`, `.isValid()`, `.nextRunTime()`, `.nextRunTimeBeforeDate()`, `.validate()`, `expectLocalDateTime()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 72`** (8 nodes): `createContainer()`, `makeGamepadCli()`, `makeMockTerminal()`, `MockResizeObserver`, `.disconnect()`, `.observe()`, `.unobserve()`, `terminal-manager.ensure-terminal.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 76`** (7 nodes): `HelmSessionPlanService`, `.claimPlan()`, `.constructor()`, `.findSession()`, `.resolvePlanRef()`, `.setWorkingPlan()`, `normalizeDirectoryPath()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 77`** (7 nodes): `FakeBridge`, `.closeChannel()`, `.constructor()`, `.createChannel()`, `.isRunning()`, `.listChannels()`, `.sendToUser()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 78`** (7 nodes): `FakeSessionManager`, `.addSession()`, `.getActiveSession()`, `.getSession()`, `.removeSession()`, `.setActiveSession()`, `.spawn()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 79`** (7 nodes): `TelegramTopicRegistry`, `.constructor()`, `.list()`, `.load()`, `.remove()`, `.save()`, `.upsert()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 83`** (6 nodes): `ScheduledTaskHistoryManager`, `.append()`, `.clear()`, `.constructor()`, `.list()`, `.prune()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 84`** (6 nodes): `MockResizeObserver`, `.constructor()`, `.disconnect()`, `.observe()`, `.unobserve()`, `bindings-pty.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 85`** (6 nodes): `MockResizeObserver`, `.constructor()`, `.disconnect()`, `.observe()`, `.unobserve()`, `bindings-target.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 86`** (6 nodes): `copyPlanRef()`, `useToast()`, `useCopyPlanRef.ts`, `useToast.ts`, `copy-plan-ref.test.ts`, `toast.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 90`** (5 nodes): `FakeConfigLoader`, `.constructor()`, `.getTelegramConfig()`, `.setTelegramConfig()`, `capability-detector.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 91`** (5 nodes): `CapabilityDetector`, `.constructor()`, `.getCapabilities()`, `.invalidateCache()`, `.verifyToolPath()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 93`** (5 nodes): `FakeConfigLoader`, `.getCliTypeEntry()`, `.getMcpConfig()`, `.getWorkingDirectories()`, `.reloadActiveProfileIfChanged()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 95`** (5 nodes): `allDelivered()`, `getSentText()`, `makeDeps()`, `makeSession()`, `helm-session-delivery-service.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 98`** (5 nodes): `buildProfile()`, `setupStores()`, `writeRaw()`, `writeYaml()`, `loader-reload.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 102`** (4 nodes): `SchedulerSection.vue`, `nextRunMs()`, `timeRemaining()`, `scheduler-section.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 103`** (4 nodes): `pty-filter.ts`, `applyPtyFilters()`, `stripAltScreen()`, `pty-filter.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 104`** (4 nodes): `readYaml()`, `setupTestFiles()`, `mcp-config.test.ts`, `writeYaml()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 108`** (4 nodes): `readYaml()`, `setupTestFiles()`, `telegram-config.test.ts`, `writeYaml()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 133`** (2 nodes): `Electron MIT License`, `Chromium Third Party Credits`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 134`** (2 nodes): `Empty Drafts Config`, `Empty Sessions Config`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 135`** (2 nodes): `Haptic Feedback Setting`, `Notifications Setting`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 175`** (1 nodes): `Navigation State Ownership Fix`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 176`** (1 nodes): `Modal Guard Regression Fixes`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 177`** (1 nodes): `File Structure Module Map`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 178`** (1 nodes): `SessionSummary Interface`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 179`** (1 nodes): `getPreloadApiDomain (domain resolver)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 180`** (1 nodes): `SkillManager test suite`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Legacy Helm Envelope Reference` and `Helm JSON Envelope`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **Why does `ConfigLoader` connect `Community 7` to `Community 1`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Why does `HelmControlService` connect `Community 5` to `Community 1`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Why does `PinnedDashboard` connect `Community 8` to `Community 1`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **What connects `Run shell command, printing output in real-time.`, `Patch node-pty .gyp files to disable Spectre mitigation requirement.      VS 2`, `Bump version in package.json and return (old_version, new_version).` to the rest of the system?**
  _85 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._