<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onBeforeUnmount, watch } from 'vue';
import AttachmentsPreview, { PendingFile } from './AttachmentsPreview.vue';

const props = defineProps<{
  disabled?: boolean;
  isGenerating?: boolean;
  selectedWorkspaceFolder?: string | null;
  workspaceError?: string;
}>();

const emit = defineEmits<{
  (e: 'send', text: string, files: File[], imageDataUrl: string | null): void;
  (e: 'stop'): void;
  (e: 'select-folder', folder: string): void;
  (e: 'pick-folder'): void;
}>();

const messageText = ref<string>('');
const selectedImage = ref<string | null>(null);
const attachedFiles = ref<PendingFile[]>([]);
const docFileInput = ref<HTMLInputElement | null>(null);
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const menuRoot = ref<HTMLElement | null>(null);
const menuOpen = ref(false);
const folderPath = ref('');
const showPathInput = ref(false);
const isExternalFolder = computed(() => /^(?:[a-zA-Z]:[\\/]|\/|\\\\)/.test(props.selectedWorkspaceFolder || ''));
const folderLabel = computed(() => {
  if (!props.selectedWorkspaceFolder) return 'Automatic session folder';
  return isExternalFolder.value ? props.selectedWorkspaceFolder : `workspace/${props.selectedWorkspaceFolder}`;
});

function closeOnOutsideClick(event: MouseEvent) {
  if (menuRoot.value && !menuRoot.value.contains(event.target as Node)) menuOpen.value = false;
}

onMounted(() => document.addEventListener('click', closeOnOutsideClick));
onBeforeUnmount(() => document.removeEventListener('click', closeOnOutsideClick));
watch(() => props.selectedWorkspaceFolder, () => { folderPath.value = ''; menuOpen.value = false; });

function selectDefault() {
  emit('select-folder', '');
}

function selectPath() {
  if (folderPath.value.trim()) emit('select-folder', folderPath.value.trim());
}

function handleInput() {
  if (textareaRef.value) {
    textareaRef.value.style.height = 'auto';
    textareaRef.value.style.height = Math.min(textareaRef.value.scrollHeight, 180) + 'px';
  }
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    submit();
  }
}

function handleDocSelect(e: Event) {
  const target = e.target as HTMLInputElement;
  if (!target.files || target.files.length === 0) return;

  for (let i = 0; i < target.files.length; i++) {
    const file = target.files[i];
    if (file.type.startsWith('image/')) {
      readImageFile(file);
    } else {
      attachedFiles.value.push({
        id: `f_${Date.now()}_${Math.random()}`,
        name: file.name,
        size: file.size,
        file: file,
      });
    }
  }
  target.value = '';
}

function readImageFile(file: File) {
  const reader = new FileReader();
  reader.onload = (e) => {
    selectedImage.value = e.target?.result as string;
  };
  reader.readAsDataURL(file);
}

function addDroppedFiles(files: FileList) {
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (file.type.startsWith('image/')) {
      readImageFile(file);
    } else {
      attachedFiles.value.push({
        id: `f_${Date.now()}_${Math.random()}`,
        name: file.name,
        size: file.size,
        file: file,
      });
    }
  }
}

function removeImage() {
  selectedImage.value = null;
}

function removeFile(id: string) {
  attachedFiles.value = attachedFiles.value.filter((f) => f.id !== id);
}

function submit() {
  if (props.isGenerating) {
    emit('stop');
    return;
  }

  const text = messageText.value;
  const files = attachedFiles.value.map((f) => f.file);
  const image = selectedImage.value;

  if (!text.trim() && files.length === 0 && !image) return;

  emit('send', text, files, image);

  messageText.value = '';
  selectedImage.value = null;
  attachedFiles.value = [];

  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.style.height = 'auto';
    }
  });
}

defineExpose({
  addDroppedFiles,
});
</script>

