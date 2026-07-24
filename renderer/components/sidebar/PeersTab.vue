<script setup lang="ts">
/**
 * PeersTab.vue — Settings → 🔗 Peers. The steady-state federation surface:
 * paired peers (online dot, direction, enable toggle, allow-list editor, unpair),
 * a "Discover nearby" mDNS section with Pair buttons, and an Audit button that
 * opens the read-only PeerAuditModal. The SAS confirm dialog is mounted by the
 * app host and driven by the usePeers pairing state.
 *
 * Federation is OFF by default — when it is, we still render the structure with a
 * clear "federation is off" hint rather than a blank tab.
 */
import { computed, onMounted, ref } from 'vue';
import { usePeers, type ConfiguredPeer, type DiscoveredPeer, type FederationConfig } from '../../composables/usePeers.js';
import { getPeerStatusColor } from '../../state-colors.js';
import PeerAuditModal from '../modals/PeerAuditModal.vue';
import FederationConfigPanel from './FederationConfigPanel.vue';

const {
  federationEnabled,
  federationConfig,
  setFederationConfig,
  configuredPeers,
  discoveredPeers,
  ensureSubscribed,
  startPairing,
  setAllowList,
  setEnabled,
  unpair,
} = usePeers();

function onFederationUpdate(updates: Partial<FederationConfig>): void {
  void setFederationConfig(updates);
}

/** Allow-list presets: a friendly name → the glob patterns it applies. */
const ALLOW_PRESETS: Array<{ label: string; globs: string[] }> = [
  { label: 'Read-only', globs: ['session_list', 'plan_*', 'directory_list', 'project_list'] },
  { label: 'Sessions', globs: ['session_*'] },
  { label: 'All', globs: ['*'] },
];

const expandedPeerId = ref<string | null>(null);
const auditVisible = ref(false);

// Per-peer pending allow-list edits (draft glob being typed) + debounce timers.
const newPattern = ref<Record<string, string>>({});
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

onMounted(() => {
  ensureSubscribed();
});

/** Peers discovered on the LAN that are not already configured (paired). */
const pairableDiscovered = computed<DiscoveredPeer[]>(() => {
  const pairedMachineIds = new Set(configuredPeers.value.map((p) => p.machineId).filter(Boolean));
  return discoveredPeers.value.filter((d) => !pairedMachineIds.has(d.machineId));
});

function statusFor(peer: ConfiguredPeer): 'online' | 'offline' {
  return peer.online ? 'online' : 'offline';
}

function dotColor(peer: ConfiguredPeer): string {
  return getPeerStatusColor(statusFor(peer));
}

function directionLabel(direction: ConfiguredPeer['direction']): string {
  if (direction === 'inbound') return '← inbound';
  if (direction === 'outbound') return 'outbound →';
  return '↔ bidirectional';
}

function toggleExpanded(peerId: string): void {
  expandedPeerId.value = expandedPeerId.value === peerId ? null : peerId;
}

function onToggleEnabled(peer: ConfiguredPeer, event: Event): void {
  const enabled = (event.target as HTMLInputElement).checked;
  void setEnabled(peer.id, enabled);
}

function onUnpair(peer: ConfiguredPeer): void {
  void unpair(peer.id);
}

function onPair(peer: DiscoveredPeer): void {
  void startPairing(peer);
}

/** Debounced allow-list save (500ms) — matches BackupTab's save cadence. */
function scheduleAllowSave(peerId: string, allow: string[]): void {
  const existing = saveTimers.get(peerId);
  if (existing) clearTimeout(existing);
  saveTimers.set(peerId, setTimeout(() => {
    void setAllowList(peerId, allow);
    saveTimers.delete(peerId);
  }, 500));
}

function addPattern(peer: ConfiguredPeer): void {
  const pattern = (newPattern.value[peer.id] ?? '').trim();
  if (!pattern) return;
  if (peer.allow.includes(pattern)) { newPattern.value[peer.id] = ''; return; }
  const next = [...peer.allow, pattern];
  newPattern.value[peer.id] = '';
  scheduleAllowSave(peer.id, next);
}

