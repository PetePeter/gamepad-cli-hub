<script setup lang="ts">
/**
 * NotificationCarousel.vue — Single-slot notification display per session.
 *
 * Shows one notification at a time with prev/next navigation.
 * Replaces the stacked NotificationBubble list for a compact per-session view.
 */
import { ref, computed, nextTick, watch } from 'vue';

const props = defineProps<{
  notifications: Array<{ id: string; title: string; content: string; createdAt?: number }>;
  sessionId: string;
}>();

const emit = defineEmits<{
  dismiss: [notificationId: string];
  dismissAll: [sessionId: string];
}>();

/** Current visible notification index, clamped on change. */
const currentIndex = ref(0);

/** The notification currently displayed in the carousel slot. */
const current = computed(() => props.notifications[currentIndex.value]);

/** Navigate to previous notification. */
function prev(): void {
  currentIndex.value = Math.max(0, currentIndex.value - 1);
}

/** Navigate to next notification. */
function next(): void {
  currentIndex.value = Math.min(props.notifications.length - 1, currentIndex.value + 1);
}

/** Dismiss the currently visible notification and clamp the index. */
function dismissCurrent(): void {
  const id = current.value.id;
  emit('dismiss', id);
  nextTick(() => {
    currentIndex.value = Math.min(currentIndex.value, props.notifications.length - 1);
  });
}

/** Keep index in bounds when notifications are added or removed externally. */
watch(() => props.notifications.length, (n) => {
  if (currentIndex.value >= n) {
    currentIndex.value = Math.max(0, n - 1);
  }
});

function formatTime(ts?: number): string {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
</script>

<template>
  <div class="notification-carousel" v-if="notifications.length > 0">
    <div class="carousel-header">
      <span class="carousel-label">Notification{{ notifications.length > 1 ? 's' : '' }}</span>
      <span class="carousel-counter" v-if="notifications.length > 1">{{ currentIndex + 1 }} / {{ notifications.length }}</span>
      <button class="carousel-clear" @click.stop="emit('dismissAll', sessionId)">&times;</button>
    </div>
    <div class="carousel-body">
      <div class="carousel-nav">
        <div v-if="notifications.length > 1" class="nav-arrow-slot">
          <button
            class="nav-arrow"
            :disabled="currentIndex === 0"
            @click.stop="prev"
          >&#9664;</button>
        </div>
        <div class="carousel-content">
          <div class="carousel-title">{{ current.title }}</div>
          <div class="carousel-text">{{ current.content }}</div>
        </div>
        <div v-if="notifications.length > 1" class="nav-arrow-slot">
          <button
            class="nav-arrow"
            :disabled="currentIndex === notifications.length - 1"
            @click.stop="next"
          >&#9654;</button>
        </div>
      </div>
    </div>
    <div class="carousel-footer">
      <span class="carousel-timestamp">{{ formatTime(current.createdAt) }}</span>
      <button class="dismiss-btn" @click.stop="dismissCurrent">Dismiss</button>
    </div>
  </div>
</template>

<style scoped>
.notification-carousel {
  margin-top: 8px;
  border: 1px solid rgba(68, 204, 68, 0.55);
  border-radius: 8px;
  background: rgba(20, 48, 28, 0.92);
  color: var(--text-primary);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
  overflow: hidden;
}

.carousel-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-bottom: 1px solid rgba(68, 204, 68, 0.2);
}

.carousel-label {
  font-size: var(--font-size-xs);
  font-weight: 600;
  flex: 1;
}

.carousel-counter {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}

.carousel-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}

.carousel-clear:hover {
  background: rgba(255, 255, 255, 0.22);
}

.carousel-body {
  padding: 6px 10px;
}

.carousel-nav {
  display: flex;
  align-items: center;
  gap: 8px;
}

.nav-arrow-slot {
  flex: 0 0 auto;
  display: flex;
  align-items: flex-start;
  padding-top: 2px;
}

.nav-arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 10px;
  line-height: 1;
}

.nav-arrow:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.18);
}

.nav-arrow:disabled {
  opacity: 0.3;
  cursor: default;
}

.carousel-content {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 2px;
}

.carousel-title {
  font-size: var(--font-size-xs);
  font-weight: 600;
  overflow-wrap: anywhere;
  line-height: 1.25;
}

.carousel-text {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  overflow-wrap: anywhere;
  line-height: 1.25;
}

.carousel-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 4px 10px 6px;
}

.carousel-timestamp {
  flex: 1;
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}

.dismiss-btn {
  padding: 2px 10px;
  border: 1px solid rgba(68, 204, 68, 0.4);
  border-radius: 4px;
  background: rgba(68, 204, 68, 0.12);
  color: var(--text-primary);
  cursor: pointer;
  font-size: var(--font-size-xs);
  line-height: 1.4;
}

.dismiss-btn:hover {
  background: rgba(68, 204, 68, 0.25);
}
</style>
