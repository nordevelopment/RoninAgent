<script setup lang="ts">
export interface PendingFile {
  id: string;
  name: string;
  size: number;
  file: File;
}

const props = defineProps<{
  imagePreview: string | null;
  attachedFiles: PendingFile[];
}>();

const emit = defineEmits<{
  (e: 'remove-image'): void;
  (e: 'remove-file', id: string): void;
}>();

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}
</script>

<template>
  <div v-if="imagePreview || attachedFiles.length > 0" class="attachments-preview-container">
    <!-- Image Preview -->
    <div v-if="imagePreview" class="image-preview-container">
      <img :src="imagePreview" alt="Selected Preview" class="image-preview" />
      <button
        class="btn-remove"
        type="button"
        title="REMOVE IMAGE"
        @click="emit('remove-image')"
      >
        ×
      </button>
    </div>

    <!-- Document Chips -->
    <div
      v-for="f in attachedFiles"
      :key="f.id"
      class="doc-chip"
    >
      <span class="doc-icon">📎</span>
      <span class="doc-info">
        <span class="doc-name">{{ f.name }}</span>
        <span class="doc-size">({{ formatSize(f.size) }})</span>
      </span>
      <button
        class="btn-remove"
        type="button"
        title="REMOVE FILE"
        @click="emit('remove-file', f.id)"
      >
        ×
      </button>
    </div>
  </div>
</template>

<style scoped>
.attachments-preview-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 6px 12px;
  background: rgba(0, 0, 0, 0.2);
  border-bottom: 1px solid rgba(0, 240, 255, 0.1);
}

.image-preview-container {
  position: relative;
  display: inline-block;
}

.image-preview {
  height: 60px;
  border-radius: 4px;
  border: 1px solid var(--cyber-cyan-500, #00f0ff);
  object-fit: cover;
}

.doc-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(0, 240, 255, 0.1);
  border: 1px solid rgba(0, 240, 255, 0.3);
  padding: 4px 8px;
  border-radius: 4px;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
}

.doc-name {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.doc-size {
  opacity: 0.6;
  font-size: 10px;
}

.btn-remove {
  background: rgba(255, 0, 85, 0.3);
  border: 1px solid #ff0055;
  color: #fff;
  border-radius: 50%;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  padding: 0;
  transition: all 0.2s;
}

.btn-remove:hover {
  background: #ff0055;
}
</style>
