<script setup lang="ts">
import { onMounted } from 'vue';
import Sidebar from './components/layout/Sidebar.vue';
import { useThemeStore } from './stores/theme';
import { useChatStore } from './stores/chat';

const themeStore = useThemeStore();
const chatStore = useChatStore();

onMounted(() => {
  themeStore.initTheme();
  chatStore.initialize();
});
</script>

<template>
  <div class="container">
    <Sidebar />
    <router-view />
  </div>
</template>

<style>
/* Global Container Layout */
.container {
  display: flex;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}
</style>
