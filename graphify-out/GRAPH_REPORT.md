# Graph Report - gamepad-cli-hub  (2026-07-28)

## Corpus Check
- 600 files · ~3,282,501 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 4338 nodes · 8699 edges · 109 communities detected
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 153 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 83|Community 83]]
- [[_COMMUNITY_Community 84|Community 84]]
- [[_COMMUNITY_Community 85|Community 85]]
- [[_COMMUNITY_Community 86|Community 86]]
- [[_COMMUNITY_Community 87|Community 87]]
- [[_COMMUNITY_Community 88|Community 88]]
- [[_COMMUNITY_Community 92|Community 92]]
- [[_COMMUNITY_Community 93|Community 93]]
- [[_COMMUNITY_Community 94|Community 94]]
- [[_COMMUNITY_Community 96|Community 96]]
- [[_COMMUNITY_Community 97|Community 97]]
- [[_COMMUNITY_Community 99|Community 99]]
- [[_COMMUNITY_Community 100|Community 100]]
- [[_COMMUNITY_Community 101|Community 101]]
- [[_COMMUNITY_Community 102|Community 102]]
- [[_COMMUNITY_Community 103|Community 103]]
- [[_COMMUNITY_Community 104|Community 104]]
- [[_COMMUNITY_Community 105|Community 105]]
- [[_COMMUNITY_Community 106|Community 106]]
- [[_COMMUNITY_Community 110|Community 110]]
- [[_COMMUNITY_Community 111|Community 111]]
- [[_COMMUNITY_Community 112|Community 112]]
- [[_COMMUNITY_Community 114|Community 114]]
- [[_COMMUNITY_Community 118|Community 118]]
- [[_COMMUNITY_Community 120|Community 120]]
- [[_COMMUNITY_Community 125|Community 125]]

## God Nodes (most connected - your core abstractions)
1. `get()` - 137 edges
2. `HelmControlService` - 114 edges
3. `callMcpTool()` - 109 edges
4. `set()` - 74 edges
5. `ConfigLoader` - 69 edges
6. `delete()` - 62 edges
7. `PlanManager` - 55 edges
8. `registerIPCHandlers()` - 53 edges
9. `ensureLoaded()` - 52 edges
10. `has()` - 49 edges

## Surprising Connections (you probably didn't know these)
- `executeCliBinding()` --calls--> `usePromptApplyFlow()`  [INFERRED]
  renderer\bindings.ts → renderer\composables\usePromptApplyFlow.ts
- `bootstrap()` --calls--> `setupKeyboardRelay()`  [INFERRED]
  renderer\composables\useAppBootstrap.ts → renderer\paste-handler.ts
- `handleApplyFromCanvas()` --calls--> `deliverPromptSequence()`  [INFERRED]
  renderer\plans\plan-screen.ts → renderer\sequence-delivery.ts
- `bootstrap()` --calls--> `initConfigCache()`  [INFERRED]
  renderer\composables\useAppBootstrap.ts → renderer\bindings.ts
- `executeCliBinding()` --calls--> `showContextMenu()`  [INFERRED]
  renderer\bindings.ts → renderer\stores\modal-bridge.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.01
Nodes (903): abort(), absoluteStoragePath(), accept(), acceptConnection(), acceptLink(), actionToPtyData(), activateSkill(), add() (+895 more)

### Community 1 - "Community 1"
Cohesion: 0.01
Nodes (92): setupStores(), writeYaml(), TelegramConfigManager, clearStartupFallbackTimer(), closeSplashWindow(), createSplashWindow(), createWindow(), maybeShowMainWindow() (+84 more)

### Community 2 - "Community 2"
Cohesion: 0.01
Nodes (186): createSortControl(), createController(), autoResumeSessions(), bootstrap(), clamp(), cleanupRendererSession(), doCloseSession(), doSpawn() (+178 more)

### Community 3 - "Community 3"
Cohesion: 0.02
Nodes (45): FederationController, certFingerprint(), computeHandshakeMac(), getOrCreateMachineIdentity(), getOrCreateSelfSignedCert(), loadMachineIdentity(), loadSelfSignedCert(), verifyHandshakeMac() (+37 more)

### Community 4 - "Community 4"
Cohesion: 0.02
Nodes (124): applySequenceBandLayout(), assignCoordinates(), assignLayers(), computeLayout(), groupByLayer(), layoutGroup(), orderWithinLayers(), topologicalSort() (+116 more)

### Community 5 - "Community 5"
Cohesion: 0.02
Nodes (58): createRouter(), useEscProtection(), useInputRouter(), isEditableElementInsideModal(), useModalKeyboardBridge(), asElement(), getActiveInputContext(), getEditableOwner() (+50 more)

### Community 6 - "Community 6"
Cohesion: 0.02
Nodes (2): appendSkillFeedbackFooter(), HelmControlService

### Community 7 - "Community 7"
Cohesion: 0.03
Nodes (100): buildAgentPlanGuide(), buildNotificationGuide(), buildSessionSendTextGuide(), buildStartupGuide(), buildTelegramGuide(), cleanupWorkTempFiles(), configureElectronAppIdentity(), constructor() (+92 more)

### Community 8 - "Community 8"
Cohesion: 0.06
Nodes (1): ConfigLoader

### Community 9 - "Community 9"
Cohesion: 0.05
Nodes (10): requireChanges(), requireNonEmptyString(), requireOptionalParentId(), requireString(), factory(), makeTree(), PromptTemplateManager, hasMigratedContent() (+2 more)

### Community 10 - "Community 10"
Cohesion: 0.07
Nodes (3): formatHumanId(), normalizeHumanId(), PlanManager

### Community 11 - "Community 11"
Cohesion: 0.07
Nodes (43): doSpawnSession(), editOriginalMessage(), formatTopicCleanupPreview(), formatTopicCleanupResult(), handleAccept(), handleCancel(), handleCloseAll(), handleCloseSession() (+35 more)

