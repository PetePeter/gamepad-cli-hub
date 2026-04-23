<template>
  <Teleport to="body">
    <div v-if="isVisible" class="modal-overlay modal--visible esc-protection-modal">
      <div class="modal-content esc-protection-content">
        <p class="esc-protection-message">
          If you really meant ESC, press it again!
        </p>
        <p class="esc-protection-hint">
          Otherwise, any other key to cancel and dismiss
        </p>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { useModalStack, type InterceptKey } from '../../composables/useModalStack.js';
import { useEscProtection } from '../../composables/useEscProtection.js';

const stack = useModalStack();
const escProtection = useEscProtection();

const isVisible = computed(() => escProtection.isProtecting.value);

// Watch for visibility changes and update modal stack
watch(isVisible, (newVal) => {
  if (newVal) {
    stack.push({
      id: 'escProtection',
      handler: () => false,
      interceptKeys: new Set(['escape'] as InterceptKey[]),
    });
  } else {
    stack.pop('escProtection');
  }
});
</script>

<style scoped>
.esc-protection-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.esc-protection-content {
  background: #222;
  border: 1px solid #666;
  border-radius: 8px;
  padding: 32px;
  max-width: 400px;
  text-align: center;
}

.esc-protection-message {
  font-size: 18px;
  font-weight: 500;
  margin: 0 0 16px 0;
  color: #fff;
}

.esc-protection-hint {
  font-size: 14px;
  margin: 0;
  color: #aaa;
}
</style>
