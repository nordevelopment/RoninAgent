<script setup lang="ts">
defineProps<{
  visible: boolean;
}>();
</script>

<template>
  <div v-if="visible" class="drop-zone-overlay">
    <div class="drop-zone-content">
      <div class="drop-zone-icon">📥</div>
      <div class="drop-zone-title cyber-text-glow">DROP FILES HERE TO UPLOAD</div>
      <div class="drop-zone-desc">// Supports .txt, .pdf, .xlsx, .docx, .csv, .json, images</div>
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
  background: rgba(3, 31, 42, 0.9);
  backdrop-filter: blur(4px);
  border: 2px dashed var(--cyber-cyan-500, #00f0ff);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  pointer-events: none;
}

.drop-zone-content {
  text-align: center;
}

.drop-zone-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.drop-zone-title {
  font-size: 18px;
  font-weight: bold;
  font-family: var(--font-mono, monospace);
  color: var(--cyber-cyan-300, #87eaf2);
}

.drop-zone-desc {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  margin-top: 6px;
  font-family: var(--font-mono, monospace);
}
</style>
