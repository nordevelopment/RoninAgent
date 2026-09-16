import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import ChatView from '../views/ChatView.vue';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'chat',
    component: ChatView,
  },
  {
    path: '/tasks',
    name: 'tasks',
    component: () => import('../views/TasksView.vue'),
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('../views/SettingsView.vue'),
  },
  {
    path: '/agents',
    name: 'agents',
    component: () => import('../views/AgentsHubView.vue'),
  },
  {
    path: '/edit-agent/:agentId',
    name: 'edit-agent',
    component: () => import('../views/AgentEditorView.vue'),
    props: true,
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
