<script setup lang="ts">
/**
 * RuntimeGroupCloseDialog — 3-way dialog shown when closing a runtime group that
 * still has member sessions.
 *
 *  - Cancel                       → abort.
 *  - Close group, keep sessions   → dissolve the group; members revert to their
 *                                   directory grouping.
 *  - Close group and all sessions → close every member session (each may land in
 *                                   the recycle bin, tagged with the group), then
 *                                   remove the group.
 *
 * Empty groups never open this dialog (the caller closes them directly).
 */
import { ref, computed } from 'vue';
import ConfirmDialog from './ConfirmDialog.vue';

const MODAL_ID = 'runtime-group-close';

const props = defineProps<{
  visible: boolean;
  groupName: string;
  memberCount: number;
}>();

const emit = defineEmits<{
  (e: 'confirm', mode: 'keep' | 'closeAll'): void;
  (e: 'cancel'): void;
  (e: 'update:visible', value: boolean): void;
}>();

const selectedIndex = ref(0);
const dialog = ref<InstanceType<typeof ConfirmDialog> | null>(null);

const buttons = computed(() => [
  { id: 'keep', label: '🗂️➜📁 Close group, keep sessions' },
  { id: 'closeAll', label: '✕ Close group and all its sessions', variant: 'danger' as const },
  { id: 'cancel', label: 'Cancel' },
]);

function handleButton(button: string): boolean {
  dialog.value?.syncSelectedIndex(selectedIndex.value);
  return dialog.value?.handleButton(button) ?? true;
}

function onAction(action: string): void {
  if (action === 'keep') emit('confirm', 'keep');
  else if (action === 'closeAll') emit('confirm', 'closeAll');
}

defineExpose({ handleButton, selectedIndex });
</script>

<template>
  <ConfirmDialog
    ref="dialog"
    :visible="visible"
    :modal-id="MODAL_ID"
    :title="`Close group “${groupName}”?`"
    aria-label="Close runtime group confirmation"
    :buttons="buttons"
    v-model:selected-index="selectedIndex"
    cancel-action-id="cancel"
    direction-mode="any"
    @action="onAction"
    @cancel="emit('cancel')"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="runtime-group-close-body">
      This group has <strong>{{ memberCount }}</strong>
      active session{{ memberCount === 1 ? '' : 's' }}. What should happen to them?
    </div>
  </ConfirmDialog>
</template>

<style scoped>
.runtime-group-close-body {
  padding: var(--spacing-md, 12px) var(--spacing-lg, 16px);
  line-height: 1.5;
}
</style>
