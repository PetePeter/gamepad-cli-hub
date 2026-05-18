import { logger } from '../../utils/logger.js';
import type { HelmControlService } from '../helm-control-service.js';
import type { AuthContext } from './types.js';
import {
  asAiagentState,
  asContextBindingTargetType,
  asPlanStatus,
  asPlanTypeOrNull,
  asString,
  asTerminalOutputMode,
  requireBooleanResult,
  requireResult,
} from './validation.js';

export interface McpToolDispatcherDeps {
  service: HelmControlService;
  setPlanStateWithValidation: (
    id: string,
    status: 'planning' | 'ready' | 'coding' | 'review' | 'blocked',
    stateInfo?: string,
    sessionId?: string,
  ) => unknown;
  completePlanWithValidation: (id: string, documentation: string) => unknown;
}

export async function callMcpTool(
  deps: McpToolDispatcherDeps,
  name: string,
  args: Record<string, unknown>,
  authContext: AuthContext,
): Promise<unknown> {
  const { service, setPlanStateWithValidation, completePlanWithValidation } = deps;

    logger.info(`[MCP] callTool: ${name} | session=${authContext.sessionId ?? 'anonymous'} (${authContext.sessionName ?? '-'})`);
    switch (name) {
      case 'plans_list':
        return service.listPlans(asString(args.dirPath, 'dirPath is required'));
      case 'plans_summary':
        return service.plansSummary(asString(args.dirPath, 'dirPath is required'));
      case 'tools_list':
        return service.listClis();
      case 'skills_list':
        return service.listSkills({
          ...(typeof args.projectId === 'string' ? { projectId: args.projectId } : {}),
          ...(typeof args.dirPath === 'string' ? { dirPath: args.dirPath } : {}),
        });
      case 'skills_get': {
        const type = typeof args.type === 'string' ? args.type : undefined;
        if (type && args.id !== undefined) {
          throw new Error('Pass either id or type to skills_get, not both');
        }
        if (type) {
          return requireResult(
            service.resolveSkill(type, {
              ...(typeof args.projectId === 'string' ? { projectId: args.projectId } : {}),
              ...(typeof args.dirPath === 'string' ? { dirPath: args.dirPath } : {}),
            }),
            `Skill not found for type: ${type}`,
          );
        }
        return requireResult(
          service.getSkill(asString(args.id, 'id is required')),
          `Skill not found: ${asString(args.id, 'id is required')}`,
        );
      }
      case 'skills_submit_feedback':
        return service.submitSkillFeedback(
          asString(args.skillId, 'skillId is required'),
          Number(args.stars),
          asString(args.summary, 'summary is required'),
          typeof args.improvement === 'string' ? args.improvement : undefined,
          authContext,
        );
      case 'skills_create':
        return service.createSkill({
          name: asString(args.name, 'name is required'),
          ...(typeof args.description === 'string' ? { description: args.description } : {}),
          ...(typeof args.body === 'string' ? { body: args.body } : {}),
          ...(typeof args.type === 'string' ? { type: args.type } : {}),
          ...(typeof args.aiAmendable === 'boolean' ? { aiAmendable: args.aiAmendable } : {}),
          ...(typeof args.allProjects === 'boolean' ? { allProjects: args.allProjects } : {}),
          ...(Array.isArray(args.projectIds) ? { projectIds: args.projectIds.filter((item): item is string => typeof item === 'string') } : {}),
        });
      case 'skills_update': {
        const id = asString(args.id, 'id is required');
        const updates: Record<string, unknown> = {};
        for (const field of ['name', 'description', 'body', 'type', 'aiAmendable', 'allProjects', 'projectIds'] as const) {
          if (args[field] !== undefined) updates[field] = args[field];
        }
        if (Array.isArray(updates.projectIds)) {
          updates.projectIds = updates.projectIds.filter((item): item is string => typeof item === 'string');
        }
        return service.updateSkill(id, updates);
      }
      case 'skills_delete':
        return {
          deleted: requireBooleanResult(
            service.deleteSkill(asString(args.id, 'id is required')),
            `Skill not found: ${asString(args.id, 'id is required')}`,
          ),
        };
      case 'plan_get':
        return requireResult(
          service.getPlan(asString(args.id, 'id is required')),
          `Plan not found: ${asString(args.id, 'id is required')}`,
        );
      case 'plan_create':
        return service.createPlan(
          asString(args.dirPath, 'dirPath is required'),
          asString(args.title, 'title is required'),
          asString(args.description, 'description is required'),
          typeof args.type === 'string' ? (args.type as 'bug' | 'feature' | 'research') : undefined,
          typeof args.autoImplement === 'boolean' ? args.autoImplement : undefined,
        );
      case 'plan_update':
        return requireResult(
          service.updatePlan(asString(args.id, 'id is required'), {
            ...(typeof args.title === 'string' ? { title: args.title } : {}),
            ...(typeof args.description === 'string' ? { description: args.description } : {}),
            ...(Object.prototype.hasOwnProperty.call(args, 'type') ? { type: asPlanTypeOrNull(args.type) } : {}),
            ...(typeof args.autoImplement === 'boolean' ? { autoImplement: args.autoImplement } : {}),
          }),
          `Plan not found: ${asString(args.id, 'id is required')}`,
        );
      case 'plan_delete':
        return {
          deleted: requireBooleanResult(
            service.deletePlan(asString(args.id, 'id is required')),
            `Plan not found: ${asString(args.id, 'id is required')}`,
          ),
        };
      case 'plan_set_state':
        return setPlanStateWithValidation(
          asString(args.id, 'id is required'),
          asPlanStatus(args.status),
          typeof args.stateInfo === 'string' ? args.stateInfo : undefined,
          typeof args.sessionId === 'string' ? args.sessionId : undefined,
        );
      case 'plan_complete':
        return completePlanWithValidation(
          asString(args.id, 'id is required'),
          asString(args.documentation, 'documentation is required (minimum 10 characters)'),
        );
      case 'plan_context_list':
        return service.listPlanContexts(asString(args.planId, 'planId is required'));
      case 'plan_reopen':
        return requireResult(
          service.reopenPlan(asString(args.id, 'id is required')),
          `Plan ${asString(args.id, 'id is required')} could not be reopened — it may not be in done state`,
        );
      case 'plan_nextplan_link':
        service.linkPlans(
          asString(args.fromId, 'fromId is required'),
          asString(args.toId, 'toId is required'),
        );
        return { linked: true };
      case 'plan_nextplan_unlink':
        service.unlinkPlans(
          asString(args.fromId, 'fromId is required'),
          asString(args.toId, 'toId is required'),
        );
        return { unlinked: true };
      case 'sequence_list':
        return service.listPlanSequences({
          ...(typeof args.dirPath === 'string' ? { dirPath: args.dirPath } : {}),
          ...(typeof args.planId === 'string' ? { planRef: args.planId } : {}),
        });
      case 'sequence_get':
        return requireResult(
          service.getPlanSequence(asString(args.id, 'id is required')),
          `Sequence not found: ${asString(args.id, 'id is required')}`,
        );
      case 'sequence_create':
        return service.createPlanSequence({
          dirPath: asString(args.dirPath, 'dirPath is required'),
          title: asString(args.title, 'title is required'),
          ...(typeof args.missionStatement === 'string' ? { missionStatement: args.missionStatement } : {}),
          ...(typeof args.sharedMemory === 'string' ? { sharedMemory: args.sharedMemory } : {}),
        });
      case 'sequence_update':
        return service.updatePlanSequence(
          asString(args.id, 'id is required'),
          {
            ...(typeof args.title === 'string' ? { title: args.title } : {}),
            ...(typeof args.missionStatement === 'string' ? { missionStatement: args.missionStatement } : {}),
            ...(typeof args.sharedMemory === 'string' ? { sharedMemory: args.sharedMemory } : {}),
            ...(typeof args.order === 'number' ? { order: args.order } : {}),
            ...(typeof args.expectedUpdatedAt === 'number' ? { expectedUpdatedAt: args.expectedUpdatedAt } : {}),
          },
        );
      case 'sequence_memory_append':
        return service.appendPlanSequenceMemory(
          asString(args.id, 'id is required'),
          asString(args.text, 'text is required'),
          typeof args.expectedUpdatedAt === 'number' ? args.expectedUpdatedAt : undefined,
        );
      case 'sequence_delete':
        return {
          deleted: requireBooleanResult(
            service.deletePlanSequence(asString(args.id, 'id is required')),
            `Sequence not found: ${asString(args.id, 'id is required')}`,
          ),
        };
      case 'sequence_assign':
        return service.assignPlanSequence(
          asString(args.planId, 'planId is required'),
          args.sequenceId === null ? null : asString(args.sequenceId, 'sequenceId is required or null'),
        );
      case 'context_list':
        return service.listContexts(asString(args.projectId, 'projectId is required'));
      case 'context_create':
        return service.createContext({
          projectId: asString(args.projectId, 'projectId is required'),
          title: asString(args.title, 'title is required'),
          ...(typeof args.type === 'string' ? { type: args.type } : {}),
          ...(args.permission === 'readonly' || args.permission === 'writable' ? { permission: args.permission } : {}),
          ...(typeof args.content === 'string' ? { content: args.content } : {}),
          ...(typeof args.x === 'number' || args.x === null ? { x: args.x as number | null } : {}),
          ...(typeof args.y === 'number' || args.y === null ? { y: args.y as number | null } : {}),
        });
      case 'context_update':
        return service.updateContext(asString(args.id, 'id is required'), {
          ...(typeof args.title === 'string' ? { title: args.title } : {}),
          ...(typeof args.type === 'string' ? { type: args.type } : {}),
          ...(args.permission === 'readonly' || args.permission === 'writable' ? { permission: args.permission } : {}),
          ...(typeof args.content === 'string' ? { content: args.content } : {}),
          ...(typeof args.x === 'number' || args.x === null ? { x: args.x as number | null } : {}),
          ...(typeof args.y === 'number' || args.y === null ? { y: args.y as number | null } : {}),
        });
      case 'context_delete':
        return {
          deleted: requireBooleanResult(
            service.deleteContext(asString(args.id, 'id is required')),
            `Context not found: ${asString(args.id, 'id is required')}`,
          ),
        };
      case 'context_get':
        return requireResult(
          service.getContext(asString(args.id, 'id is required')),
          `Context not found: ${asString(args.id, 'id is required')}`,
        );
      case 'context_append':
        return service.appendContext(
          asString(args.id, 'id is required'),
          asString(args.text, 'text is required'),
          typeof args.expectedUpdatedAt === 'number' ? args.expectedUpdatedAt : undefined,
        );
      case 'context_set_position':
        return service.setContextPosition(
          asString(args.id, 'id is required'),
          typeof args.x === 'number' || args.x === null ? args.x as number | null : null,
          typeof args.y === 'number' || args.y === null ? args.y as number | null : null,
        );
      case 'context_bind':
        return {
          bound: requireBooleanResult(
            service.bindContext(
              asString(args.id, 'id is required'),
              asContextBindingTargetType(args.targetType),
              asString(args.targetId, 'targetId is required'),
            ),
            `Context could not be bound to ${asString(args.targetId, 'targetId is required')}`,
          ),
        };
      case 'context_unbind':
        return {
          unbound: requireBooleanResult(
            service.unbindContext(
              asString(args.id, 'id is required'),
              asContextBindingTargetType(args.targetType),
              asString(args.targetId, 'targetId is required'),
            ),
            `Context binding not found for ${asString(args.targetId, 'targetId is required')}`,
          ),
        };
      case 'plan_attachment_list':
        return service.listPlanAttachments(asString(args.planId, 'planId is required'));
      case 'plan_attachment_add':
        return service.addPlanAttachment(
          asString(args.planId, 'planId is required'),
          {
            filename: asString(args.filename, 'filename is required'),
            ...(typeof args.text === 'string' ? { text: args.text } : {}),
            ...(typeof args.contentBase64 === 'string' ? { contentBase64: args.contentBase64 } : {}),
            ...(typeof args.contentType === 'string' ? { contentType: args.contentType } : {}),
          },
        );
      case 'plan_attachment_delete':
        return {
          deleted: requireBooleanResult(
            service.deletePlanAttachment(
              asString(args.planId, 'planId is required'),
              asString(args.attachmentId, 'attachmentId is required'),
            ),
            `Attachment not found: ${asString(args.attachmentId, 'attachmentId is required')}`,
          ),
        };
      case 'plan_attachment_get':
        return service.getPlanAttachment(
          asString(args.planId, 'planId is required'),
          asString(args.attachmentId, 'attachmentId is required'),
        );
      case 'directories_list':
        return service.listDirectories();
      case 'projects_list':
        return service.listProjects();
      case 'project_dirs_list':
        return service.listProjectDirs(asString(args.projectId, 'projectId is required'));
      case 'project_dir_add':
        return service.addProjectDir(
          asString(args.projectId, 'projectId is required'),
          asString(args.dirPath, 'dirPath is required'),
        );
      case 'project_dir_remove':
        return service.removeProjectDir(
          asString(args.projectId, 'projectId is required'),
          asString(args.dirPath, 'dirPath is required'),
        );
      case 'session_create':
        return service.spawnCli(
          asString(args.cliType, 'cliType is required'),
          asString(args.dirPath, 'dirPath is required'),
          asString(args.name, 'name is required'),
        );
      case 'sessions_list':
        return service.listSessions(
          typeof args.dirPath === 'string' ? args.dirPath : undefined,
          typeof args.projectId === 'string' ? args.projectId : undefined,
        );
      case 'session_get':
        return requireResult(
          service.getSession(asString(args.sessionId ?? args.name, 'sessionId or name is required')),
          `Session not found: ${asString(args.sessionId ?? args.name, 'sessionId or name is required')}`,
        );
      case 'session_send_text': {
        const explicitSenderId = typeof args.senderSessionId === 'string' ? args.senderSessionId : undefined;
        const senderSessionId = explicitSenderId ?? authContext.sessionId;
        if (!senderSessionId) {
          throw new Error(
            'senderSessionId is required — use the HELM_SESSION_ID environment variable injected by Helm at startup.',
          );
        }
        // Session-scoped tokens are trusted; global-token callers must verify against known sessions.
        let senderSessionName: string;
        if (!explicitSenderId && authContext.sessionName) {
          senderSessionName = authContext.sessionName;
        } else {
          const knownSessions = service.listSessions();
          const senderSession = knownSessions.find((s) => s.id === senderSessionId);
          if (!senderSession) {
            throw new Error(
              `Unknown sender session: senderSessionId "${senderSessionId}" does not match any active Helm session. ` +
                'senderSessionId must be the exact value of the HELM_SESSION_ID environment variable ' +
                'that Helm injected into your session at startup — do not guess or construct this value.',
            );
          }
          senderSessionName = senderSession.name;
        }
        return service.sendTextToSession(
          asString(args.sessionId, 'sessionId is required'),
          asString(args.text, 'text is required'),
          {
            senderSessionId,
            senderSessionName,
            ...(typeof args.expectsResponse === 'boolean' ? { expectsResponse: args.expectsResponse } : {}),
          },
        );
      }
      case 'session_send_input': {
        const explicitSenderId = typeof args.senderSessionId === 'string' ? args.senderSessionId : undefined;
        const senderSessionId = explicitSenderId ?? authContext.sessionId;
        if (!senderSessionId) {
          throw new Error(
            'senderSessionId is required — use the HELM_SESSION_ID environment variable injected by Helm at startup.',
          );
        }
        let senderSessionName: string;
        if (!explicitSenderId && authContext.sessionName) {
          senderSessionName = authContext.sessionName;
        } else {
          const knownSessions = service.listSessions();
          const senderSession = knownSessions.find((s) => s.id === senderSessionId);
          if (!senderSession) {
            throw new Error(
              `Unknown sender session: senderSessionId "${senderSessionId}" does not match any active Helm session. ` +
                'senderSessionId must be the exact value of the HELM_SESSION_ID environment variable ' +
                'that Helm injected into your session at startup — do not guess or construct this value.',
            );
          }
          senderSessionName = senderSession.name;
        }
        return service.sendInputToSession(
          asString(args.sessionId, 'sessionId is required'),
          asString(args.sequence, 'sequence is required'),
          {
            senderSessionId,
            senderSessionName,
            ...(typeof args.impliedSubmit === 'boolean' ? { impliedSubmit: args.impliedSubmit } : {}),
            ...(typeof args.verify === 'boolean' ? { verify: args.verify } : {}),
          },
        );
      }
      case 'session_read_terminal':
        return service.readSessionTerminal(
          asString(args.sessionId ?? args.name, 'sessionId or name is required'),
          typeof args.lines === 'number' ? args.lines : undefined,
          asTerminalOutputMode(args.mode),
        );
      case 'session_set_working_plan':
        return service.setSessionWorkingPlan(
          asString(args.sessionId ?? args.name, 'sessionId or name is required'),
          asString(args.planId, 'planId is required'),
        );
      case 'session_info':
        return service.getSessionInfo(authContext);
      case 'session_set_aiagent_state':
        return service.setAiagentState(
          asString(args.sessionId ?? args.name, 'sessionId or name is required'),
          asAiagentState(args.state, 'state must be one of planning, implementing, completed, or idle'),
        );
      case 'session_close':
        return service.closeSession(asString(args.sessionId ?? args.name, 'sessionId or name is required'));
      case 'notify_user':
        return service.notifyUser(
          asString(args.sessionId ?? args.name, 'sessionId or name is required'),
          asString(args.title, 'title is required'),
          asString(args.content, 'content is required'),
        );
      case 'get_app_visibility':
        return service.getAppVisibility();
      case 'telegram_status':
        return service.getTelegramStatus();
      case 'telegram_chat': {
        const sessionRef = asString(args.sessionId ?? args.name, 'sessionId or name is required');
        const message = asString(args.message, 'message is required');
        const att = args.attachment as Record<string, unknown> | undefined;
        const attachment = typeof att === 'object' && att
          ? { name: asString(att.name, 'attachment.name is required'), data: asString(att.data, 'attachment.data is required'), mime: asString(att.mime, 'attachment.mime is required') }
          : undefined;
        return service.sendTelegramChat(sessionRef, message, attachment);
      }
      case 'telegram_channel_close':
        return service.closeTelegramChannel(asString(args.channelId, 'channelId is required'));
      case 'scheduler_create': {
        const planIds = (args.planIds as string[] | undefined) ?? [];
        return service.createScheduledTask({
          title: asString(args.title, 'title is required'),
          description: args.description as string | undefined,
          initialPrompt: asString(args.initialPrompt, 'initialPrompt is required'),
          cliType: asString(args.cliType, 'cliType is required'),
          dirPath: asString(args.dirPath, 'dirPath is required'),
          scheduledTime: asString(args.scheduledTime, 'scheduledTime is required'),
          scheduleKind: args.scheduleKind as 'once' | 'interval' | 'cron' | undefined,
          intervalMs: typeof args.intervalMs === 'number' ? args.intervalMs : undefined,
          cronExpression: args.cronExpression as string | undefined,
          endDate: args.endDate as string | undefined,
          planIds,
          mode: args.mode as 'spawn' | 'direct' | undefined,
          targetSessionId: args.targetSessionId as string | undefined,
        });
      }
      case 'scheduler_list':
        return service.listScheduledTasks();
      case 'scheduler_get':
        return service.getScheduledTask(asString(args.id, 'id is required'));
      case 'scheduler_update': {
        const id = asString(args.id, 'id is required');
        const updates: Record<string, unknown> = { ...args };
        delete updates.id;
        if (typeof updates.planIds === 'undefined') delete updates.planIds;
        return service.updateScheduledTask(id, updates as Parameters<typeof service.updateScheduledTask>[1]);
      }
      case 'scheduler_cancel':
        return service.cancelScheduledTask(asString(args.id, 'id is required'));
      case 'scheduler_delete':
        return service.deleteScheduledTask(asString(args.id, 'id is required'));
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
}
