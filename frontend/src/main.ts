import { createApp } from 'vue';
import { createPinia } from 'pinia';
import router from './router';
import App from './App.vue';

// Global styles
import '../css/cybercore.css';
import '../css/chat.css';
import '../css/robotpet.css';
import '../css/task.css';
import './assets/styles/theme-overrides.css';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);

app.mount('#app');
