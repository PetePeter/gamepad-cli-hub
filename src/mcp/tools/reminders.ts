import { REQUIRED_PLAN_DESCRIPTION_SECTIONS } from './definitions.js';

export function getToolReminder(name: string): string {
  if (name === 'session_send_text') {
    return 'Reminder: for inter-LLM handoffs, submit must stay true/default. Now call session_read_terminal on the recipient and verify the tail shows the first words of the sent text, a new prompt, or a response starting; warn the user if no receipt evidence is visible.';
  }
  if (name === 'session_read_terminal') {
    return 'Reminder: after a handoff, inspect this terminal tail for receipt evidence. If the sent text or new recipient activity is not visible, report that uncertainty to the user.';
  }
  if (name === 'session_info') {
    return 'Reminder: now call session_set_aiagent_state for your current phase. If a Helm plan is assigned and you are implementing it, claim it with plan_set_state status=coding and sessionId, then call session_set_working_plan.';
  }
  if (name === 'plan_create') {
    return `Reminder: creating a plan does not assign ownership. Plan descriptions should include: ${REQUIRED_PLAN_DESCRIPTION_SECTIONS.join(', ')}. For blocking questions, create a separate "QUESTION: ..." plan and link it to the original blocked plan with plan_nextplan_link. When you begin implementation, explicitly call plan_set_state with status "coding" and your sessionId, then call session_set_working_plan.`;
  }
  if (name === 'plan_set_state') {
    return 'Reminder: ownership is explicit. Use session_set_working_plan after claiming work so Helm shows the session as working on this plan.';
  }
  if (name === 'plan_complete') {
    return 'Reminder: tell the user exactly what to test, then inspect followUpPlans and continue with any ready autoFollowUpPlans.';
  }
  if (name === 'sequence_list' || name === 'sequence_update' || name === 'sequence_memory_append') {
    return 'Reminder: sequence.sharedMemory is shared by every plan in that sequence. Re-read the sequence and pass expectedUpdatedAt when updating or appending to avoid overwriting another LLM.';
  }
  return '';
}
