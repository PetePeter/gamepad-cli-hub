import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

export interface LlmNotification {
  id: string;
  sessionId: string;
  title: string;
  content: string;
}

export const useLlmNotificationsStore = defineStore('llmNotifications', () => {
  const notifications = ref<Map<string, LlmNotification>>(new Map());

  const bySession = computed(() => notifications.value);

  function add(input: { sessionId: string; title: string; content: string }): void {
    notifications.value = new Map(notifications.value).set(input.sessionId, {
      id: `${input.sessionId}-${Date.now()}`,
      sessionId: input.sessionId,
      title: input.title,
      content: input.content,
    });
  }

  function dismiss(sessionId: string): void {
    if (!notifications.value.has(sessionId)) return;
    const next = new Map(notifications.value);
    next.delete(sessionId);
    notifications.value = next;
  }

  function clear(): void {
    notifications.value = new Map();
  }

  return { notifications, bySession, add, dismiss, clear };
});
