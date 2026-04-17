import { attachModalKeyboard } from '../modals/modal-base.js';
import { addEditorHistoryEntry, getEditorHistoryPreview, loadEditorHistory } from './editor-history.js';

interface EditorPopupState {
  visible: boolean;
  history: string[];
  pendingHistoryText: string | null;
  cleanupKeyboard: (() => void) | null;
  resolve: ((value: string | null) => void) | null;
}

const popupState: EditorPopupState = {
  visible: false,
  history: [],
  pendingHistoryText: null,
  cleanupKeyboard: null,
  resolve: null,
};

export function initEditorPopup(): void {
  if (document.getElementById('editorPopupOverlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'editorPopupOverlay';
  overlay.className = 'modal-overlay editor-popup-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = `
    <div class="modal editor-popup" id="editorPopup" role="dialog" aria-modal="true" aria-labelledby="editorPopupTitle">
      <div class="editor-popup__header">
        <h2 id="editorPopupTitle">Prompt Editor</h2>
        <button class="icon-button" id="editorPopupCloseBtn" aria-label="Close editor">×</button>
      </div>
      <div class="editor-popup__body">
        <section class="editor-popup__composer">
          <textarea id="editorPopupTextarea" class="editor-popup__textarea" rows="12" placeholder="Enter your prompt..."></textarea>
          <div id="editorPopupHistoryAction" class="editor-popup__history-action" style="display:none">
            <span id="editorPopupHistoryLabel"></span>
            <div class="editor-popup__history-buttons">
              <button class="btn btn--primary btn--sm" id="editorPopupReplaceBtn">Clear & Insert</button>
              <button class="btn btn--secondary btn--sm" id="editorPopupInsertBtn">Insert at Caret</button>
              <button class="btn btn--secondary btn--sm" id="editorPopupHistoryCancelBtn">Cancel</button>
            </div>
          </div>
        </section>
        <aside class="editor-popup__history">
          <h3>Recent Prompts</h3>
          <div id="editorPopupHistoryList" class="editor-popup__history-list"></div>
        </aside>
      </div>
      <div class="modal-footer editor-popup__footer">
        <button class="btn btn--primary" id="editorPopupSendBtn">Send (Ctrl+Enter)</button>
        <button class="btn btn--secondary" id="editorPopupCancelBtn">Cancel</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  wireEditorPopupEvents(overlay);
}

function wireEditorPopupEvents(overlay: HTMLElement): void {
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) cancelEditorPopup();
  });
  document.getElementById('editorPopupCloseBtn')?.addEventListener('click', () => cancelEditorPopup());
  document.getElementById('editorPopupCancelBtn')?.addEventListener('click', () => cancelEditorPopup());
  document.getElementById('editorPopupSendBtn')?.addEventListener('click', () => submitEditorPopup());
  document.getElementById('editorPopupReplaceBtn')?.addEventListener('click', () => replaceWithPendingHistory());
  document.getElementById('editorPopupInsertBtn')?.addEventListener('click', () => insertPendingHistoryAtCaret());
  document.getElementById('editorPopupHistoryCancelBtn')?.addEventListener('click', () => hideHistoryAction());
  document.getElementById('editorPopupHistoryList')?.addEventListener('click', onHistoryListClick);
}

function onHistoryListClick(event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const button = target.closest('.editor-popup__history-item') as HTMLButtonElement | null;
  if (!button) return;

  const index = Number(button.dataset.index);
  const text = popupState.history[index];
  if (!text) return;

  if (!getTextareaValue().trim()) {
    setTextareaValue(text);
    return;
  }
  showHistoryAction(text);
}

export async function showEditorPopup(initialText = ''): Promise<string | null> {
  initEditorPopup();
  if (popupState.visible) return null;

  popupState.visible = true;
  popupState.history = await loadEditorHistory();
  popupState.pendingHistoryText = null;
  renderHistoryList();
  hideHistoryAction();

  const overlay = getOverlay();
  const modal = getModal();
  const textarea = getTextarea();
  if (!overlay || !modal || !textarea) {
    popupState.visible = false;
    return null;
  }

  overlay.classList.add('modal--visible');
  overlay.setAttribute('aria-hidden', 'false');
  textarea.value = initialText;
  popupState.cleanupKeyboard = attachModalKeyboard({
    container: modal,
    onAccept: () => submitEditorPopup(),
    onCancel: () => cancelEditorPopup(),
  });

  requestAnimationFrame(() => focusTextareaEnd());
  return await new Promise(resolve => {
    popupState.resolve = resolve;
  });
}

