import type { McpTool } from './types.js';

export const REQUIRED_PLAN_DESCRIPTION_SECTIONS = [
  'Problem Statement',
  'User POV',
  'Done Statement',
  'Files / Classes Affected',
  'TDD Suggestions',
  'Acceptance Criteria',
];

export const MCP_TOOLS: McpTool[] = [
  {
    name: 'tools_list',
    title: 'List CLI Types',
    description: 'List CLI types configured in Helm and the configured working directories they can be spawned into. Call this near the start of a Helm workflow when you need to know what CLIs and spawn targets are actually available before creating a session.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'skills_list',
    title: 'List Skills',
    description: 'List Helm skills (user-managed and system) as compact summaries. Pass projectId or dirPath to filter to skills applicable to one project. Use skills_get when you need the full body before applying or editing a skill.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        dirPath: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'skills_get',
    title: 'Get Skill',
    description: 'Fetch one Helm skill by id or resolve the effective skill by type. Pass id for exact lookup, or pass type with optional projectId/dirPath for type-based resolution (respects project scope precedence).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Exact skill UUID for direct lookup.' },
        type: { type: 'string', description: 'Stable skill type for effective resolution.' },
        projectId: { type: 'string', description: 'Project ID for type-based scope resolution.' },
        dirPath: { type: 'string', description: 'Directory path — resolved to projectId for type-based scope resolution.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'skills_submit_feedback',
    title: 'Submit Skill Feedback',
    description: 'Submit LLM feedback for a user-managed Helm skill after applying it. Stores stars, summary, optional improvement, and caller CLI attribution.',
    inputSchema: {
      type: 'object',
      properties: {
        skillId: { type: 'string' },
        stars: { type: 'number', minimum: 1, maximum: 5 },
        summary: { type: 'string' },
        improvement: { type: 'string' },
      },
      required: ['skillId', 'stars', 'summary'],
      additionalProperties: false,
    },
  },
  {
    name: 'skills_create',
    title: 'Create Skill',
    description: 'Create a user-managed Helm skill persisted in config/skills.yaml. Omit projectIds or set allProjects=true for a global skill.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        body: { type: 'string' },
        type: { type: 'string' },
        aiAmendable: { type: 'boolean' },
        allProjects: { type: 'boolean' },
        projectIds: { type: 'array', items: { type: 'string' } },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'skills_update',
    title: 'Update Skill',
    description: 'Update a user-managed Helm skill. Protected skills reject AI amendments unless aiAmendable is enabled.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
        body: { type: 'string' },
        type: { type: 'string' },
        aiAmendable: { type: 'boolean' },
        allProjects: { type: 'boolean' },
        projectIds: { type: 'array', items: { type: 'string' } },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'skills_delete',
    title: 'Delete Skill',
    description: 'Delete a user-managed Helm skill by id. System skills cannot be deleted.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'plans_list',
    title: 'List Plans',
    description: 'List all plan items for a directory. Use this before editing or assigning plan work so you can reference the human-readable P-00xx plan IDs Helm returns.',
    inputSchema: {
      type: 'object',
      properties: { dirPath: { type: 'string' } },
      required: ['dirPath'],
      additionalProperties: false,
    },
  },
  {
    name: 'plans_summary',
    title: 'Plans Summary',
    description: 'List all plans for a directory as a compact summary — status, canonical ID, human-readable P-00xx ID, title, and dependency relationships. Call this first when orienting to a project so you know what work exists and what is blocked by what. Use plan_get for the full description of a specific plan before claiming, updating, or creating linked follow-ups.',
    inputSchema: {
      type: 'object',
      properties: { dirPath: { type: 'string' } },
      required: ['dirPath'],
      additionalProperties: false,
    },
  },
  {
    name: 'plan_get',
    title: 'Get Plan',
    description: 'Get a single plan item by UUID or P-00xx human-readable ID, including lightweight sequenceContextMetadata when contexts are attached. Before implementation, use this with plan_context_list to inspect the plan and effective context refs; fetch full context just-in-time with context_get only when it is relevant to the current phase.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'plan_create',
    title: 'Create Plan',
    description: `Create a plan item in a directory when follow-up work, later cleanup, or a blocking question should survive the current session. Optionally set type to "bug", "feature", or "research", and set autoImplement=true when this ready follow-up may be picked up automatically after its prerequisite is completed. The description should include these sections: ${REQUIRED_PLAN_DESCRIPTION_SECTIONS.join(', ')}. For blocking questions, create a separate plan titled "QUESTION: ..." and link it to the original blocked plan with plan_nextplan_link so the question must be resolved first. The new plan starts in "planning" status with no session owner. When you begin working on this plan, claim it by calling plan_set_state with status "coding" and your sessionId, then call session_set_working_plan.`,
    inputSchema: {
      type: 'object',
      properties: {
        dirPath: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        type: { type: 'string', enum: ['bug', 'feature', 'research'] },
        autoImplement: { type: 'boolean' },
      },
      required: ['dirPath', 'title', 'description'],
      additionalProperties: false,
    },
  },
  {
    name: 'plan_update',
    title: 'Update Plan',
    description: 'Update a plan item title, description, type, and/or auto-implement flag by UUID or P-00xx human-readable ID. Set type to "bug", "feature", or "research"; pass null to clear the type. Set autoImplement true or false to control whether a ready follow-up plan may be picked up automatically after its prerequisite is completed.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        type: { anyOf: [{ type: 'string', enum: ['bug', 'feature', 'research'] }, { type: 'null' }] },
        autoImplement: { type: 'boolean' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'plan_delete',
    title: 'Delete Plan',
    description: 'Delete a plan item by UUID or P-00xx human-readable ID.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'plan_set_state',
    title: 'Set Plan State',
    description: 'Set a plan item state by UUID or P-00xx human-readable ID to planning, ready, coding, review, or blocked. Use this when the lifecycle state itself changed; if you only need the session row to point at the current plan, prefer session_set_working_plan. IMPORTANT: When setting status to "coding", you must pass sessionId to claim ownership. The "planning" and "ready" states automatically clear any previous session owner. "review" and "blocked" preserve existing ownership. Always call session_set_working_plan after claiming a plan to update the session\'s visible working plan.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        status: { type: 'string', enum: ['planning', 'ready', 'coding', 'review', 'blocked'] },
        stateInfo: { type: 'string' },
        sessionId: { type: 'string' },
      },
      required: ['id', 'status'],
      additionalProperties: false,
    },
  },
  {
    name: 'plan_complete',
    title: 'Complete Plan',
    description: 'Mark a coding or review plan item as done by UUID or P-00xx human-readable ID. Requires documentation of what was done (minimum 10 characters). Good completion notes summarize implemented behavior, important files changed, tests or review performed, and any remaining risk.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        documentation: { type: 'string', description: 'Documentation of what was accomplished (minimum 10 characters)' },
      },
      required: ['id', 'documentation'],
      additionalProperties: false,
    },
  },
  {
    name: 'plan_reopen',
    title: 'Reopen Plan',
    description: 'Revert a done plan back to ready or planning by UUID or P-00xx human-readable ID based on its current dependencies. Use this to undo an accidental plan_complete call. The plan\'s sessionId is cleared on reopen.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'plan_context_list',
    title: 'List Effective Plan Context',
    description: 'List the effective context refs for one plan by UUID or P-00xx human-readable ID. This merges direct plan context plus inherited parent-sequence context into one deduped set, with source telling you whether each context comes from the plan, the sequence, or both. Use this before implementing a plan, then call context_get just-in-time only for contexts relevant to the current phase; defer unrelated context such as testing notes until that phase.',
    inputSchema: {
      type: 'object',
      properties: { planId: { type: 'string' } },
      required: ['planId'],
      additionalProperties: false,
    },
  },
  {
    name: 'plan_nextplan_link',
    title: 'Link Next Plan',
    description: 'Link one plan item as a prerequisite for another by UUID or P-00xx human-readable ID. A plan can have many outgoing links (to many next plans) and many incoming links (from many previous plans). The source plan must complete before the target plan can start. Use this for blocking questions by linking the separate QUESTION plan to the original blocked plan.',
    inputSchema: {
      type: 'object',
      properties: {
        fromId: { type: 'string' },
        toId: { type: 'string' },
      },
      required: ['fromId', 'toId'],
      additionalProperties: false,
    },
  },
  {
    name: 'plan_nextplan_unlink',
    title: 'Unlink Next Plan',
    description: 'Remove a prerequisite link between two plan items by UUID or P-00xx human-readable ID.',
    inputSchema: {
      type: 'object',
      properties: {
        fromId: { type: 'string' },
        toId: { type: 'string' },
      },
      required: ['fromId', 'toId'],
      additionalProperties: false,
    },
  },
  {
    name: 'sequence_list',
    title: 'List Sequences',
    description: 'List sequence coordination lanes for a directory, or for a specific plan by UUID/P-id. Returned sharedMemory is legacy common memory for member plans; prefer context_* tools for new durable memory and use expectedUpdatedAt on writes to avoid concurrent overwrite.',
    inputSchema: {
      type: 'object',
      properties: {
        dirPath: { type: 'string' },
        planId: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'sequence_get',
    title: 'Get Sequence',
    description: 'Get one sequence coordination lane by ID, including its legacy sharedMemory.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'sequence_create',
    title: 'Create Sequence',
    description: 'Create a first-class sequence coordination lane in a directory. Plans can be assigned to it with sequence_assign; prefer context_* tools over sharedMemory for new durable notes.',
    inputSchema: {
      type: 'object',
      properties: {
        dirPath: { type: 'string' },
        title: { type: 'string' },
        missionStatement: { type: 'string' },
        sharedMemory: { type: 'string' },
      },
      required: ['dirPath', 'title'],
      additionalProperties: false,
    },
  },
  {
    name: 'sequence_update',
    title: 'Update Sequence',
    description: 'Update sequence title, mission, sharedMemory, or order. sharedMemory is a legacy coordination field; prefer context_* tools for new durable memory. Pass expectedUpdatedAt from sequence_list/get-style responses for mutex-style protection against concurrent LLM writes.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        missionStatement: { type: 'string' },
        sharedMemory: { type: 'string' },
        order: { type: 'number' },
        expectedUpdatedAt: { type: 'number' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'sequence_memory_append',
    title: 'Append Sequence Memory',
    description: 'Append text to a sequence sharedMemory store when maintaining existing legacy memory. Prefer context_* tools for new durable notes. Pass expectedUpdatedAt from the last read to make the append mutexable and fail on concurrent changes.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        text: { type: 'string' },
        expectedUpdatedAt: { type: 'number' },
      },
      required: ['id', 'text'],
      additionalProperties: false,
    },
  },
  {
    name: 'sequence_delete',
    title: 'Delete Sequence',
    description: 'Delete a sequence/shared-memory store and clear sequence membership from its member plans.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'sequence_assign',
    title: 'Assign Sequence',
    description: 'Assign a plan by UUID/P-id to a sequence in the same directory, or pass null sequenceId to unlink the plan from its sequence without deleting the sequence.',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string' },
        sequenceId: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      },
      required: ['planId', 'sequenceId'],
      additionalProperties: false,
    },
  },
  {
    name: 'context_list',
    title: 'List Context Nodes',
    description: 'List project-level context nodes. Use projects_list first when you need the projectId for a directory or repo.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
      },
      required: ['projectId'],
      additionalProperties: false,
    },
  },
  {
    name: 'context_create',
    title: 'Create Context Node',
    description: 'Create a project-level context node. Context nodes can later be associated with plans or sequences, while agents retrieve the full content through context_get only when needed.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        title: { type: 'string' },
        type: { type: 'string' },
        permission: { type: 'string', enum: ['readonly', 'writable'] },
        content: { type: 'string' },
        x: { anyOf: [{ type: 'number' }, { type: 'null' }] },
        y: { anyOf: [{ type: 'number' }, { type: 'null' }] },
      },
      required: ['projectId', 'title'],
      additionalProperties: false,
    },
  },
  {
    name: 'context_update',
    title: 'Update Context Node',
    description: 'Update a context node by ID. This can change the title, free-text type, permission mode, content, or stored position.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        type: { type: 'string' },
        permission: { type: 'string', enum: ['readonly', 'writable'] },
        content: { type: 'string' },
        x: { anyOf: [{ type: 'number' }, { type: 'null' }] },
        y: { anyOf: [{ type: 'number' }, { type: 'null' }] },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'context_delete',
    title: 'Delete Context Node',
    description: 'Delete a context node by ID and remove all of its plan and sequence bindings.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'context_get',
    title: 'Get Context Node',
    description: 'Fetch a context node by ID, including full content. Use this after inspecting plan_context_list or context_list.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'context_append',
    title: 'Append Context Content',
    description: 'Append text to a writable context node. Pass expectedUpdatedAt from the last read to make the append mutexable and fail on concurrent changes.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        text: { type: 'string' },
        expectedUpdatedAt: { type: 'number' },
      },
      required: ['id', 'text'],
      additionalProperties: false,
    },
  },
  {
    name: 'context_set_position',
    title: 'Set Context Position',
    description: 'Persist the X/Y canvas position for a context node so user-placed context cards stay where they were dragged.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        x: { anyOf: [{ type: 'number' }, { type: 'null' }] },
        y: { anyOf: [{ type: 'number' }, { type: 'null' }] },
      },
      required: ['id', 'x', 'y'],
      additionalProperties: false,
    },
  },
  {
    name: 'context_bind',
    title: 'Bind Context Node',
    description: 'Associate an existing context node with a plan or sequence in the same directory so it appears in effective plan/sequence context lists.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        targetType: { type: 'string', enum: ['sequence', 'plan'] },
        targetId: { type: 'string' },
      },
      required: ['id', 'targetType', 'targetId'],
      additionalProperties: false,
    },
  },
  {
    name: 'context_unbind',
    title: 'Unbind Context Node',
    description: 'Remove one plan or sequence association from an existing context node without deleting the context itself.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        targetType: { type: 'string', enum: ['sequence', 'plan'] },
        targetId: { type: 'string' },
      },
      required: ['id', 'targetType', 'targetId'],
      additionalProperties: false,
    },
  },
  {
    name: 'plan_attachment_list',
    title: 'List Plan Attachments',
    description: 'List files attached to a plan by UUID or P-00xx human-readable ID. Attachments are stored inside Helm config, not as fragile external references.',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string' },
      },
      required: ['planId'],
      additionalProperties: false,
    },
  },
  {
    name: 'plan_attachment_add',
    title: 'Add Plan Attachment',
    description: 'Attach text, JSON, image, or arbitrary binary content up to 10MB to a plan by UUID or P-00xx human-readable ID. Provide exactly one of text or contentBase64. The file is copied into Helm config-managed storage.',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string' },
        filename: { type: 'string' },
        text: { type: 'string' },
        contentBase64: { type: 'string' },
        contentType: { type: 'string' },
      },
      required: ['planId', 'filename'],
      additionalProperties: false,
    },
  },
  {
    name: 'plan_attachment_delete',
    title: 'Delete Plan Attachment',
    description: 'Delete a stored attachment from a plan by UUID or P-00xx human-readable ID and attachmentId.',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string' },
        attachmentId: { type: 'string' },
      },
      required: ['planId', 'attachmentId'],
      additionalProperties: false,
    },
  },
  {
    name: 'plan_attachment_get',
    title: 'Get Plan Attachment Temp File',
    description: 'Copy a stored attachment to a Helm temp file and return the tempPath plus metadata. This avoids inline raw or base64 content in MCP responses.',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string' },
        attachmentId: { type: 'string' },
      },
      required: ['planId', 'attachmentId'],
      additionalProperties: false,
    },
  },
  {
    name: 'directories_list',
    title: 'List Directories',
    description: 'List all directories that Helm knows about: configured folders plus directories that currently have plans or sessions. Results are consolidated by canonical project path so worktrees of the same repo appear as one entry.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'projects_list',
    title: 'List Projects',
    description: 'List all known projects with their IDs, names, canonical paths, directories, and root kinds. Call this before creating plans or sessions to discover which project directories Helm tracks.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'project_dirs_list',
    title: 'List Project Directories',
    description: 'List all directories (canonical and alternate) for a project by its ID.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
      },
      required: ['projectId'],
      additionalProperties: false,
    },
  },
  {
    name: 'project_dir_add',
    title: 'Add Project Directory',
    description: 'Add an alternate directory path to a project. The directory must not be the canonical path. Changes are persisted immediately.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        dirPath: { type: 'string' },
      },
      required: ['projectId', 'dirPath'],
      additionalProperties: false,
    },
  },
  {
    name: 'project_dir_remove',
    title: 'Remove Project Directory',
    description: 'Remove an alternate directory path from a project. Cannot remove the canonical path. Changes are persisted immediately.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        dirPath: { type: 'string' },
      },
      required: ['projectId', 'dirPath'],
      additionalProperties: false,
    },
  },
  {
    name: 'session_create',
    title: 'Create Session',
    description: 'Spawn a new CLI session in a configured working directory and give it a stable display name for later lookup. Call this when no suitable session exists yet and you need Helm to launch one. After spawning, wait readyAfterMs before calling session_send_text to deliver the first prompt — this ensures the CLI has finished its init sequence and large text is routed safely through the delivery pipeline.',
    inputSchema: {
      type: 'object',
      properties: {
        cliType: { type: 'string' },
        dirPath: { type: 'string' },
        name: { type: 'string' },
      },
      required: ['cliType', 'dirPath', 'name'],
      additionalProperties: false,
    },
  },
  {
    name: 'sessions_list',
    title: 'List Sessions',
    description: 'List currently known Helm sessions, optionally filtered to one working directory or project. Call this before sending text so you can target an existing session instead of spawning blindly.',
    inputSchema: {
      type: 'object',
      properties: {
        dirPath: { type: 'string' },
        projectId: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'session_get',
    title: 'Get Session',
    description: 'Get one Helm session by session ID or exact display name. Use this when you need session details, including its current working-plan pointer, before deciding what to send or update.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        name: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'session_send_text',
    title: 'Send Text To Session',
    description:
      'Send text to a running session PTY. ' +
      'DESTINATION: Provide sessionId (the target session that will receive the text). ' +
      'SENDER: Provide senderSessionId (your own session ID from the HELM_SESSION_ID env var). ' +
      'IMPORTANT: Destination and sender MUST be different sessions — self-messages are rejected. ' +
      'Text is always submitted atomically (Enter is appended automatically). ' +
      'After every inter-LLM send, call session_read_terminal on the recipient and verify the terminal tail shows the first words of the sent text, a new prompt, or a response starting; warn the user if no receipt evidence is visible. ' +
      'Optional expectsResponse marks HELM inter-LLM envelopes that expect a reply. ' +
      'RECEIVING RESPONSES: When the target session replies, Helm pastes a [HELM_MSG] envelope directly into the sender session\'s chatbox as a new user message — there is no polling or callback; the reply arrives as an inbound chat turn in your own session.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: '[DESTINATION] Target session ID — MUST be different from senderSessionId.',
        },
        text: { type: 'string' },
        senderSessionId: {
          type: 'string',
          description:
            '[SENDER] Your session ID — MUST equal the HELM_SESSION_ID environment variable injected by Helm at startup. ' +
            'Retrieve it with `echo $HELM_SESSION_ID` (bash) or read process.env.HELM_SESSION_ID (Node.js). ' +
            'IMPORTANT: must be DIFFERENT from the destination sessionId.',
        },
        expectsResponse: { type: 'boolean', default: false },
      },
      required: ['text', 'sessionId', 'senderSessionId'],
      additionalProperties: false,
    },
  },
  {
    name: 'session_send_input',
    title: 'Send Terminal Input To Session',
    description:
      'Send sequence-style terminal input to a running session PTY without HELM_MSG preamble. ' +
      'Use this for TUI/terminal automation: navigating menus, pressing keys, typing text. ' +
      'DESTINATION: Provide sessionId (the target session that will receive the input). ' +
      'SENDER: Provide senderSessionId (your own session ID from the HELM_SESSION_ID env var). ' +
      'IMPORTANT: Destination and sender MUST be different sessions — self-send is rejected. ' +
      'Supports sequence syntax: {Esc}, {Tab}, {Enter}, {ArrowDown}, {Ctrl+C}, {Wait 200}, literal text. ' +
      'No implicit Enter is appended unless impliedSubmit=true or the sequence includes {Enter}/{Send}. ' +
      'After sending input, call session_read_terminal on the recipient to verify the input was received.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: '[DESTINATION] Target session ID — MUST be different from senderSessionId.',
        },
        senderSessionId: {
          type: 'string',
          description:
            '[SENDER] Your session ID — MUST equal the HELM_SESSION_ID environment variable injected by Helm at startup.',
        },
        sequence: {
          type: 'string',
          description: 'Sequence-parser syntax to send: {Esc}, {Tab}, {Enter}, {ArrowDown}, {Ctrl+C}, {Wait 200}, literal text.',
        },
        impliedSubmit: { type: 'boolean', default: false },
        verify: { type: 'boolean', default: true },
      },
      required: ['sessionId', 'senderSessionId', 'sequence'],
      additionalProperties: false,
    },
  },
  {
    name: 'session_read_terminal',
    title: 'Read Session Terminal',
    description: 'Read the recent terminal tail for any known session by sessionId or exact name. Use this immediately after session_send_text handoffs to verify the recipient received the message and started responding. lines must be a positive integer (buffer holds up to 500). mode controls raw ANSI output, ANSI-stripped output, or both.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        name: { type: 'string' },
        lines: { type: 'number', minimum: 1 },
        mode: { type: 'string', enum: ['raw', 'stripped', 'both'] },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'session_set_working_plan',
    title: 'Set Session Working Plan',
    description: 'Update which plan the session row should show as currently being worked on, assigning the plan to that session when allowed. planId accepts either the canonical UUID or P-00xx human-readable ID. WHEN: call this immediately after claiming implementation work with plan_set_state status=coding so Helm shows the active plan badge on the session row; also call it whenever you intentionally move to a different plan item.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        name: { type: 'string' },
        planId: { type: 'string' },
      },
      required: ['planId'],
      additionalProperties: false,
    },
  },
  {
    name: 'session_info',
    title: 'Get Session Info',
    description: 'Retrieve current session context including MCP endpoint URL, AIAGENT state registry, available projects, and durable-context guidance. WHEN: call this at session startup before other Helm workflow actions, then immediately call session_set_aiagent_state for your current phase. Returns mandatory_rules, mcp_url, mcp_token, available_projects stubs (call projects_list for full details), and the canonical list of valid AIAGENT-* state tags.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'session_set_aiagent_state',
    title: 'Set Session AIAGENT State',
    description: 'Update the durable AIAGENT phase shown on a Helm session row. Provide either sessionId or exact session name, plus state. Valid states: planning (investigating, planning, or asking), implementing (editing, running commands, or testing), completed (work is verified and ready), idle (explicitly standing down). Use this instead of printing AIAGENT tags; Helm does not scrape terminal output for phase changes.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Destination Helm session UUID. Use this when available.' },
        name: { type: 'string', description: 'Exact Helm session display name. Alternative to sessionId.' },
        state: {
          type: 'string',
          enum: ['planning', 'implementing', 'completed', 'idle'],
          description: 'planning before investigation/questions, implementing before edits/tests/commands, completed after verification, idle only when explicitly standing down.',
        },
      },
      required: ['state'],
      additionalProperties: false,
    },
  },
  {
    name: 'session_close',
    title: 'Close Session',
    description: 'Kill the PTY process and remove a session from Helm. Use this when a task is complete and the session is no longer needed, or to recover from a stuck session. Accepts sessionId or session name.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        name: { type: 'string' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'notify_user',
    title: 'Notify User',
    description: 'Send an LLM-directed notification with smart delivery routing. Helm routes to toast, taskbar flash, bubble, or Telegram based on screen/window state. Returns delivered channel.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        name: { type: 'string' },
        title: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['title', 'content'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_app_visibility',
    title: 'Get App Visibility',
    description: 'Return the current app visibility/focus bucket, screen-lock state, and activeSessionId for notification routing decisions.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'telegram_status',
    title: 'Telegram Status',
    description: 'Report whether Telegram is enabled, configured, running, and available. Agents should use Telegram only for concise mobile-friendly urgent blockers or after the user has already engaged through Telegram. No bot token is returned.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'telegram_chat',
    title: 'Send Telegram Chat',
    description: 'Send concise mobile-friendly text to the user via Telegram. Provide sessionId or name. Lines must be short; do not send large wide logs, tables, or code blocks.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        name: { type: 'string' },
        message: { type: 'string' },
        filePath: { type: 'string', description: 'Optional absolute file path to send as attachment. System reads file from disk.' },
      },
      required: ['message'],
      additionalProperties: false,
    },
  },
  {
    name: 'telegram_channel_close',
    title: 'Close Telegram Channel',
    description: 'Close one MCP Telegram communication channel without deleting unrelated session topics.',
    inputSchema: {
      type: 'object',
      properties: {
        channelId: { type: 'string' },
      },
      required: ['channelId'],
      additionalProperties: false,
    },
  },
  {
    name: 'scheduler_create',
    title: 'Create Scheduler Entry',
    description: 'Create a new scheduled task. The task will spawn a CLI session at the specified time with the given prompt. Use scheduleKind "once", "interval" (min 1 minute interval), or "cron" with a cronExpression. scheduledTime is an ISO 8601 date string.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title' },
        description: { type: 'string', description: 'Optional task description' },
        initialPrompt: { type: 'string', description: 'Prompt to send to the CLI session' },
        cliType: { type: 'string', description: 'CLI type to spawn (e.g. claude-code)' },
        dirPath: { type: 'string', description: 'Working directory for the session' },
        scheduledTime: { type: 'string', description: 'ISO 8601 datetime for first execution' },
        scheduleKind: { type: 'string', enum: ['once', 'interval', 'cron'], description: 'once, interval, or cron (default: once)' },
        intervalMs: { type: 'number', description: 'Interval in ms for recurring tasks (min 60000)' },
        cronExpression: { type: 'string', description: 'Cron expression for cron schedules, e.g. 0 9 * * 1-5' },
        endDate: { type: 'string', description: 'Optional ISO 8601 end date for cron schedules' },
        planIds: { type: 'array', items: { type: 'string' }, description: 'Associated plan IDs' },
        mode: { type: 'string', enum: ['spawn', 'direct'], description: 'spawn new session or send to existing (default: spawn)' },
        targetSessionId: { type: 'string', description: 'Session ID for direct mode' },
      },
      required: ['title', 'initialPrompt', 'cliType', 'dirPath', 'scheduledTime'],
      additionalProperties: false,
    },
  },
  {
    name: 'scheduler_list',
    title: 'List Scheduler Entries',
    description: 'List all scheduled tasks.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'scheduler_get',
    title: 'Get Scheduler Entry',
    description: 'Get a scheduled task by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Task ID' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'scheduler_update',
    title: 'Update Scheduler Entry',
    description: 'Update a pending scheduled task. Only pending tasks can be updated. scheduledTime is an ISO 8601 date string.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Task ID' },
        title: { type: 'string' },
        description: { type: 'string' },
        initialPrompt: { type: 'string' },
        cliType: { type: 'string' },
        dirPath: { type: 'string' },
        scheduledTime: { type: 'string', description: 'ISO 8601 datetime' },
        scheduleKind: { type: 'string', enum: ['once', 'interval', 'cron'] },
        intervalMs: { type: 'number' },
        cronExpression: { type: 'string' },
        endDate: { type: 'string' },
        planIds: { type: 'array', items: { type: 'string' } },
        mode: { type: 'string', enum: ['spawn', 'direct'] },
        targetSessionId: { type: 'string' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'scheduler_cancel',
    title: 'Cancel Scheduler Entry',
    description: 'Cancel a pending scheduled task. Only pending tasks can be cancelled.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Task ID' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'scheduler_delete',
    title: 'Delete Scheduler Entry',
    description: 'Delete a scheduled task and cancel its pending run.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Task ID' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
];

