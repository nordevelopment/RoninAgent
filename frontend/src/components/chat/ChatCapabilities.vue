<script setup lang="ts">
import { AGENT_CAPABILITIES } from '../../constants/capabilities';
</script>

<template>
  <div class="empty-chat-state">
    <div class="empty-icon">⚡</div>
    <div class="empty-title">How can Ronin help you today?</div>
    <div class="empty-subtitle">
      Sovereign personal AI agent for documents, marketplaces, web scraping, and background automations.
    </div>

    <div class="capabilities-grid">
      <div
        v-for="cap in AGENT_CAPABILITIES"
        :key="cap.id"
        class="capability-card"
      >
        <div class="capability-header">
          <span class="capability-icon">{{ cap.icon }}</span>
          <h3 class="capability-title">{{ cap.title }}</h3>
        </div>
        <p class="capability-desc">{{ cap.desc }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.capabilities-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  width: 100%;
  max-width: 960px;
  margin-top: 28px;
}

@media (max-width: 900px) {
  .capabilities-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 580px) {
  .capabilities-grid {
    grid-template-columns: 1fr;
  }
}

.capability-card {
  background: var(--bg-card, #0a2c36);
  border: 1px solid var(--border-default, rgba(6, 182, 212, 0.15));
  border-radius: var(--radius-md, 10px);
  padding: 16px 18px;
  text-align: left;
  box-shadow: var(--shadow-sm, 0 1px 3px rgba(0, 0, 0, 0.2)), inset 0 1px 0 rgba(255, 255, 255, 0.04);
  transition: all var(--transition-fast, 0.2s ease);
  display: flex;
  flex-direction: column;
}

.capability-card:hover {
  background: var(--bg-card-hover, #083846);
  border-color: var(--border-bright, rgba(6, 182, 212, 0.35));
  transform: translateY(-2px);
  box-shadow: var(--shadow-md, 0 4px 12px rgba(0, 0, 0, 0.25)), 0 0 16px var(--accent-primary-subtle, rgba(6, 182, 212, 0.1));
}

.capability-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.capability-icon {
  font-size: 20px;
  line-height: 1;
  flex-shrink: 0;
}

.capability-title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-main, #f0fdfa);
  margin: 0;
  letter-spacing: -0.01em;
}

.capability-desc {
  font-size: 0.9rem;
  color: var(--text-muted, #94a3b8);
  line-height: 1.4;
  margin: 0;
}
</style>