### Community 12 - "Community 12"
Cohesion: 0.05
Nodes (8): cb(), parseService(), PeerDiscovery, pickHost(), readTxtMachineId(), TerminalView, FakeBonjour, FakeBrowser

### Community 13 - "Community 13"
Cohesion: 0.05
Nodes (7): clampHeight(), focus(), focusEnd(), onResizeMove(), setHeight(), makeSections(), makeSessions()

### Community 14 - "Community 14"
Cohesion: 0.09
Nodes (1): TerminalManager

### Community 15 - "Community 15"
Cohesion: 0.07
Nodes (17): accelerator(), acceleratorDigit(), tooltip(), clear(), clearAll(), clearTimer(), __resetFlashAttention(), start() (+9 more)

### Community 16 - "Community 16"
Cohesion: 0.12
Nodes (1): TelegramBotCore

### Community 17 - "Community 17"
Cohesion: 0.09
Nodes (14): cancelPairing(), closePairing(), confirmPairing(), emptyPairing(), ensureSubscribed(), loadFederationConfig(), refresh(), resetPeersStateForTesting() (+6 more)

### Community 18 - "Community 18"
Cohesion: 0.14
Nodes (1): ContextManager

### Community 19 - "Community 19"
Cohesion: 0.07
Nodes (2): handleButton(), navigateTab()

### Community 20 - "Community 20"
Cohesion: 0.14
Nodes (1): BrowserGamepadPoller

### Community 21 - "Community 21"
Cohesion: 0.17
Nodes (9): assertNoDuplicateType(), dedupSummaries(), normalizeOptional(), normalizeOptionalType(), normalizePersistedSkill(), normalizeRequired(), normalizeScope(), SkillManager (+1 more)

### Community 22 - "Community 22"
Cohesion: 0.13
Nodes (6): detectMimeType(), extractAttachmentInfo(), isAudioAttachment(), reactionForStatus(), TelegramRelayService, wrapTelegramEnvelope()

### Community 23 - "Community 23"
Cohesion: 0.12
Nodes (12): clearAll(), hidePanel(), persistBool(), pruneUnread(), refresh(), remove(), setActiveSession(), showPanel() (+4 more)

### Community 24 - "Community 24"
Cohesion: 0.22
Nodes (2): ScheduledTaskManager, splitCliParams()

### Community 25 - "Community 25"
Cohesion: 0.15
Nodes (5): delay(), getToolReminder(), isAddrInUse(), LocalhostMcpServer, parsePort()

### Community 26 - "Community 26"
Cohesion: 0.16
Nodes (1): HelmSessionService

### Community 27 - "Community 27"
Cohesion: 0.19
Nodes (2): PlanBackupManager, toFsSafeTimestamp()

### Community 28 - "Community 28"
Cohesion: 0.18
Nodes (1): TopicManager

### Community 29 - "Community 29"
Cohesion: 0.2
Nodes (1): HelmPlanService

### Community 30 - "Community 30"
Cohesion: 0.22
Nodes (1): SessionManager

### Community 31 - "Community 31"
Cohesion: 0.15
Nodes (11): cleanupOrphanDependencies(), decodeFilename(), deletePlanFile(), encodeFilename(), isDirectoryPlan(), isPlanItem(), loadDependencies(), loadPlanFile() (+3 more)

### Community 32 - "Community 32"
Cohesion: 0.11
Nodes (3): FakeClient, FakeLink, FakeServer

### Community 33 - "Community 33"
Cohesion: 0.14
Nodes (1): WindowManager

### Community 34 - "Community 34"
Cohesion: 0.13
Nodes (2): FakeSkillAnalyticsManager, FakeSkillManager

### Community 35 - "Community 35"
Cohesion: 0.15
Nodes (3): escapeShellArg(), PtyManager, resolvePtyShell()

### Community 36 - "Community 36"
Cohesion: 0.2
Nodes (2): StateDetector, stripAnsi()

### Community 37 - "Community 37"
Cohesion: 0.2
Nodes (15): _cleanup(), _command_wrapper_name(), dependencies_ready(), _install_signal_handlers(), main(), print_header(), print_step(), Print a formatted header (+7 more)

### Community 38 - "Community 38"
Cohesion: 0.24
Nodes (1): ArtifactManager

### Community 39 - "Community 39"
Cohesion: 0.24
Nodes (1): RuntimeGroupManager

### Community 40 - "Community 40"
Cohesion: 0.28
Nodes (3): ensureEntry(), SkillAnalyticsManager, toStats()

### Community 41 - "Community 41"
Cohesion: 0.18
Nodes (1): NotificationManager

### Community 42 - "Community 42"
Cohesion: 0.25
Nodes (1): PeerConfigManager

### Community 43 - "Community 43"
Cohesion: 0.34
Nodes (2): PlanAttachmentManager, sanitizeFilename()

### Community 44 - "Community 44"
Cohesion: 0.2
Nodes (1): ProjectStore

### Community 45 - "Community 45"
Cohesion: 0.22
Nodes (13): bump_version(), check_git_clean(), cleanup_deploy_configs(), create_deploy_configs(), main(), patch_native_modules(), Remove the config-deploy/ staging directory., Abort if working tree is dirty. (+5 more)

### Community 46 - "Community 46"
Cohesion: 0.2
Nodes (7): buildFolderNode(), buildRecycleTree(), finalizeProjects(), matchesRecycleQuery(), pushFolder(), shortenPath(), sortFolders()

### Community 47 - "Community 47"
Cohesion: 0.18
Nodes (6): buildLegacySpawnCommand(), normalizeToolConfig(), parseCliArgs(), parseCommandTemplate(), setupTestFiles(), writeYaml()

### Community 48 - "Community 48"
Cohesion: 0.21
Nodes (7): buildPairingTranscript(), computeCommitment(), computeConfirmMac(), lengthPrefixed(), safeEqual(), verifyCommitment(), verifyConfirmMac()

### Community 49 - "Community 49"
Cohesion: 0.18
Nodes (1): HelmContextService

### Community 50 - "Community 50"
Cohesion: 0.24
Nodes (1): PatternMatcher

