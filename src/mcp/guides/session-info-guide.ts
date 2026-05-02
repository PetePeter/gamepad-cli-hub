import type { ConfigLoader } from '../../config/loader.js';
import type { SessionManager } from '../../session/manager.js';
import type { McpToolSummary, DirectoryInfo, SessionInfoResponse } from '../helm-control-service.js';

const REQUIRED_PLAN_DESCRIPTION_SECTIONS = [
  'Problem Statement',
  'User POV',
  'Done Statement',
  'Files / Classes Affected',
  'TDD Suggestions',
  'Acceptance Criteria',
];

/**
 * Build the full session info response consumed by the session_info MCP tool.
 * This is a pure function — it reads from configLoader and sessionManager, no side effects.
 */
export function getSessionInfo(
  configLoader: ConfigLoader,
  sessionManager: SessionManager,
  authContext?: { sessionId?: string; sessionName?: string },
): SessionInfoResponse {
  const mcpConfig = configLoader.getMcpConfig();
  const mcpPort = mcpConfig.port ?? 47373;
  const mcpUrl = `http://127.0.0.1:${mcpPort}/mcp`;

  const sessionId = authContext?.sessionId;
  const sessionName = authContext?.sessionName;

  let sessionInfo;
  if (sessionId) {
    sessionInfo = sessionManager.getSession(sessionId) ?? undefined;
  }

  return {
    mandatory_rules: [
      'ALWAYS call session_set_aiagent_state when your phase changes: planning before investigation, implementing before edits or tests, and completed when the requested work is ready for review.',
      'ALWAYS claim assigned Helm implementation work before editing by calling plan_set_state with status=coding and your sessionId, then call session_set_working_plan with the same plan id.',
      'ALWAYS create a separate QUESTION: plan for blocking questions that must survive chat, link it to the blocked plan with plan_nextplan_link, and leave the original plan body intact unless explicitly asked to edit it.',
      'ALWAYS output the matching AIAGENT-* state tag as the first line of each user-facing response when the session prompt requires it.',
      'ALWAYS send inter-LLM handoffs with session_send_text submit=true/default, then call session_read_terminal on the recipient and verify evidence of receipt before assuming delivery succeeded.',
    ],
    sessionId,
    sessionName: sessionName ?? sessionInfo?.name,
    cliType: sessionInfo?.cliType,
    workingDir: sessionInfo?.workingDir,
    mcp_url: mcpUrl,
    mcp_token: mcpConfig.authToken ?? '',
    aiagent_states: getAiagentStates(),
    available_directories: getAvailableDirectories(configLoader),
    aiagent_state_guide: {
      validStates: ['planning', 'implementing', 'completed', 'idle'],
      how_to_update: {
        description: 'Update the session\'s AIAGENT state icon in Helm. This state persists across restarts and is controlled by external agents.',
        mcp_call: 'session_set_aiagent_state',
        usage_example: { sessionId: 'your-session-id', state: 'implementing' },
        state_icons: { planning: '⚙️', implementing: '🟢', completed: '✅', idle: '⚪' },
      },
      state_systems: [
        {
          name: 'aiagentState',
          purpose: 'Agent-declared work phase shown on the session row. This is durable agent intent, not automatic terminal activity.',
          owner: 'External agents via session_set_aiagent_state, or Helm when restoring saved session metadata.',
          tools_or_fields: ['session_set_aiagent_state', 'SessionInfo.aiagentState'],
        },
        {
          name: 'sessionState',
          purpose: 'Pipeline state inferred from AIAGENT-* tags in PTY output and question markers.',
          owner: 'Helm StateDetector scans terminal output and updates this automatically.',
          tools_or_fields: ['AIAGENT-PLANNING', 'AIAGENT-IMPLEMENTING', 'AIAGENT-COMPLETED', 'AIAGENT-IDLE', 'SessionInfo.state', 'SessionInfo.questionPending'],
        },
        {
          name: 'planState',
          purpose: 'Durable lifecycle of a Helm plan item, independent of whether the session is busy, done, or waiting.',
          owner: 'Plan tools and explicit user or agent actions.',
          tools_or_fields: ['plan_set_state', 'plan_complete', 'session_set_working_plan', 'PlanItem.status', 'PlanItem.sessionId'],
        },
      ],
      state_transitions: [
        { from: 'idle', to: 'planning', when: 'You start reading context, asking clarifying questions, or preparing a plan before code changes.' },
        { from: 'idle', to: 'implementing', when: 'The user gives a direct execution task and you begin making changes immediately.' },
        { from: 'idle', to: 'completed', when: 'You only needed to report a result and no further work is pending.' },
        { from: 'planning', to: 'idle', when: 'Planning stops because the user pauses, cancels, or no durable work is active.' },
        { from: 'planning', to: 'implementing', when: 'You have enough context and begin editing files, running migrations, or executing the requested work.' },
        { from: 'planning', to: 'completed', when: 'The task was investigation-only or plan-only and the deliverable is ready.' },
        { from: 'implementing', to: 'idle', when: 'Implementation is paused or cancelled before a completed deliverable exists.' },
        { from: 'implementing', to: 'planning', when: 'You hit ambiguity, need more investigation, or must ask the user before continuing safely.' },
        { from: 'implementing', to: 'completed', when: 'Implementation and verification are done and the result is ready for review.' },
        { from: 'completed', to: 'idle', when: 'The user accepts the result or explicitly asks the session to stand down.' },
        { from: 'completed', to: 'planning', when: 'Follow-up feedback opens a new question or review pass.' },
        { from: 'completed', to: 'implementing', when: 'Follow-up feedback directly requests another concrete change.' },
      ],
      integration_patterns: [
        {
          scenario: 'Starting implementation',
          steps: [
            'Call plan_set_state with status=coding and sessionId to claim the plan when ownership is required.',
            'Call session_set_working_plan with the same sessionId and planId so Helm shows the active work.',
            'Call session_set_aiagent_state with state=implementing when edits, test runs, or other execution begins.',
          ],
        },
        {
          scenario: 'Blocked by question',
          steps: [
            'Call session_set_aiagent_state with state=planning while deciding or asking the question.',
            'Create a separate QUESTION: plan if the blocker must survive the chat.',
            'Link the QUESTION plan to the blocked plan with plan_nextplan_link and set the original plan blocked when work cannot continue.',
          ],
        },
        {
          scenario: 'Completing work',
          steps: [
            'Run the relevant verification and collect concise notes about changed behavior, files, tests, and remaining risk.',
            'Call plan_complete with completion documentation when a Helm plan is finished.',
            'Call session_set_aiagent_state with state=completed so the user can see the session is ready for review.',
          ],
        },
      ],
      error_scenarios: [
        'Invalid state: session_set_aiagent_state only accepts planning, implementing, completed, or idle.',
        'Session not found: pass the Helm session id or exact session name; HELM_SESSION_ID is the safest sender identity inside a spawned session.',
        'Plan already assigned: plan_set_state/session_set_working_plan can reject ownership changes when another session owns the plan.',
        'State systems disagree: reconcile by updating the explicit aiagentState or plan state; PTY-derived sessionState will continue to follow terminal output.',
      ],
      notes: [
        'State persists across restarts',
        'Updates trigger session:changed event',
        'Only external agents should set this state — activity dots (green/blue/grey) are based on PTY I/O timing and are managed automatically',
        'When LLM starts to make changes, mark it as implementing. When done, mark it as completed for the user to review. If questions arise, mark it as planning and make follow-up plans with the questions. Only the user should mark it as idle, or the LLM if explicitly requested.',
      ],
    },
    session_send_text_guide: {
      description: 'Send text to another session from your session. This enables inter-LLM communication via Helm\'s embedded PTY system.',
      how_it_works: 'Text is delivered to the target session\'s PTY via stdin. Helm wraps your message in a [HELM_MSG] envelope with metadata — unless the recipient tool has disabled preamble via \'helmPreambleForInterSession: false\', in which case you send raw text only. When expectsResponse=true, replies are pasted back into your session as new chat turns — no polling needed.',
      inter_llm_handoff_protocol: [
        'Always call session_send_text with submit=true, or omit submit because true is the default. Never use submit=false for inter-LLM handoffs.',
        'After session_send_text succeeds, call session_read_terminal on the recipient session and inspect the tail for evidence the message landed: the first words of the sent text, a new prompt, or a new response starting.',
        'If the recipient tail does not show evidence of receipt, warn the user instead of silently assuming success.',
      ],
      required_args: { sessionId: '[DESTINATION] Target session ID — MUST be different from senderSessionId', text: 'The text to send', senderSessionId: '[SENDER] Your session ID — MUST equal the HELM_SESSION_ID environment variable injected by Helm at startup' },
      optional_args: { submit: 'Boolean, default true. For inter-LLM handoffs, leave this true; submit=false only parks text in the recipient buffer without triggering work.', expectsResponse: 'Boolean, default false. If true, Helm routes the target session\'s reply back to your session' },
      examples: [
        { scenario: 'Send prompt to session', payload: { sessionId: 'target-session-id', text: 'Analyze this file', senderSessionId: '$HELM_SESSION_ID', submit: true, expectsResponse: false } },
        { scenario: 'Send with auto-enter', payload: { sessionId: 'target-session-id', text: 'git status', senderSessionId: '$HELM_SESSION_ID', submit: true, expectsResponse: false } },
        { scenario: 'Send and await response', payload: { sessionId: 'target-session-id', text: 'What is the current git branch?', senderSessionId: '$HELM_SESSION_ID', submit: true, expectsResponse: true } },
      ],
      error_scenarios: [
        'senderSessionId must be from HELM_SESSION_ID env var',
        'senderSessionId must be different from the destination sessionId',
        'Unknown sender session — senderSessionId does not match any active Helm session',
        'Destination session not found or PTY not running',
      ],
      receiving_responses: 'When expectsResponse=true, Helm pastes [HELM_MSG] envelope as new chat turn in sender session. Reply using session_send_text with sessionId set to the original senderSessionId.',
    },
    agent_plan_guide: {
      plan_identifier_semantics: [
        'Values like P-0035 are Helm human-readable plan IDs (PlanItem.humanId), not chat message IDs.',
        'MCP plan tools accept either the canonical UUID id or the P-00xx humanId wherever a plan id/ref is requested.',
        'Use plans_summary or plans_list when you need to map between a P-id, canonical UUID, title, status, and dependency context.',
      ],
      when_to_create_plan: [
        'Create a new Helm plan when you discover follow-up work that should survive the current session or be handled later.',
        'Create a new Helm plan for blockers that need user input, upstream investigation, or another agent, instead of burying them in chat only.',
        'Do not overwrite the original plan when a new question or follow-up appears; preserve the original context and create a separate linked plan.',
      ],
      required_description_sections: REQUIRED_PLAN_DESCRIPTION_SECTIONS,
      question_plan_workflow: [
        'Question plans should use a title that starts with QUESTION: and a description whose first lines contain the concrete question.',
        'After creating a question plan, call plan_nextplan_link from the question plan to the blocked/original plan so the question must be resolved first.',
        'Keep the rest of the original plan description unchanged unless the user explicitly asks for an edit.',
      ],
      completion_documentation: [
        'When calling plan_complete, document the implemented behavior, the important files changed, tests or review performed, and any remaining risk.',
        'Completion notes should be useful to the next agent or sleeping user without requiring chat history.',
      ],
      plan_attachment_guide: [
        'Use plan_attachment_list to fetch attachment metadata when plan_get returns hasAttachments=true.',
        'Call plan_attachment_get to retrieve actual content via a temp file path when needed.',
        'Call plan_attachment_add to store durable supporting artifacts; attachments are persisted inside Helm config-managed storage.',
      ],
      sequence_memory_guide: [
        'A sequence is a first-class shared-memory store that groups related plans into a swimlane; call plan_sequence_list to discover sequences for a directory or specific plan.',
        'plan_get returns sequenceId if the plan is a member; call plan_sequence_list with planId to fetch the full sequence including sharedMemory and other member plans.',
        'Use plan_sequence_memory_append to add to shared memory atomically, or plan_sequence_update for full edits; always pass expectedUpdatedAt from the last read to prevent concurrent overwrites.',
        'Sequences coordinate shared state across multiple related plans; use them when a group of plans needs to track common progress, decisions, or accumulated context.',
      ],
    },
    notification_guide: {
      description: 'When you need to pull the user\'s attention to this session, prefer notify_user — Helm picks the right channel (toast, in-app bubble, or Telegram) based on screen-lock state and which session the user is actively viewing.',
      preferred_tool: 'notify_user — single smart-router entry point. Helm chooses delivery from existing app/lock state. Avoid telegram_chat unless the user has already engaged via Telegram or the message is explicitly mobile-friendly and urgent.',
      pre_flight: [
        'Optionally call get_app_visibility first; if visibility is "visible-focused" AND activeSessionId equals your sessionId, the user is already watching this session — skip the notification.',
        'Notifications require notificationMode=llm in Helm settings; otherwise notify_user throws. Do not silently swallow that error — surface it to the user once and stop retrying.',
      ],
      when_to_notify: [
        'A long-running task you started has just finished and the user is likely away from this session.',
        'You are blocked on a question or decision the user must answer before you can continue.',
        'An unexpected error or unsafe operation has stopped progress and needs human acknowledgement.',
        'A scheduled or background event the user asked to be told about has occurred (build green, deploy done, watcher fired).',
      ],
      when_not_to_notify: [
        'The user is clearly engaged: get_app_visibility returns visibility="visible-focused" with activeSessionId equal to this session — they will see your reply directly, so a notification is just noise.',
        'For routine progress chatter, intermediate step logs, or any content that does not need immediate attention.',
        'In a tight loop or on every tool result — Helm has no per-session rate limit on notify_user, so spamming the user is on you.',
        'When notificationMode is not "llm" — call get_app_visibility / read the error from notify_user once and stop instead of retrying.',
      ],
      routing_outcomes: {
        toast: 'Window hidden or unfocused (and screen unlocked) — Helm shows a native OS toast. Click focuses the window and switches to this session.',
        bubble: 'Window focused on a different session — Helm shows an in-app bubble inside that window so the user notices without losing focus on whatever they are looking at.',
        telegram: 'Screen is locked AND Telegram bot is configured/running — Helm sends the message to the user\'s Telegram chat instead of the desktop.',
        none: 'User is already viewing this session (visible-focused + matching activeSessionId), or screen is locked with no Telegram configured — notification is suppressed.',
      },
      telegram_usage: [
        'Reach for telegram_chat only when the message is genuinely mobile-friendly: short lines, no wide tables, no large code blocks. The validator will reject oversize content.',
        'Prefer telegram_chat over notify_user only when the user has already engaged through Telegram in this session, or when the user explicitly asked for a Telegram update.',
        'For urgent blockers where the user may be away from the desktop, notify_user already routes to Telegram automatically when the screen is locked — you usually do not need to pick Telegram explicitly.',
      ],
      examples: [
        { scenario: 'Long build finished while user was away', tool: 'notify_user', rationale: 'Helm picks toast when window is hidden, or Telegram if the screen is locked — agent does not need to know which.' },
        { scenario: 'Need user decision before destructive action', tool: 'notify_user', rationale: 'Title summarises the question; body keeps it short. Stop and wait for the user; do not re-fire the notification.' },
        { scenario: 'User has been chatting on Telegram and asks for status', tool: 'telegram_chat', rationale: 'Direct mobile-friendly reply on the channel they are already using.' },
        { scenario: 'Routine progress update mid-task', tool: 'none', rationale: 'Skip — this is what the session output and AIAGENT-* state are for.' },
      ],
    },
  };
}

