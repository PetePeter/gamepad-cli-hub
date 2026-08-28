<script setup lang="ts">
/**
 * PeerPairingDialog.vue — the ONE human decision in the SAS pairing flow.
 *
 * Shows the 6-digit short-authentication-string surfaced by the peer handshake
 * and asks the user to confirm it matches the code shown on the OTHER machine.
 * Confirm → peerConfirmPairing(sessionId, true); Reject → …(…, false). Success
 * (onPeerPaired) and failure (onPeerFailed) flow through the usePeers composable,
 * which drives `pairing.status`. The session is time-boxed (~180s) on the main
 * process; cancelling on unmount aborts it.
 *
 * Gamepad: A confirm, B cancel/reject. Keyboard: Enter confirm, Esc reject.
 */
import { computed, onUnmounted, watch } from 'vue';
import { SELECTION_KEYS, useModalStack } from '../../composables/useModalStack.js';
import { usePeers } from '../../composables/usePeers.js';

const MODAL_ID = 'peer-pairing';

const { pairing, confirmPairing, cancelPairing } = usePeers();
const modalStack = useModalStack();

const visible = computed(() => pairing.value.active);
const sas = computed(() => pairing.value.sas);
const status = computed(() => pairing.value.status);
const peerAlias = computed(() => pairing.value.peerAlias ?? 'peer');
const errorMessage = computed(() => pairing.value.error);
/** An inbound request needs different framing: the user did not start this. */
const incoming = computed(() => pairing.value.incoming);
const title = computed(() =>
  incoming.value ? `${peerAlias.value} wants to pair` : `Pair with ${peerAlias.value}`);

/** Six SAS digits split into cells, or placeholders while we wait for the code. */
const sasCells = computed<string[]>(() => {
  const code = sas.value ?? '';
  const digits = code.split('');
  return Array.from({ length: 6 }, (_, i) => digits[i] ?? '•');
});

const canConfirm = computed(() => status.value === 'awaiting-sas' && Boolean(sas.value));

async function onConfirm(): Promise<void> {
  if (!canConfirm.value) return;
  await confirmPairing(true);
}

async function onReject(): Promise<void> {
  await confirmPairing(false);
}

function onCancel(): void {
  void cancelPairing();
}

function handleButton(button: string): boolean {
  if (button === 'A') { void onConfirm(); return true; }
  if (button === 'B') { onCancel(); return true; }
  return true;
}

function onOverlayKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter') { event.preventDefault(); void onConfirm(); }
  else if (event.key === 'Escape') { event.preventDefault(); onCancel(); }
}

watch(visible, (v) => {
  if (v) {
    modalStack.push({ id: MODAL_ID, handler: handleButton, interceptKeys: SELECTION_KEYS });
  } else {
    modalStack.pop(MODAL_ID);
  }
}, { immediate: true });

onUnmounted(() => {
  modalStack.pop(MODAL_ID);
  // Abort any still-open session when the host unmounts.
  if (pairing.value.active && pairing.value.status !== 'paired') {
    void cancelPairing();
  }
});

defineExpose({ handleButton });
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="modal-overlay modal--visible"
      role="dialog"
      aria-label="Confirm peer pairing"
      tabindex="-1"
      @keydown="onOverlayKeydown"
    >
      <div class="modal peer-pairing-modal">
        <div class="pp-head">
          <h3 class="pp-title">{{ title }}</h3>
        </div>

        <div class="pp-body">
          <p v-if="status !== 'paired'" class="pp-instruction">
            Do these codes match on <strong>both</strong> machines?
          </p>
          <p v-if="incoming" class="pp-instruction pp-instruction--incoming">
            This request came from another machine. Only confirm if you started it there.
          </p>

          <template v-if="status !== 'paired'">
            <div v-if="canConfirm || sas" class="pp-sas" aria-label="Short authentication string">
              <span v-for="(cell, i) in sasCells" :key="i" class="pp-sas-cell">{{ cell }}</span>
            </div>
            <div v-else class="pp-waiting">Waiting for the pairing code…</div>

            <p class="pp-timebox">This request expires after about 3 minutes.</p>
          </template>

          <p v-if="status === 'failed' && errorMessage" class="pp-error">{{ errorMessage }}</p>
          <p v-else-if="status === 'paired'" class="pp-success">Paired successfully.</p>
        </div>

        <div v-if="status !== 'paired'" class="pp-footer">
          <button
            class="btn btn--primary pp-confirm"
            type="button"
            :disabled="!canConfirm"
            @click="onConfirm"
          >Confirm</button>
          <button class="btn btn--danger pp-reject" type="button" @click="onReject">Reject</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.pp-instruction--incoming { color: var(--text-secondary); font-size: 0.8rem; }
.peer-pairing-modal {
  border: 2px solid var(--accent);
  border-radius: 10px;
  background: var(--bg-secondary);
  width: min(420px, 92vw);
  display: flex;
  flex-direction: column;
}
.pp-head { padding: 16px 20px; border-bottom: 1px solid var(--border); }
.pp-title { margin: 0; font-size: 1.1rem; color: var(--text-primary); }
.pp-body { padding: 20px; display: flex; flex-direction: column; align-items: center; gap: 14px; }
.pp-instruction { margin: 0; color: var(--text-primary); font-size: 0.95rem; text-align: center; }
.pp-instruction strong { color: var(--text-primary); }
.pp-sas { display: flex; gap: 8px; }
.pp-sas-cell {
  min-width: 40px;
  padding: 12px 0;
  text-align: center;
  font-family: ui-monospace, "Cascadia Code", monospace;
  font-size: 1.8rem;
  font-weight: 700;
  color: var(--text-primary);
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 6px;
}
.pp-waiting { color: var(--text-secondary); font-size: 0.9rem; padding: 18px 0; }
.pp-timebox { margin: 0; color: var(--text-secondary); font-size: 0.78rem; }
.pp-error { margin: 0; color: #ff6666; font-size: 0.85rem; text-align: center; }
.pp-success { margin: 0; color: #44cc44; font-size: 0.85rem; text-align: center; }
.pp-footer {
  display: flex;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--border);
  justify-content: flex-end;
}
.btn {
  padding: 8px 18px;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: var(--bg-tertiary);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 0.88rem;
}
.btn--primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.btn--primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn--danger { border-color: #ff6666; color: #ff6666; }
.btn--danger:hover { background: rgba(255,102,102,0.12); }
</style>
