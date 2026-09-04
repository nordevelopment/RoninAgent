<script setup lang="ts">
defineProps<{
  visible: boolean;
}>();
</script>

<template>
  <div v-if="visible" class="drop-zone-overlay">
    <div class="drop-zone-content">
      <div class="drop-zone-icon">📥</div>
      <div class="drop-zone-title">Drop files here to upload</div>
      <div class="drop-zone-desc">Supports documents (.txt, .pdf, .docx, .xlsx, .csv, .json) and images</div>
    </div>
  </div>
</template>

<style scoped>
.drop-zone-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(9, 13, 22, 0.88);
  backdrop-filter: blur(12px);
  border: 2px dashed var(--accent-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  pointer-events: none;
}

.drop-zone-content {
  text-align: center;
  max-width: 400px;
}

.drop-zone-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.drop-zone-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-main);
}

.drop-zone-desc {
  font-size: 13px;
  color: var(--text-muted);
  margin-top: 6px;
  line-height: 1.5;
}
</style>
