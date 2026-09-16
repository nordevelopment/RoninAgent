<script setup lang="ts">
import { ref, nextTick } from 'vue';
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
const textareaRef = ref<HTMLTextAreaElement | null>(null);

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
          <!-- File Attach Button -->
          <label
            class="attach-btn"
            title="Attach documents or images"
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
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
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