### Community 51 - "Community 51"
Cohesion: 0.26
Nodes (10): findFreePort(), OpenWhisprTranscriber, replaceExtension(), requestTranscription(), resolveFfmpegPath(), resolveModelPath(), resolveWhisperServerPath(), runProcess() (+2 more)

### Community 52 - "Community 52"
Cohesion: 0.25
Nodes (2): groupByDirectory(), PinnedDashboard

### Community 53 - "Community 53"
Cohesion: 0.23
Nodes (1): BindingStore

### Community 54 - "Community 54"
Cohesion: 0.23
Nodes (1): CliTypeStore

### Community 55 - "Community 55"
Cohesion: 0.18
Nodes (3): resolveImageSrc(), encodeHelmImgUrl(), roundTrip()

### Community 56 - "Community 56"
Cohesion: 0.23
Nodes (1): KeyboardSimulator

### Community 57 - "Community 57"
Cohesion: 0.33
Nodes (3): getDeliveryVerifyDelayMs(), HelmSessionDeliveryService, substituteActionParams()

### Community 58 - "Community 58"
Cohesion: 0.21
Nodes (1): HelmTelegramService

### Community 59 - "Community 59"
Cohesion: 0.15
Nodes (1): MockResizeObserver

### Community 60 - "Community 60"
Cohesion: 0.27
Nodes (11): extract_test_results(), format_markdown_output(), main(), Run tests based on mode., Run ESLint if available., Run a command and return result info., Extract test results from output., Format results as markdown. (+3 more)

### Community 61 - "Community 61"
Cohesion: 0.24
Nodes (7): commitPort(), commitToken(), normalizePort(), onPortBlur(), onPortChange(), onTokenBlur(), onTokenInput()

### Community 62 - "Community 62"
Cohesion: 0.2
Nodes (1): InputConfigStore

### Community 63 - "Community 63"
Cohesion: 0.32
Nodes (1): PairingCoordinator

### Community 64 - "Community 64"
Cohesion: 0.3
Nodes (1): DraftManager

### Community 65 - "Community 65"
Cohesion: 0.18
Nodes (2): flush(), loadAndFlush()

### Community 66 - "Community 66"
Cohesion: 0.25
Nodes (1): HelmPlanSequenceService

### Community 67 - "Community 67"
Cohesion: 0.22
Nodes (1): IncomingPlansWatcher

### Community 68 - "Community 68"
Cohesion: 0.2
Nodes (1): PipelineQueue

### Community 69 - "Community 69"
Cohesion: 0.31
Nodes (1): SettingsManager

### Community 70 - "Community 70"
Cohesion: 0.22
Nodes (2): recordRemovedSession(), RecycleBinManager

### Community 71 - "Community 71"
Cohesion: 0.24
Nodes (1): FakePtyManager

### Community 72 - "Community 72"
Cohesion: 0.31
Nodes (1): TerminalOutputBuffer

### Community 73 - "Community 73"
Cohesion: 0.22
Nodes (1): HelmProjectService

### Community 74 - "Community 74"
Cohesion: 0.28
Nodes (1): HelmSchedulerService

### Community 75 - "Community 75"
Cohesion: 0.36
Nodes (6): close(), for(), formatCloseDate(), onOverlayKeydown(), pad(), relativeClosed()

### Community 76 - "Community 76"
Cohesion: 0.39
Nodes (3): InboundCallGate, stripCallerIdentityOverrides(), summarizeArgKeys()

### Community 77 - "Community 77"
Cohesion: 0.39
Nodes (5): buildFfmpegArgs(), buildPiperArgs(), PiperTts, runPiper(), runProcess()

### Community 78 - "Community 78"
Cohesion: 0.29
Nodes (1): CronEngine

### Community 79 - "Community 79"
Cohesion: 0.25
Nodes (1): MockResizeObserver

### Community 80 - "Community 80"
Cohesion: 0.33
Nodes (2): commitPort(), normalizePort()

### Community 81 - "Community 81"
Cohesion: 0.38
Nodes (1): PeerAuditLog

### Community 82 - "Community 82"
Cohesion: 0.52
Nodes (1): HelmPeerService

### Community 83 - "Community 83"
Cohesion: 0.48
Nodes (1): HelmPlanAttachmentService

### Community 84 - "Community 84"
Cohesion: 0.29
Nodes (1): FakeBridge

### Community 85 - "Community 85"
Cohesion: 0.38
Nodes (1): PlanReadTracker

### Community 86 - "Community 86"
Cohesion: 0.29
Nodes (1): FakeSessionManager

### Community 87 - "Community 87"
Cohesion: 0.38
Nodes (1): TelegramNotifier

### Community 88 - "Community 88"
Cohesion: 0.52
Nodes (1): TelegramTopicRegistry

### Community 92 - "Community 92"
Cohesion: 0.4
Nodes (1): ScheduledTaskHistoryManager

### Community 93 - "Community 93"
Cohesion: 0.33
Nodes (1): MockResizeObserver

### Community 94 - "Community 94"
Cohesion: 0.33
Nodes (1): MockResizeObserver

