<script setup lang="ts">
/**
 * Fixed bottom-right toast stack.
 *
 * Mount once in App.vue. Each toast auto-dismisses (managed by useToast composable).
 * Listens for incoming plan IPC events and shows success/error toasts.
 */
import { onMounted, onUnmounted } from 'vue';
import { useToast } from '../composables/useToast.js';

const { toasts, removeToast, addToast } = useToast();

const cleanups: (() => void)[] = [];

onMounted(() => {
  cleanups.push(
    window.gamepadCli.onPlanIncomingImported(({ title }) => {
      addToast({ message: `📥 Plan imported: "${title}"`, type: 'success' });
    }),
    window.gamepadCli.onPlanIncomingError(({ filename, error }) => {
      addToast({ message: `⚠️ Plan import failed: ${filename} — ${error}`, type: 'error', duration: 8000 });
    }),
  );
});

onUnmounted(() => {
  cleanups.forEach(fn => fn());
});
</script>

<template>
  <Teleport to="body">
    <div class="toast-stack" role="status" aria-live="polite">
      <TransitionGroup name="toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          :class="['toast', `toast--${toast.type}`]"
          @click="removeToast(toast.id)"
        >
          {{ toast.message }}
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-stack {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
  max-width: 360px;
}

.toast {
  padding: 10px 14px;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.4;
  color: #fff;
  background: #333;
  box-shadow: 0 2px 8px rgba(0,0,0,.4);
  pointer-events: all;
  cursor: pointer;
  word-break: break-word;
}

.toast--success { background: #2a6f2a; }
.toast--error   { background: #7a2020; }
.toast--info    { background: #1e3d6e; }

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(20px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
</style>