export function hideEditorPopup(): void {
  completeEditorPopup(null);
}

export function isEditorPopupVisible(): boolean {
  return popupState.visible;
}

function submitEditorPopup(): void {
  void submitEditorPopupAsync();
}

async function submitEditorPopupAsync(): Promise<void> {
  const text = getTextareaValue().trim();
  if (!text) {
    completeEditorPopup(null);
    return;
  }
  await addEditorHistoryEntry(text);
  completeEditorPopup(text);
}

function cancelEditorPopup(): void {
  completeEditorPopup(null);
}

function completeEditorPopup(result: string | null): void {
  if (!popupState.visible) return;

  popupState.visible = false;
  popupState.pendingHistoryText = null;
  popupState.cleanupKeyboard?.();
  popupState.cleanupKeyboard = null;

  const overlay = getOverlay();
  if (overlay) {
    overlay.classList.remove('modal--visible');
    overlay.setAttribute('aria-hidden', 'true');
  }

  const resolve = popupState.resolve;
  popupState.resolve = null;
  resolve?.(result);
}

function renderHistoryList(): void {
  const container = document.getElementById('editorPopupHistoryList');
  if (!container) return;

  if (popupState.history.length === 0) {
    container.innerHTML = '<p class="editor-popup__history-empty">No recent prompts yet.</p>';
    return;
  }

  container.innerHTML = popupState.history.map((entry, index) => `
    <button type="button" class="editor-popup__history-item" data-index="${index}">
      <span class="editor-popup__history-index">${index + 1}.</span>
      <span class="editor-popup__history-text">${escapeHistoryText(getEditorHistoryPreview(entry))}</span>
    </button>
  `).join('');
}

function showHistoryAction(text: string): void {
  popupState.pendingHistoryText = text;
  const panel = document.getElementById('editorPopupHistoryAction');
  const label = document.getElementById('editorPopupHistoryLabel');
  if (!panel || !label) return;
  label.textContent = getEditorHistoryPreview(text);
  panel.style.display = 'flex';
}

function hideHistoryAction(): void {
  popupState.pendingHistoryText = null;
  const panel = document.getElementById('editorPopupHistoryAction');
  if (panel) panel.style.display = 'none';
}

function replaceWithPendingHistory(): void {
  if (!popupState.pendingHistoryText) return;
  setTextareaValue(popupState.pendingHistoryText);
  hideHistoryAction();
}

function insertPendingHistoryAtCaret(): void {
  const textarea = getTextarea();
  const text = popupState.pendingHistoryText;
  if (!textarea || !text) return;

  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? start;
  textarea.value = `${textarea.value.slice(0, start)}${text}${textarea.value.slice(end)}`;
  const nextPos = start + text.length;
  textarea.focus();
  textarea.setSelectionRange(nextPos, nextPos);
  hideHistoryAction();
}

function getOverlay(): HTMLElement | null {
  return document.getElementById('editorPopupOverlay');
}

function getModal(): HTMLElement | null {
  return document.getElementById('editorPopup');
}

function getTextarea(): HTMLTextAreaElement | null {
  return document.getElementById('editorPopupTextarea') as HTMLTextAreaElement | null;
}

function getTextareaValue(): string {
  return getTextarea()?.value ?? '';
}

function setTextareaValue(text: string): void {
  const textarea = getTextarea();
  if (!textarea) return;
  textarea.value = text;
  focusTextareaEnd();
}

function focusTextareaEnd(): void {
  const textarea = getTextarea();
  if (!textarea) return;
  const end = textarea.value.length;
  textarea.focus();
  textarea.setSelectionRange(end, end);
}

function escapeHistoryText(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
