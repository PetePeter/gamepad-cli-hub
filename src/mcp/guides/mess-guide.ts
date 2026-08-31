/** Agent-facing guidance for durable project Mess. */
export function buildMessGuide(): string {
  return `\
[mess]
description = "Durable local project conversation for coordination and handoff."
tools = ["mess_post", "mess_check", "mess_history"]

[rules]
rule_1 = "mess_post never touches a PTY; it stores a bounded message for the authenticated local session's project."
rule_2 = "mess_check returns only unread bounded deltas and advances the caller cursor; an empty poll is exactly {new:0}."
rule_3 = "mess_history is cursor-neutral and bounded; it is the route to retained history older than the join horizon."
rule_4 = "Labels are for humans; the wire uses from/to labels and renders a direct message to the caller as to=me."
rule_5 = "Coordination is SOCIAL CONVENTION ONLY: Mess provides no lock, claim, conflict detection, or auto-release."
rule_6 = "Fleet peer proxy callers are rejected; Mess is local-only and never trusts a remote project or path."
`;
}