function removePattern(peer: ConfiguredPeer, pattern: string): void {
  const next = peer.allow.filter((p) => p !== pattern);
  scheduleAllowSave(peer.id, next);
}

function applyPreset(peer: ConfiguredPeer, globs: string[]): void {
  scheduleAllowSave(peer.id, [...globs]);
}
</script>

<template>
  <div class="peers-tab">
    <FederationConfigPanel :config="federationConfig" @update="onFederationUpdate" />

    <div v-if="!federationEnabled" class="peers-off-hint">
      Federation is off — enable it above to pair with other machines.
    </div>

    <div class="peers-section">
      <div class="peers-section-head">
        <h4 class="peers-section-title">Paired peers</h4>
        <button class="btn btn--secondary btn--sm peers-audit-btn" type="button" @click="auditVisible = true">Audit</button>
      </div>

      <div v-if="configuredPeers.length === 0" class="peers-empty">No paired peers yet.</div>

      <div v-for="peer in configuredPeers" :key="peer.id" class="peer-row" :data-peer-id="peer.id">
        <div class="peer-row-main">
          <span
            class="peer-dot"
            :class="`peer-dot--${statusFor(peer)}`"
            :style="{ backgroundColor: dotColor(peer) }"
            :title="statusFor(peer)"
          ></span>
          <span class="peer-alias">{{ peer.alias }}</span>
          <span class="peer-direction">{{ directionLabel(peer.direction) }}</span>
          <span class="peer-spacer"></span>

          <label class="peer-toggle" :title="peer.enabled ? 'Enabled' : 'Disabled'">
            <input
              type="checkbox"
              class="peer-enable-input"
              :checked="peer.enabled"
              @change="onToggleEnabled(peer, $event)"
            />
            <span class="peer-toggle-label">{{ peer.enabled ? 'On' : 'Off' }}</span>
          </label>

          <button class="btn btn--secondary btn--sm peer-allow-toggle" type="button" @click="toggleExpanded(peer.id)">
            Allow-list ({{ peer.allow.length }})
          </button>
          <button class="btn btn--danger btn--sm peer-unpair" type="button" @click="onUnpair(peer)">Unpair</button>
        </div>

        <div v-if="expandedPeerId === peer.id" class="peer-allow-editor">
          <div class="peer-presets">
            <span class="peer-presets-label">Presets:</span>
            <button
              v-for="preset in ALLOW_PRESETS"
              :key="preset.label"
              class="btn btn--secondary btn--sm peer-preset-btn"
              type="button"
              @click="applyPreset(peer, preset.globs)"
            >{{ preset.label }}</button>
          </div>

          <div class="peer-globs">
            <span v-if="peer.allow.length === 0" class="peer-globs-empty">Deny-all (no patterns).</span>
            <span v-for="pattern in peer.allow" :key="pattern" class="peer-glob-chip">
              <code class="peer-glob-code">{{ pattern }}</code>
              <button class="peer-glob-remove" type="button" aria-label="Remove pattern" @click="removePattern(peer, pattern)">✕</button>
            </span>
          </div>

          <div class="peer-add-row">
            <input
              type="text"
              class="peer-add-input"
              placeholder="e.g. session_* or artifact_get"
              :value="newPattern[peer.id] ?? ''"
              @input="newPattern[peer.id] = ($event.target as HTMLInputElement).value"
              @keydown.enter.prevent="addPattern(peer)"
              @blur="addPattern(peer)"
            />
            <button class="btn btn--secondary btn--sm peer-add-btn" type="button" @click="addPattern(peer)">Add</button>
          </div>
        </div>
      </div>
    </div>

    <div class="peers-section">
      <h4 class="peers-section-title">Discover nearby</h4>
      <div v-if="pairableDiscovered.length === 0" class="peers-empty">No nearby peers found.</div>
      <div v-for="peer in pairableDiscovered" :key="peer.machineId" class="peer-discovered-row">
        <span class="peer-alias">{{ peer.alias }}</span>
        <span class="peer-address">{{ peer.address }}</span>
        <span class="peer-spacer"></span>
        <button class="btn btn--primary btn--sm peer-pair-btn" type="button" @click="onPair(peer)">Pair</button>
      </div>
    </div>

    <PeerAuditModal v-model:visible="auditVisible" />
  </div>