### Community 96 - "Community 96"
Cohesion: 0.6
Nodes (4): create_deploy_configs(), main(), Stage clean seed configs into config-deploy/ (overlaid onto config/ by     elec, run()

### Community 97 - "Community 97"
Cohesion: 0.6
Nodes (4): find_latest_release(), main(), Find the latest dated release folder., run()

### Community 99 - "Community 99"
Cohesion: 0.8
Nodes (4): handleButton(), onCancel(), onKeydown(), onSubmit()

### Community 100 - "Community 100"
Cohesion: 0.6
Nodes (3): formatDate(), formatDateTime(), pad()

### Community 101 - "Community 101"
Cohesion: 0.6
Nodes (1): HelmSessionPlanService

### Community 102 - "Community 102"
Cohesion: 0.4
Nodes (1): FakeConfigLoader

### Community 103 - "Community 103"
Cohesion: 0.5
Nodes (1): CapabilityDetector

### Community 104 - "Community 104"
Cohesion: 0.6
Nodes (3): contrastText(), linearise(), parseAccentColor()

### Community 105 - "Community 105"
Cohesion: 0.4
Nodes (1): FakeConfigLoader

### Community 106 - "Community 106"
Cohesion: 0.5
Nodes (2): makeDeps(), makeSession()

### Community 110 - "Community 110"
Cohesion: 0.67
Nodes (2): isDynamicImportFailure(), reloadAfterDynamicImportFailure()

### Community 111 - "Community 111"
Cohesion: 0.67
Nodes (2): nextRunMs(), timeRemaining()

### Community 112 - "Community 112"
Cohesion: 0.67
Nodes (2): applyPtyFilters(), stripAltScreen()

### Community 114 - "Community 114"
Cohesion: 0.67
Nodes (2): setup(), writeYaml()

### Community 118 - "Community 118"
Cohesion: 0.67
Nodes (2): setupTestFiles(), writeYaml()

### Community 120 - "Community 120"
Cohesion: 1.0
Nodes (2): dropVerdict(), pathsEqual()

### Community 125 - "Community 125"
Cohesion: 0.67
Nodes (1): FakeSessionManager

## Knowledge Gaps
- **25 isolated node(s):** `Stage clean seed configs into config-deploy/ (overlaid onto config/ by     elec`, `Run shell command, printing output in real-time.`, `Patch node-pty .gyp files to disable Spectre mitigation requirement.      VS 2`, `Bump version in package.json and return (old_version, new_version).`, `Create stripped config files in config-deploy/ for packaging.      Original co` (+20 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 6`** (115 nodes): `appendSkillFeedbackFooter()`, `HelmControlService`, `.activateSkill()`, `.addPlanAttachment()`, `.addProjectDir()`, `.addSessionToGroup()`, `.assignPlanSequence()`, `.bindContext()`, `.cancelScheduledTask()`, `.claimSessionPlan()`, `.clearSession()`, `.clearSkillReviews()`, `.closeSession()`, `.closeSessionGroup()`, `.closeTelegramChannel()`, `.compactSession()`, `.completePlan()`, `.constructor()`, `.createArtifact()`, `.createContext()`, `.createPlan()`, `.createPlanSequence()`, `.createProject()`, `.createScheduledTask()`, `.createSessionGroup()`, `.createSkill()`, `.deleteAllArtifacts()`, `.deleteArtifact()`, `.deleteContext()`, `.deletePlan()`, `.deletePlanAttachment()`, `.deletePlanSequence()`, `.deleteProject()`, `.deleteScheduledTask()`, `.deleteSkill()`, `.exportDirectory()`, `.exportItem()`, `.exportSession()`, `.flashAttention()`, `.getAppVisibility()`, `.getArtifact()`, `.getContext()`, `.getPlan()`, `.getPlanAttachment()`, `.getPlanIdMapping()`, `.getPlanSequence()`, `.getProjectIdForDirectory()`, `.getScheduledTask()`, `.getSession()`, `.getSessionInfo()`, `.getSkill()`, `.getSkillStats()`, `.getTelegramStatus()`, `.invalidateCapabilityCache()`, `.linkPlans()`, `.listArtifacts()`, `.listClis()`, `.listContexts()`, `.listDirectories()`, `.listPlanAttachments()`, `.listPlanContexts()`, `.listPlans()`, `.listPlanSequences()`, `.listProjectDirs()`, `.listProjects()`, `.listScheduledTasks()`, `.listSessionGroups()`, `.listSessions()`, `.listSkills()`, `.notifyUser()`, `.peerCall()`, `.peerList()`, `.peerTools()`, `.plansSummary()`, `.prepareSkillForUse()`, `.readSessionTerminal()`, `.removeProjectDir()`, `.removeSessionFromGroups()`, `.renameProject()`, `.renameSession()`, `.renameSessionGroup()`, `.reopenPlan()`, `.requireArtifactManager()`, `.requireOwnedArtifact()`, `.requireProjectService()`, `.requireScheduler()`, `.resetAllSkillUseCounts()`, `.resetSkillUseCount()`, `.resolveProjectIdForDirectory()`, `.resolveProjectIdForSession()`, `.resolveSkill()`, `.restartHelm()`, `.sendInputToSession()`, `.sendTelegramChat()`, `.sendTelegramVoice()`, `.sendTextToSession()`, `.setAiagentState()`, `.setArtifactManager()`, `.setContextPosition()`, `.setNotificationManager()`, `.setPeerLinkManager()`, `.setPlanState()`, `.setRuntimeGroupManager()`, `.setTelegramBridge()`, `.showArtifact()`, `.spawnCli()`, `.submitSkillFeedback()`, `.unbindContext()`, `.unlinkPlans()`, `.updateArtifact()`, `.updateContext()`, `.updatePlan()`, `.updatePlanSequence()`, `.updateScheduledTask()`, `.updateSkill()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 8`** (69 nodes): `ConfigLoader`, `.addBookmarkedDir()`, `.addCliType()`, `.addPattern()`, `.buildSpawnConfig()`, `.cleanHelmActions()`, `.clearSnapOutWindowPrefs()`, `.constructor()`, `.copyCliBindings()`, `.ensureLoaded()`, `.ensureWorkingDirectory()`, `.getActivityTimeout()`, `.getBindings()`, `.getChipbarActions()`, `.getCliTypeEntry()`, `.getCliTypeName()`, `.getCliTypes()`, `.getDpadConfig()`, `.getEditorHistory()`, `.getEditorPrefs()`, `.getEscProtectionEnabled()`, `.getFederationConfig()`, `.getHapticFeedback()`, `.getMcpConfig()`, `.getNotifications()`, `.getPatterns()`, `.getPlanFilters()`, `.getSequenceGroup()`, `.getSequences()`, `.getSessionGroupPrefs()`, `.getSidebarPrefs()`, `.getSkillAnalyticsPath()`, `.getSkillsPath()`, `.getSnapOutWindowPrefs()`, `.getSortPrefs()`, `.getSpawnConfig()`, `.getStickConfig()`, `.getTelegramConfig()`, `.getWorkingDirectories()`, `.load()`, `.loadSettings()`, `.reloadActiveProfileIfChanged()`, `.removeBinding()`, `.removeBookmarkedDir()`, `.removeCliType()`, `.removePattern()`, `.removeSequenceGroup()`, `.reorderCliType()`, `.saveSettings()`, `.setActivityTimeout()`, `.setBinding()`, `.setChipbarActions()`, `.setEditorHistory()`, `.setEditorPrefs()`, `.setEscProtectionEnabled()`, `.setFederationConfig()`, `.setHapticFeedback()`, `.setMcpConfig()`, `.setNotifications()`, `.setPlanFilters()`, `.setProjectStore()`, `.setSequenceGroup()`, `.setSessionGroupPrefs()`, `.setSidebarPrefs()`, `.setSnapOutWindowPrefs()`, `.setSortPrefs()`, `.setTelegramConfig()`, `.updateCliType()`, `.updatePattern()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 14`** (35 nodes): `TerminalManager`, `.adoptTerminal()`, `.constructor()`, `.createTerminal()`, `.deselect()`, `.destroyTerminal()`, `.detachTerminal()`, `.dispose()`, `.ensureTerminal()`, `.fitActive()`, `.fitAll()`, `.focusActive()`, `.getActiveSessionId()`, `.getActiveView()`, `.getCount()`, `.getManagedSessions()`, `.getOutputBuffer()`, `.getSession()`, `.getSessionIds()`, `.getTerminalLines()`, `.getTitle()`, `.has()`, `.hasTerminal()`, `.hydrateFromStore()`, `.hydrateSessions()`, `.removeManagedSession()`, `.renameSession()`, `.setOnEmpty()`, `.setOnSwitch()`, `.setOnTitleChange()`, `.setupIpcListeners()`, `.setupResizeObserver()`, `.switchTo()`, `.upsertManagedSession()`, `.writeToTerminal()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 16`** (31 nodes): `TelegramBotCore`, `.answerCallback()`, `.closeForumTopic()`, `.createForumTopic()`, `.deleteForumTopic()`, `.downloadFile()`, `.editForumTopic()`, `.editMessageDebounced()`, `.flushEdit()`, `.getBot()`, `.getChatId()`, `.handleCallbackQuery()`, `.handleMessage()`, `.handleMessageReaction()`, `.isAuthorized()`, `.isPathInsideDirectory()`, `.isRateLimited()`, `.isRunning()`, `.reopenForumTopic()`, `.resolveDownloadFileName()`, `.sanitizeFileName()`, `.sendDocument()`, `.sendMessage()`, `.sendPhoto()`, `.sendToTopic()`, `.sendVideo()`, `.sendVoice()`, `.setMessageReaction()`, `.start()`, `.stop()`, `.withTimeout()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 18`** (30 nodes): `ContextManager`, `.append()`, `.bind()`, `.cleanupOrphans()`, `.constructor()`, `.create()`, `.delete()`, `.get()`, `.getBindingsForContext()`, `.getContextMetadataForPlan()`, `.getContextMetadataForPlanWithSequence()`, `.getContextMetadataForSequence()`, `.getContextRefsForPlan()`, `.getContextRefsForPlanWithSequence()`, `.getContextRefsForSequence()`, `.getContextsForPlan()`, `.getContextsForSequence()`, `.getEffectiveContextRefsForPlan()`, `.getPlanIdsForContext()`, `.getSequenceIdsForContext()`, `.isValidBindingTarget()`, `.listForProject()`, `.normalizeBinding()`, `.normalizeContext()`, `.persist()`, `.persistBindings()`, `.removeBindingsForTarget()`, `.setPosition()`, `.unbind()`, `.update()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 19`** (30 nodes): `BindingsTab.vue`, `ChipbarActionsTab.vue`, `PlansGrid.vue`, `SessionCard.vue`, `SessionGroup.vue`, `SessionList.vue`, `SettingsPanel.vue`, `SortBar.vue`, `SpawnGrid.vue`, `StatusStrip.vue`, `TelegramTab.vue`, `ToolsTab.vue`, `mountTab()`, `deleteButton()`, `mountList()`, `colClass()`, `onCardClick()`, `onDragEnd()`, `onDragStart()`, `onRenameKeydown()`, `selectState()`, `handleButton()`, `navigateTab()`, `makeCardProps()`, `makeGroupProps()`, `makeSessionListProps()`, `bindings-tab-no-sequence-groups.test.ts`, `chipbar-actions-tab.test.ts`, `session-list-focus.test.ts`, `sidebar.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (27 nodes): `BrowserGamepadPoller`, `.checkDpad()`, `.checkDpadAxes()`, `.checkDpadButtons()`, `.checkRepeats()`, `.checkStickVirtualButtons()`, `.constructor()`, `.decodeHatAxis()`, `.emitConnectionEvent()`, `.emitDpadDirection()`, `.findDualAxisPair()`, `.findHatAxisIndex()`, `.getCount()`, `.getRepeatConfig()`, `.handleButtonPress()`, `.handleButtonRelease()`, `.logAxesDiagnostic()`, `.logGamepadState()`, `.onButton()`, `.onRelease()`, `.poll()`, `.processGamepad()`, `.requestGamepadAccess()`, `.setRepeatConfig()`, `.setupEvents()`, `.start()`, `.stop()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (23 nodes): `ScheduledTaskManager`, `.cancelTask()`, `.clearTimer()`, `.completeOrReschedule()`, `.computeInitialNextRunAt()`, `.constructor()`, `.createTask()`, `.deleteTask()`, `.deliverScheduledPrompt()`, `.executeDirectTask()`, `.executeSpawnTask()`, `.executeTask()`, `.finishScheduledRun()`, `.getNextRunTime()`, `.getTask()`, `.listTasks()`, `.recordHistory()`, `.saveTasks()`, `.scheduleTask()`, `.start()`, `.stop()`, `.updateTask()`, `splitCliParams()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (22 nodes): `HelmSessionService`, `.addSessionToGroup()`, `.claimSessionPlan()`, `.closeSession()`, `.closeSessionGroup()`, `.constructor()`, `.createSessionGroup()`, `.findSession()`, `.getSession()`, `.listSessionGroups()`, `.listSessions()`, `.readSessionTerminal()`, `.removeSessionFromGroups()`, `.renameSession()`, `.renameSessionGroup()`, `.requireCliEntry()`, `.requireRuntimeGroupManager()`, `.requireWorkingDirectory()`, `.setAiagentState()`, `.setRuntimeGroupManager()`, `.spawnCli()`, `.toSessionSummary()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (22 nodes): `PlanBackupManager`, `.constructor()`, `.createSnapshot()`, `.deleteAllSnapshots()`, `.deleteSnapshot()`, `.getBackupDirForPath()`, `.getBackupSummary()`, `.getConfig()`, `.getDefaultConfig()`, `.getNewestSnapshot()`, `.getNextIndexForTimestamp()`, `.getOldestSnapshot()`, `.listSnapshots()`, `.loadConfig()`, `.pruneOldSnapshots()`, `.resolveBackupsRootDir()`, `.restoreFromSnapshot()`, `.saveConfig()`, `.updateConfig()`, `.validateConfig()`, `.validateSnapshot()`, `toFsSafeTimestamp()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (21 nodes): `TopicManager`, `.cleanupStaleTopics()`, `.closeSessionTopic()`, `.constructor()`, `.createTopicForSession()`, `.deleteTopic()`, `.ensureAllTopics()`, `.ensureTopic()`, `.findSessionByTopicId()`, `.formatTopicName()`, `.getFormattedName()`, `.getSessionIdByTopic()`, `.getTopicId()`, `.handleTopicClosed()`, `.orphanRegistryRecords()`, `.previewStaleTopics()`, `.probeTopic()`, `.renameSessionTopic()`, `.setInstanceName()`, `.summarizePreview()`, `.updateSessionTopicId()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (18 nodes): `HelmPlanService`, `.completePlan()`, `.constructor()`, `.createPlan()`, `.deletePlan()`, `.exportDirectory()`, `.exportItem()`, `.getPlan()`, `.getPlanIdMapping()`, `.linkPlans()`, `.listPlans()`, `.plansSummary()`, `.reopenPlan()`, `.requireWorkingDirectory()`, `.resolvePlanRef()`, `.setPlanState()`, `.unlinkPlans()`, `.updatePlan()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (18 nodes): `SessionManager`, `.addSession()`, `.applyProjectIdentity()`, `.clear()`, `.constructor()`, `.getActiveSession()`, `.getAllSessions()`, `.getSession()`, `.getSessionCount()`, `.hasSession()`, `.nextSession()`, `.persistSessions()`, `.previousSession()`, `.removeSession()`, `.renameSession()`, `.restoreSessions()`, `.setActiveSession()`, `.updateSession()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (17 nodes): `WindowManager`, `.assignSessionToWindow()`, `.closeAllChildWindows()`, `.focusWindowForSession()`, `.getAllWindows()`, `.getChildWindowIds()`, `.getMainWindow()`, `.getSessionsInWindow()`, `.getSnappedOutSessions()`, `.getWindow()`, `.getWindowForSession()`, `.getWindowIdForSession()`, `.isSessionSnappedOut()`, `.registerWindow()`, `.setMainWindow()`, `.unassignSession()`, `.unregisterWindow()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (17 nodes): `FakeSkillAnalyticsManager`, `.addReview()`, `.clearReviews()`, `.getStats()`, `.incrementUseCount()`, `.resetAllCounts()`, `.resetUseCount()`, `FakeSkillManager`, `.constructor()`, `.create()`, `.delete()`, `.get()`, `.list()`, `.listForProject()`, `.registerSystemSkill()`, `.resolveEffective()`, `.update()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (17 nodes): `StateDetector`, `.clearActivityTimers()`, `.constructor()`, `.dispose()`, `.getLastOutputTime()`, `.getOrCreate()`, `.hasQuestion()`, `.markActive()`, `.markResizing()`, `.markRestored()`, `.markScrolling()`, `.markSwitching()`, `.processOutput()`, `.promoteIfRecentOutput()`, `.removeSession()`, `.resetActivityTimers()`, `stripAnsi()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (16 nodes): `ArtifactManager`, `.appendVersion()`, `.clearSession()`, `.constructor()`, `.count()`, `.create()`, `.delete()`, `.deleteAllForSession()`, `.emitReveal()`, `.exportAll()`, `.get()`, `.getForSession()`, `.importAll()`, `.markChanged()`, `.reveal()`, `.update()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (16 nodes): `RuntimeGroupManager`, `.addSession()`, `.closeGroup()`, `.constructor()`, `.create()`, `.ensureGroup()`, `.exportAll()`, `.find()`, `.get()`, `.groupForSession()`, `.importAll()`, `.list()`, `.markChanged()`, `.removeSessionEverywhere()`, `.rename()`, `.setCollapsed()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (15 nodes): `NotificationManager`, `.constructor()`, `.dispatchLlmInAppNotification()`, `.dispose()`, `.flashAttention()`, `.getAppVisibility()`, `.getAppVisibilityDetails()`, `.notifyLlmDirected()`, `.readAccentColor()`, `.removeSession()`, `.setAccentColorReader()`, `.setActiveSessionIdGetter()`, `.setScreenLockChecker()`, `.setTelegramNotifier()`, `.showNotification()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (15 nodes): `PeerConfigManager`, `.add()`, `.constructor()`, `.copy()`, `.exportAll()`, `.get()`, `.getByAlias()`, `.getByMachineId()`, `.importAll()`, `.isToolAllowed()`, `.list()`, `.markChanged()`, `.remove()`, `.update()`, `.upsertByMachineId()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (15 nodes): `PlanAttachmentManager`, `.absoluteStoragePath()`, `.add()`, `.assertInside()`, `.constructor()`, `.delete()`, `.deletePlanAttachments()`, `.getToTempFile()`, `.hasAnyForPlanIds()`, `.list()`, `.loadIndex()`, `.planStorageDir()`, `.requirePlan()`, `.saveIndex()`, `sanitizeFilename()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (15 nodes): `ProjectStore`, `.addDirectory()`, `.constructor()`, `.createProject()`, `.delete()`, `.findByPath()`, `.getById()`, `.isDirty()`, `.list()`, `.removeDirectory()`, `.rename()`, `.requireRecord()`, `.resolveForPath()`, `.save()`, `.setMainDirectory()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (14 nodes): `HelmContextService`, `.bindContext()`, `.constructor()`, `.createContext()`, `.deleteContext()`, `.getContext()`, `.getProjectIdForDirectory()`, `.listContexts()`, `.listPlanContexts()`, `.requireProject()`, `.resolvePlanRef()`, `.setContextPosition()`, `.unbindContext()`, `.updateContext()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (14 nodes): `PatternMatcher`, `.cancelSchedule()`, `.constructor()`, `.dispose()`, `.executeSendText()`, `.executeWaitUntil()`, `.getPendingSchedule()`, `.getRegex()`, `.isReady()`, `.processOutput()`, `.recordFired()`, `.removeSession()`, `.sequenceToString()`, `.stripAnsi()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (14 nodes): `groupByDirectory()`, `PinnedDashboard`, `.appendSessionGroups()`, `.buildDashboardKeyboard()`, `.buildDashboardText()`, `.constructor()`, `.createOrUpdate()`, `.dispose()`, `.handleEditError()`, `.pinMessage()`, `.setInstanceName()`, `.start()`, `.stop()`, `.update()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (13 nodes): `BindingStore`, `.constructor()`, `.copy()`, `.ensureCliType()`, `.filePath()`, `.get()`, `.getAll()`, `.importBulk()`, `.load()`, `.migrateLegacyActions()`, `.removeButton()`, `.save()`, `.setButton()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (13 nodes): `CliTypeStore`, `.add()`, `.constructor()`, `.filePath()`, `.get()`, `.getAll()`, `.importBulk()`, `.list()`, `.load()`, `.remove()`, `.reorder()`, `.save()`, `.set()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 56`** (13 nodes): `setupKeyboardHandlers()`, `KeyboardSimulator`, `.comboDown()`, `.comboUp()`, `.keyDown()`, `.keyTap()`, `.keyUp()`, `.normalizeKey()`, `.sendKeyCombo()`, `.typeString()`, `keyboard-handlers.ts`, `keyboard.ts`, `keyboard.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 58`** (13 nodes): `HelmTelegramService`, `.closeTelegramChannel()`, `.constructor()`, `.findSession()`, `.getAppVisibility()`, `.getTelegramStatus()`, `.notifyUser()`, `.requireTelegramAvailable()`, `.requireTelegramBridge()`, `.sendTelegramChat()`, `.sendTelegramVoice()`, `.setNotificationManager()`, `.setTelegramBridge()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 59`** (13 nodes): `createContainer()`, `lastFitAddon()`, `lastSearchAddon()`, `lastTerminal()`, `makeMockFitAddon()`, `makeMockSearchAddon()`, `makeMockTerminal()`, `MockResizeObserver`, `.constructor()`, `.disconnect()`, `.observe()`, `.unobserve()`, `terminal-manager.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 62`** (12 nodes): `InputConfigStore`, `.constructor()`, `.filePath()`, `.getActivityTimeout()`, `.getChipbarActions()`, `.getDpadConfig()`, `.getStickConfig()`, `.importFrom()`, `.load()`, `.save()`, `.setActivityTimeout()`, `.setChipbarActions()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 63`** (12 nodes): `PairingCoordinator`, `.cancel()`, `.clear()`, `.confirm()`, `.constructor()`, `.globalCapReached()`, `.inCooldown()`, `.listActive()`, `.onSettled()`, `.reapExpired()`, `.recordFailure()`, `.start()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 64`** (12 nodes): `DraftManager`, `.clearSession()`, `.constructor()`, `.count()`, `.create()`, `.delete()`, `.exportAll()`, `.get()`, `.getForSession()`, `.importAll()`, `.markChanged()`, `.update()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 65`** (12 nodes): `buildSidebarDom()`, `createMockTerminalManager()`, `enterRenameMode()`, `flush()`, `getSessions()`, `getSessionsState()`, `getState()`, `loadAndFlush()`, `makeSessions()`, `pressKey()`, `setMockTerminalSessions()`, `sessions-screen.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 66`** (11 nodes): `HelmPlanSequenceService`, `.assertSequenceMutex()`, `.assignPlanSequence()`, `.constructor()`, `.createPlanSequence()`, `.deletePlanSequence()`, `.getPlanSequence()`, `.listPlanSequences()`, `.requireWorkingDirectory()`, `.resolvePlanRef()`, `.updatePlanSequence()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 67`** (11 nodes): `IncomingPlansWatcher`, `.close()`, `.constructor()`, `.deleteFile()`, `.getFailedFiles()`, `.getIncomingDir()`, `.listFiles()`, `.processFile()`, `.rejectFile()`, `.start()`, `.validate()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 68`** (11 nodes): `PipelineQueue`, `.clear()`, `.dequeue()`, `.enqueue()`, `.getAll()`, `.getPosition()`, `.has()`, `.length()`, `.peek()`, `.pop()`, `.triggerHandoff()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 69`** (10 nodes): `SettingsManager`, `.constructor()`, `.flush()`, `.load()`, `.normalize()`, `.readYaml()`, `.save()`, `.saveNow()`, `.settingsPath()`, `.write()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 70`** (10 nodes): `recordRemovedSession()`, `RecycleBinManager`, `.append()`, `.constructor()`, `.count()`, `.empty()`, `.forget()`, `.list()`, `.peek()`, `.prune()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 71`** (10 nodes): `FakePtyManager`, `.constructor()`, `.deliverText()`, `.emitExit()`, `.getWrites()`, `.has()`, `.nudgeResize()`, `.spawn()`, `.spawnCommand()`, `.write()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 72`** (10 nodes): `TerminalOutputBuffer`, `.append()`, `.appendToLineBuffer()`, `.clear()`, `.clearAll()`, `.collapseCarriageReturn()`, `.constructor()`, `.getLines()`, `.getOrCreate()`, `.tail()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 73`** (9 nodes): `HelmProjectService`, `.addProjectDir()`, `.constructor()`, `.createProject()`, `.deleteProject()`, `.listProjectDirs()`, `.listProjects()`, `.removeProjectDir()`, `.renameProject()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 74`** (9 nodes): `HelmSchedulerService`, `.cancelTask()`, `.constructor()`, `.createTask()`, `.deleteTask()`, `.getTask()`, `.listTasks()`, `.updateTask()`, `.validateWorkingDir()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 78`** (8 nodes): `cron-engine.test.ts`, `cron-engine.ts`, `CronEngine`, `.isValid()`, `.nextRunTime()`, `.nextRunTimeBeforeDate()`, `.validate()`, `expectLocalDateTime()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 79`** (8 nodes): `createContainer()`, `makeGamepadCli()`, `makeMockTerminal()`, `MockResizeObserver`, `.disconnect()`, `.observe()`, `.unobserve()`, `terminal-manager.ensure-terminal.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 80`** (7 nodes): `FederationConfigPanel.vue`, `mountPanel()`, `commitHost()`, `commitPort()`, `normalizePort()`, `onToggleEnabled()`, `federation-config-panel.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 81`** (7 nodes): `PeerAuditLog`, `.append()`, `.constructor()`, `.exportAll()`, `.importAll()`, `.list()`, `.prune()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 82`** (7 nodes): `HelmPeerService`, `.call()`, `.constructor()`, `.isCallableTool()`, `.list()`, `.requireManager()`, `.tools()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 83`** (7 nodes): `HelmPlanAttachmentService`, `.addPlanAttachment()`, `.constructor()`, `.deletePlanAttachment()`, `.getPlanAttachment()`, `.listPlanAttachments()`, `.resolvePlanRef()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 84`** (7 nodes): `FakeBridge`, `.closeChannel()`, `.constructor()`, `.createChannel()`, `.isRunning()`, `.listChannels()`, `.sendToUser()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 85`** (7 nodes): `PlanReadTracker`, `.clear()`, `.getRead()`, `.isStale()`, `.key()`, `.recordRead()`, `plan-read-tracker.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 86`** (7 nodes): `FakeSessionManager`, `.addSession()`, `.getActiveSession()`, `.getSession()`, `.removeSession()`, `.setActiveSession()`, `.spawn()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 87`** (7 nodes): `TelegramNotifier`, `.constructor()`, `.dispose()`, `.handleStateChange()`, `.removeSession()`, `.sendNotification()`, `.shouldNotify()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 88`** (7 nodes): `TelegramTopicRegistry`, `.constructor()`, `.list()`, `.load()`, `.remove()`, `.save()`, `.upsert()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 92`** (6 nodes): `ScheduledTaskHistoryManager`, `.append()`, `.clear()`, `.constructor()`, `.list()`, `.prune()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 93`** (6 nodes): `MockResizeObserver`, `.constructor()`, `.disconnect()`, `.observe()`, `.unobserve()`, `bindings-pty.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 94`** (6 nodes): `MockResizeObserver`, `.constructor()`, `.disconnect()`, `.observe()`, `.unobserve()`, `bindings-target.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 101`** (5 nodes): `HelmSessionPlanService`, `.claimPlan()`, `.constructor()`, `.findSession()`, `.resolvePlanRef()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 102`** (5 nodes): `FakeConfigLoader`, `.constructor()`, `.getTelegramConfig()`, `.setTelegramConfig()`, `capability-detector.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 103`** (5 nodes): `CapabilityDetector`, `.constructor()`, `.getCapabilities()`, `.invalidateCache()`, `.verifyToolPath()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 105`** (5 nodes): `FakeConfigLoader`, `.getCliTypeEntry()`, `.getMcpConfig()`, `.getWorkingDirectories()`, `.reloadActiveProfileIfChanged()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 106`** (5 nodes): `allDelivered()`, `getSentText()`, `makeDeps()`, `makeSession()`, `helm-session-delivery-service.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 110`** (4 nodes): `App.vue`, `isDynamicImportFailure()`, `reloadAfterDynamicImportFailure()`, `vue-main.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 111`** (4 nodes): `SchedulerSection.vue`, `nextRunMs()`, `timeRemaining()`, `scheduler-section.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 112`** (4 nodes): `pty-filter.ts`, `applyPtyFilters()`, `stripAltScreen()`, `pty-filter.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 114`** (4 nodes): `readYaml()`, `setup()`, `federation-config.test.ts`, `writeYaml()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 118`** (4 nodes): `readYaml()`, `setupTestFiles()`, `telegram-config.test.ts`, `writeYaml()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 120`** (3 nodes): `dropVerdict()`, `pathsEqual()`, `runtime-group-drop.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 125`** (3 nodes): `FakeSessionManager`, `.getSession()`, `session-info-guide.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `registerIPCHandlers()` connect `Community 7` to `Community 1`?**
  _High betweenness centrality (0.332) - this node is a cross-community bridge._
- **Why does `loadPeerPins()` connect `Community 7` to `Community 0`?**
  _High betweenness centrality (0.176) - this node is a cross-community bridge._
- **Why does `loadPeerSecrets()` connect `Community 7` to `Community 0`?**
  _High betweenness centrality (0.176) - this node is a cross-community bridge._
- **What connects `Stage clean seed configs into config-deploy/ (overlaid onto config/ by     elec`, `Run shell command, printing output in real-time.`, `Patch node-pty .gyp files to disable Spectre mitigation requirement.      VS 2` to the rest of the system?**
  _25 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._