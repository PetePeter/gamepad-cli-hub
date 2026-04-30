<script setup lang="ts">
defineProps<{
  title: string;
  content: string;
}>();

const emit = defineEmits<{
  dismiss: [];
}>();
</script>

<template>
  <div class="notification-bubble">
    <div class="notification-bubble__body">
      <strong class="notification-bubble__title">{{ title }}</strong>
      <span class="notification-bubble__content">{{ content }}</span>
    </div>
    <button
      class="notification-bubble__dismiss"
      title="Dismiss notification"
      @click.stop="emit('dismiss')"
    >
      x
    </button>
  </div>
</template>

<style scoped>
.notification-bubble {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 8px;
  padding: 8px 10px;
  border: 1px solid rgba(68, 204, 68, 0.55);
  border-radius: 8px;
  background: rgba(20, 48, 28, 0.92);
  color: var(--text-primary);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
}

.notification-bubble__body {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.notification-bubble__title,
.notification-bubble__content {
  overflow-wrap: anywhere;
  line-height: 1.25;
}

.notification-bubble__title {
  font-size: var(--font-size-xs);
}

.notification-bubble__content {
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
}

.notification-bubble__dismiss {
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  border: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  color: var(--text-primary);
  cursor: pointer;
}
</style>