/** Valid AIAGENT state tags for the state registry. */
function getAiagentStates(): string[] {
  return ['planning', 'implementing', 'completed', 'idle'];
}

/** Available working directories with names. */
function getAvailableDirectories(configLoader: ConfigLoader): DirectoryInfo[] {
  return configLoader.getWorkingDirectories().map((entry) => ({
    path: entry.path,
    name: entry.name,
  }));
}

/** List of all MCP tools with names and titles (used by tests to verify tool surface). */
export function getAvailableTools(): McpToolSummary[] {
  return [
    { name: 'tools_list', title: 'List CLI Types', description: 'List CLI types configured in Helm and the configured working directories they can be spawned into.' },
    { name: 'plans_list', title: 'List Plans', description: 'List all plan items for a directory before editing or assigning work. Returned humanId values such as P-0035 are Helm plan IDs.' },
    { name: 'plans_summary', title: 'Plans Summary', description: 'List compact plan status, canonical IDs, human-readable P-ids, and dependency relationships before claiming work.' },
    { name: 'plan_get', title: 'Get Plan', description: 'Get full plan details before changing state, editing content, or asking about a plan. The id argument accepts either UUID or P-00xx humanId.' },
    { name: 'plan_create', title: 'Create Plan', description: `Create durable follow-up or question plans. Descriptions should include: ${REQUIRED_PLAN_DESCRIPTION_SECTIONS.join(', ')}.` },
    { name: 'plan_update', title: 'Update Plan', description: 'Update a plan title, description, and/or type while preserving existing context unless the edit is intentional. The id argument accepts UUID or P-00xx humanId.' },
    { name: 'plan_delete', title: 'Delete Plan', description: 'Delete a plan item by UUID or P-00xx humanId.' },
    { name: 'plan_set_state', title: 'Set Plan State', description: 'Set plan lifecycle state by UUID or P-00xx humanId. Pass sessionId when claiming coding work and then call session_set_working_plan.' },
    { name: 'plan_complete', title: 'Complete Plan', description: 'Mark a coding or review plan as done by UUID or P-00xx humanId with documentation of behavior changed, files, tests/review, and remaining risk.' },
    { name: 'plan_nextplan_link', title: 'Link Next Plan', description: 'Link one plan as a prerequisite for another using UUIDs or P-00xx humanIds. For blocker questions, link the QUESTION plan to the original blocked plan.' },
    { name: 'plan_nextplan_unlink', title: 'Unlink Next Plan', description: 'Remove a prerequisite link between two plan items using UUIDs or P-00xx humanIds.' },
    { name: 'plan_sequence_list', title: 'List Plan Sequences', description: 'List sequence/shared-memory stores for a directory or plan, including member plan IDs and sharedMemory.' },
    { name: 'plan_sequence_create', title: 'Create Plan Sequence', description: 'Create a sequence/shared-memory store that plans can join.' },
    { name: 'plan_sequence_update', title: 'Update Plan Sequence', description: 'Update sequence title, mission, sharedMemory, or order. Pass expectedUpdatedAt for mutex-style write protection.' },
    { name: 'plan_sequence_memory_append', title: 'Append Sequence Memory', description: 'Append to a sequence sharedMemory store with optional expectedUpdatedAt concurrency protection.' },
    { name: 'plan_sequence_delete', title: 'Delete Plan Sequence', description: 'Delete a sequence and clear membership from member plans.' },
    { name: 'plan_sequence_assign', title: 'Assign Plan Sequence', description: 'Assign or unlink a plan from a sequence without deleting the sequence.' },
    { name: 'plan_attachment_list', title: 'List Plan Attachments', description: 'List files attached to a plan by UUID or P-00xx humanId.' },
    { name: 'plan_attachment_add', title: 'Add Plan Attachment', description: 'Attach text, JSON, image, or binary content up to 10MB to a plan. Binary content is supplied as base64 and stored inside Helm config.' },
    { name: 'plan_attachment_delete', title: 'Delete Plan Attachment', description: 'Delete one stored attachment from a plan by attachment ID.' },
    { name: 'plan_attachment_get', title: 'Get Plan Attachment Temp File', description: 'Copy an attachment to a Helm temp file and return the local temp path instead of inline content.' },
    { name: 'directories_list', title: 'List Directories', description: 'List known configured working directories before creating plans or sessions.' },
    { name: 'session_create', title: 'Create Session', description: 'Spawn a new CLI session in a configured working directory with a stable display name.' },
    { name: 'sessions_list', title: 'List Sessions', description: 'List currently known Helm sessions, optionally filtered to one working directory.' },
    { name: 'session_get', title: 'Get Session', description: 'Get a session by ID or exact display name.' },
    { name: 'session_send_text', title: 'Send Text To Session', description: 'Send text to a running session PTY, with optional reply routing through HELM_MSG metadata.' },
    { name: 'session_read_terminal', title: 'Read Session Terminal', description: 'Read the recent terminal tail for any known session by ID or exact display name, with raw, stripped, or both output modes.' },
    { name: 'session_set_working_plan', title: 'Set Session Working Plan', description: 'Update the session row to show the plan currently being worked on.' },
    { name: 'session_set_aiagent_state', title: 'Set Session AIAGENT State', description: 'Update the session AIAGENT state icon in Helm.' },
    { name: 'session_close', title: 'Close Session', description: 'Close a Helm session and stop its PTY.' },
    { name: 'session_info', title: 'Get Session Info', description: 'Retrieve MCP endpoint, AIAGENT state registry, available tools, directories, and agent planning guidance.' },
    { name: 'notify_user', title: 'Notify User', description: 'Send an LLM-directed notification with smart delivery routing. Requires notificationMode=llm.' },
    { name: 'get_app_visibility', title: 'Get App Visibility', description: 'Return app visibility, screen lock state, and activeSessionId for notification routing.' },
    { name: 'telegram_status', title: 'Telegram Status', description: 'Report whether Telegram is enabled, configured, running, and available for urgent mobile-friendly user communication.' },
    { name: 'telegram_chat', title: 'Send Telegram Chat', description: 'Send concise mobile-friendly text to the user via Telegram. Provide sessionId or name. Lines must be short; do not send large wide logs, tables, or code blocks.' },
    { name: 'telegram_channel_close', title: 'Close Telegram Channel', description: 'Close one MCP Telegram communication channel without deleting unrelated session topics.' },
  ];
}
