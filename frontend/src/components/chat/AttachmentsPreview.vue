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
        title="Remove image"
        @click="emit('remove-image')"
      >
        ✕
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
        title="Remove file"
        @click="emit('remove-file', f.id)"
      >
        ✕
      </button>
    </div>
  </div>
</template>

<style scoped>
.attachments-preview-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 14px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-subtle);
}

.image-preview-container {
  position: relative;
  display: inline-block;
}

.image-preview {
  height: 56px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-default);
  object-fit: cover;
}

.doc-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  font-size: 12px;
}

.doc-name {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-main);
  font-weight: 500;
}

.doc-size {
  color: var(--text-muted);
  font-size: 11px;
  margin-left: 4px;
}

.btn-remove {
  background: var(--bg-elevated-hover);
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  border-radius: var(--radius-full);
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 10px;
  line-height: 1;
  padding: 0;
  transition: all var(--transition-fast);
}

.btn-remove:hover {
  background: var(--accent-rose-subtle);
  color: var(--accent-rose);
  border-color: var(--accent-rose);
}
</style>