<template>
  <div class="input-area">
    <div class="floating-input-dock">
      <!-- Attachments Preview Tray -->
      <AttachmentsPreview
        :image-preview="selectedImage"
        :attached-files="attachedFiles"
        @remove-image="removeImage"
        @remove-file="removeFile"
      />

      <div class="input-row">
        <div ref="menuRoot" class="workspace-menu-root" @keydown.esc="menuOpen = false">
          <button type="button" class="attach-btn workspace-plus" title="Attach files or choose a folder"
            aria-label="Attach files or choose a folder" :aria-expanded="menuOpen" :disabled="disabled || isGenerating"
            @click="menuOpen = !menuOpen">+</button>
          <div v-if="menuOpen" class="workspace-menu" role="dialog" aria-label="Files and session folder">
            <div class="menu-heading">Files & folder</div>
            <div class="folder-summary">
              <span class="folder-summary-icon" aria-hidden="true">▣</span>
              <div class="folder-summary-copy">
                <span class="folder-summary-caption">Current folder</span>
                <strong :title="folderLabel">{{ folderLabel }}</strong>
                <small v-if="!selectedWorkspaceFolder">Created in workspace when you start chatting</small>
              </div>
            </div>
            <button type="button" class="menu-action" @click="docFileInput?.click(); menuOpen = false">
              <span aria-hidden="true">↥</span> Attach file or image
            </button>
            <button type="button" class="menu-action menu-action-primary" @click="emit('pick-folder')">
              <span aria-hidden="true">▤</span> Choose another folder
            </button>
            <button v-if="isExternalFolder" type="button" class="menu-action" @click="selectDefault">
              <span aria-hidden="true">↶</span> Use default folder
            </button>
            <button type="button" class="menu-path-toggle" :aria-expanded="showPathInput" @click="showPathInput = !showPathInput">
              {{ showPathInput ? 'Hide server path' : 'Use a server folder path' }}
            </button>
            <form v-if="showPathInput" class="folder-path-form" @submit.prevent="selectPath">
              <label for="chat-folder-path">Absolute path on the server</label>
              <div class="folder-path-row">
                <input id="chat-folder-path" v-model="folderPath" placeholder="C:\\Projects\\MyApp" autocomplete="off" />
                <button type="submit" :disabled="!folderPath.trim()">Use</button>
              </div>
            </form>
            <span v-if="workspaceError" class="workspace-menu-error" role="alert">{{ workspaceError }}</span>
          </div>
          <input ref="docFileInput" type="file" accept=".txt,.md,.json,.csv,.log,.pdf,.xlsx,.xls,.docx,.doc,image/*"
            multiple style="display: none;" @change="handleDocSelect" />
        </div>

        <!-- Textarea -->
        <div class="input-container">
          <textarea
            ref="textareaRef"
            v-model="messageText"
            class="cyber-textarea"
            placeholder="Ask Ronin anything, describe a task, or attach files..."
            :disabled="disabled && !isGenerating"
            rows="1"
            @input="handleInput"
            @keydown="handleKeyDown"
          ></textarea>
        </div>

        <!-- Action Buttons Tray -->
        <div class="send-button-container">
          <!-- Stop / Send Button -->
          <button
            v-if="isGenerating"
            type="button"
            class="cyber-btn cyber-btn--red"
            title="Stop generation"
            @click="emit('stop')"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2"></rect>
            </svg>
          </button>

          <button
            v-else
            type="button"
            class="send-btn"
            title="Send message"
            :disabled="disabled || (!messageText.trim() && attachedFiles.length === 0 && !selectedImage)"
            @click="submit"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.workspace-menu-root { position: relative; flex: none; align-self: flex-end; margin-bottom: 4px; }
.workspace-plus { font-size: 25px; font-weight: 400; line-height: 18px; cursor: pointer; }
.workspace-menu { position: absolute; bottom: calc(100% + 12px); left: 0; z-index: 30;
  width: min(332px, calc(100vw - 48px)); padding: 14px; display: flex; flex-direction: column; gap: 7px;
  max-height: min(70vh, 520px); overflow-y: auto;
  border: 1px solid var(--border-bright, #536579); border-radius: 16px;
  background: var(--bg-card, #17202b); color: var(--text-main, #fff);
  box-shadow: 0 22px 55px #0009, 0 2px 9px #0005; }
.menu-heading { padding: 2px 4px 6px; font-weight: 700; font-size: 14px; letter-spacing: .01em; }
.folder-summary { display: flex; gap: 10px; padding: 12px; margin-bottom: 5px;
  border-radius: 11px; border: 1px solid var(--border-default, #394959); background: var(--bg-elevated, #26313d); }
.folder-summary-icon { color: var(--accent-primary, #21b9ad); font-size: 20px; line-height: 1; }
.folder-summary-copy { min-width: 0; display: grid; gap: 3px; }
.folder-summary-caption, .folder-summary-copy small { color: var(--text-muted, #a9b6c5); font-size: 11px; }
.folder-summary-copy strong { font-size: 12px; font-weight: 600; overflow-wrap: anywhere; max-height: 48px; overflow: auto; }
.menu-action { display: flex; gap: 10px; align-items: center; width: 100%; padding: 10px 11px;
  border: 0; border-radius: 9px; background: transparent; color: inherit; text-align: left; cursor: pointer; }
.menu-action:hover, .menu-action:focus-visible { background: var(--bg-elevated, #26313d); }
.menu-action span { font-size: 17px; width: 19px; text-align: center; color: var(--accent-primary, #21b9ad); }
.menu-action-primary { background: var(--accent-primary-subtle, #114c4c); font-weight: 600; }
.menu-path-toggle { align-self: flex-start; padding: 8px 11px 3px; border: 0; background: none;
  color: var(--text-muted, #a9b6c5); cursor: pointer; font-size: 11px; }
.menu-path-toggle:hover { color: var(--text-main, #fff); }
.folder-path-form { display: grid; gap: 7px; padding: 4px 3px; }
.folder-path-form label { color: var(--text-muted, #a9b6c5); font-size: 11px; }
.folder-path-row { display: flex; gap: 6px; }
.folder-path-row input { min-width: 0; flex: 1; padding: 9px; border: 1px solid var(--border-default, #394959);
  border-radius: 8px; background: var(--bg-surface, #141c25); color: inherit; }
.folder-path-row button { border: 0; border-radius: 8px; padding: 7px 12px; background: var(--accent-primary, #21b9ad);
  color: #071719; font-weight: 700; cursor: pointer; }
.folder-path-row button:disabled { opacity: .5; cursor: default; }
.workspace-menu-error { color: #ff9d9d; font-size: 12px; padding: 6px; overflow-wrap: anywhere; }
</style>
