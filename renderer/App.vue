<script setup lang="ts">
/**
 * App.vue — Root Vue component for the gamepad-cli-hub renderer.
 *
 * During the migration, legacy TS modules still drive the DOM.
 * This component serves as the registration point for Vue SFC
 * components that will progressively replace the legacy code.
 *
 * Architecture (target):
 *
 * App.vue
 * ├── Sidebar
 * │   ├── StatusStrip
 * │   ├── SortBar
 * │   ├── SessionGroup (v-for)
 * │   │   └── SessionCard (v-for)
 * │   ├── SpawnGrid
 * │   ├── PlansGrid
 * │   └── SettingsPanel
 * │       ├── ProfilesTab / BindingsTab / ToolsTab / TelegramTab
 * ├── MainView (terminal / overview / plan)
 * │   ├── TerminalPane (v-show, keep-alive)
 * │   │   └── ChipBar (drafts + plan chips)
 * │   ├── OverviewGrid (v-if)
 * │   │   └── OverviewCard (v-for)
 * │   └── PlanScreen (v-if)
 * └── Modals (<Teleport to="body">)
 *     ├── CloseConfirmModal / PlanDeleteConfirmModal
 *     ├── SequencePickerModal / QuickSpawnModal
 *     ├── DirPickerModal / ContextMenu / DraftSubmenu
 *     ├── FormModal / BindingEditorModal
 */
</script>

<template>
  <!-- Vue root — legacy TS modules still drive the DOM during migration.
       SFC components are fully created + tested and will replace legacy
       modules when this root layout is wired up. -->
</template>