</template>

<style scoped>
.peers-tab {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.peers-off-hint {
  padding: 10px 12px;
  background: rgba(255,159,26,0.12);
  border: 1px solid rgba(255,159,26,0.4);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 0.85rem;
}
.peers-section { display: flex; flex-direction: column; gap: 10px; }
.peers-section-head { display: flex; align-items: center; gap: 10px; }
.peers-section-title { margin: 0; font-size: 0.95rem; color: var(--text-primary); }
.peers-audit-btn { margin-left: auto; }
.peers-empty { color: var(--text-secondary); font-size: 0.85rem; }

.peer-row {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-primary);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.peer-row-main { display: flex; align-items: center; gap: 10px; }
.peer-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.peer-alias { font-weight: 600; font-size: 0.9rem; color: var(--text-primary); }
.peer-direction { font-size: 0.76rem; color: var(--text-secondary); }
.peer-address { font-size: 0.8rem; color: var(--text-secondary); font-family: ui-monospace, "Cascadia Code", monospace; }
.peer-spacer { margin-left: auto; }

.peer-toggle { display: flex; align-items: center; gap: 6px; cursor: pointer; }
.peer-enable-input { width: 16px; height: 16px; cursor: pointer; }
.peer-toggle-label { font-size: 0.78rem; color: var(--text-secondary); }

.peer-allow-editor {
  border-top: 1px solid var(--border-color);
  padding-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.peer-presets { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.peer-presets-label { font-size: 0.78rem; color: var(--text-secondary); }
.peer-globs { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.peer-globs-empty { font-size: 0.8rem; color: var(--text-secondary); }
.peer-glob-chip {
  display: inline-flex; align-items: center; gap: 4px;
  background: var(--bg-tertiary); border-radius: 4px; padding: 2px 4px 2px 8px;
}
.peer-glob-code { font-family: ui-monospace, "Cascadia Code", monospace; font-size: 0.78rem; color: var(--text-primary); }
.peer-glob-remove {
  background: none; border: none; color: var(--text-secondary);
  cursor: pointer; font-size: 0.8rem; line-height: 1; padding: 0 2px;
}
.peer-glob-remove:hover { color: #ff6666; }

.peer-add-row { display: flex; gap: 8px; }
.peer-add-input {
  flex: 1; min-width: 160px; padding: 6px 8px;
  border: 1px solid var(--border-color); border-radius: 4px;
  background: var(--bg-primary); color: var(--text-primary); font-size: 0.85rem;
}

.peer-discovered-row {
  display: flex; align-items: center; gap: 10px;
  border: 1px solid var(--border-color); border-radius: 8px;
  background: var(--bg-primary); padding: 8px 12px;
}

.btn {
  padding: 6px 12px; border-radius: 4px; border: 1px solid var(--border-color);
  background: var(--bg-tertiary); color: var(--text-primary); cursor: pointer; font-size: 0.82rem;
}
.btn--sm { padding: 4px 10px; font-size: 0.78rem; }
.btn--primary { background: var(--accent-primary); border-color: var(--accent-primary); color: #fff; }
.btn--secondary { background: var(--bg-tertiary); color: var(--text-primary); }
.btn--danger { border-color: #ff6666; color: #ff6666; background: transparent; }
.btn--danger:hover { background: rgba(255,102,102,0.12); }
</style>
