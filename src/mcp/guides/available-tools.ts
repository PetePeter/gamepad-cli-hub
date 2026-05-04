/**
 * Static list of all MCP tools exposed by Helm.
 * Extracted from session-info-guide.ts to keep that file under 100 lines.
 */

import type { McpToolSummary } from '../helm-control-service.js';
import { REQUIRED_PLAN_DESCRIPTION_SECTIONS } from './agent-plan-guide.js';

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
    { name: 'scheduled_task_create', title: 'Create Scheduled Task', description: 'Create a scheduled task that spawns a CLI session at a specific time with a prompt. Supports once, interval, and cron modes.' },
    { name: 'scheduled_task_list', title: 'List Scheduled Tasks', description: 'List all scheduled tasks.' },
    { name: 'scheduled_task_get', title: 'Get Scheduled Task', description: 'Get a scheduled task by ID.' },
    { name: 'scheduled_task_update', title: 'Update Scheduled Task', description: 'Update a pending scheduled task. Only pending tasks can be updated.' },
    { name: 'scheduled_task_cancel', title: 'Cancel Scheduled Task', description: 'Cancel a pending scheduled task.' },
    { name: 'scheduler:create', title: 'Create Scheduler Entry', description: 'Alias for scheduled_task_create.' },
    { name: 'scheduler:list', title: 'List Scheduler Entries', description: 'Alias for scheduled_task_list.' },
    { name: 'scheduler:get', title: 'Get Scheduler Entry', description: 'Alias for scheduled_task_get.' },
    { name: 'scheduler:update', title: 'Update Scheduler Entry', description: 'Alias for scheduled_task_update.' },
    { name: 'scheduler:delete', title: 'Delete Scheduler Entry', description: 'Delete a scheduled task and cancel its pending run.' },
  ];
}
