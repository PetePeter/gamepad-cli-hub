<script setup lang="ts">
import { ref } from 'vue';

const props = withDefaults(defineProps<{
  label?: string;
}>(), {
  label: 'Add',
});

const emit = defineEmits<{
  primary: [];
  select: [value: 'plan' | 'context' | 'sequence'];
}>();

const open = ref(false);

function toggleMenu(): void {
  open.value = !open.value;
}

function onPrimary(): void {
  emit('primary');
  open.value = false;
}

function onSelect(value: 'plan' | 'context' | 'sequence'): void {
  emit('select', value);
  open.value = false;
}
</script>

<template>
  <div class="split-add">
    <button class="split-add__primary" @click="onPrimary">+ {{ label }}</button>
    <button class="split-add__toggle" @click="toggleMenu">▾</button>
    <div v-if="open" class="split-add__menu">
      <button class="split-add__item" @click="onSelect('plan')">Add Plan</button>
      <button class="split-add__item" @click="onSelect('context')">Add Context</button>
      <button class="split-add__item" @click="onSelect('sequence')">Add Sequence</button>
    </div>
  </div>
</template>

<style scoped>
.split-add {
  position: relative;
  display: inline-flex;
  align-items: stretch;
}

.split-add__primary,
.split-add__toggle {
  background: #1a1a1a;
  border: 1px solid #333;
  color: #ccc;
  height: 30px;
}

.split-add__primary {
  border-radius: 4px 0 0 4px;
  padding: 0 10px;
}

.split-add__toggle {
  border-left: none;
  border-radius: 0 4px 4px 0;
  padding: 0 8px;
  min-width: 28px;
}

.split-add__primary:hover,
.split-add__toggle:hover {
  border-color: #ff6600;
  color: #ff6600;
}

.split-add__menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 140px;
  background: #151515;
  border: 1px solid #333;
  border-radius: 6px;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.4);
  z-index: 20;
  display: flex;
  flex-direction: column;
  padding: 4px;
}

.split-add__item {
  text-align: left;
  padding: 8px 10px;
  border-radius: 4px;
  color: #ddd;
}

.split-add__item:hover {
  background: #232323;
}
</style>
