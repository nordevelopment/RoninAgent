<script setup lang="ts">
import { ref } from 'vue';
import AttachmentsPreview, { PendingFile } from './AttachmentsPreview.vue';

const props = defineProps<{
  disabled?: boolean;
  isGenerating?: boolean;
}>();

const emit = defineEmits<{
  (e: 'send', text: string, files: File[], imageDataUrl: string | null): void;
  (e: 'stop'): void;
}>();

const messageText = ref<string>('');
const selectedImage = ref<string | null>(null);
const attachedFiles = ref<PendingFile[]>([]);
const docFileInput = ref<HTMLInputElement | null>(null);

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
}

defineExpose({
  addDroppedFiles,
});
</script>

<template>
  <div class="input-area cyber-tile--top">
    <!-- Attachments Preview Bar -->
    <AttachmentsPreview
      :image-preview="selectedImage"
      :attached-files="attachedFiles"
      @remove-image="removeImage"
      @remove-file="removeFile"
    />

    <div class="input-row">
      <div class="input-container">
        <textarea
          v-model="messageText"
          class="cyber-textarea"
          placeholder="Enter message or task, attach files (.txt, .pdf, .xlsx, .docx, images)..."
          :disabled="disabled && !isGenerating"
          @keydown="handleKeyDown"
          rows="1"
        ></textarea>
      </div>

      <div class="send-button-container">
        <!-- File Attach Button -->
        <label
          class="cyber-btn cyber-btn--cyan cyber-btn--sm attach-btn"
          title="ATTACH FILES (.TXT, .PDF, .XLSX, .DOCX, IMAGES)"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            width="18"
            height="18"
          >
            <path
              d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"
            />
          </svg>
          <input
            ref="docFileInput"
            type="file"
            accept=".txt,.md,.json,.csv,.log,.pdf,.xlsx,.xls,.docx,.doc,image/*"
            multiple
            style="display: none;"
            @change="handleDocSelect"
          />
        </label>

        <!-- Send / Stop Button -->
        <button
          v-if="isGenerating"
          type="button"
          class="cyber-btn cyber-btn--red"
          title="STOP AI GENERATION"
          @click="emit('stop')"
        >
          ⏹ STOP
        </button>

        <button
          v-else
          type="button"
          class="cyber-btn cyber-btn--cyan send-btn"
          title="SEND MESSAGE"
          :disabled="disabled"
          @click="submit"
        >
          <svg class="send-icon" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.input-area {
  display: flex;
  flex-direction: column;
  background: rgba(7, 47, 63, 0.4);
  border-top: 1px solid rgba(0, 240, 255, 0.2);
}

.input-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 10px 14px;
}

.input-container {
  flex: 1;
}

.cyber-textarea {
  width: 100%;
  min-height: 60px;
  max-height: 160px;
  resize: none;
  font-family: var(--font-sans, system-ui, sans-serif);
  font-size: 14px;
  line-height: 1.4;
  padding: 8px 12px;
  box-sizing: border-box;
}

.send-button-container {
  display: flex;
  gap: 8px;
  align-items: center;
}

.attach-btn {
  padding: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
}

.send-btn {
  padding: 8px 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
