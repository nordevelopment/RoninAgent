<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useTasksStore, TaskItem } from '../stores/tasks';

const router = useRouter();
const tasksStore = useTasksStore();

// Modal state: Add/Edit
const isModalOpen = ref(false);
const editingTaskId = ref<number | null>(null);
const formTitle = ref('');
const formStatus = ref<'ready' | 'running' | 'done' | 'failed'>('ready');
const formIsAuto = ref(false);
const formRunAt = ref('');
const formRepeatInterval = ref<number | undefined>(undefined);
const formCron = ref('');

// Modal state: View Result
const isResultModalOpen = ref(false);
const activeResultTask = ref<TaskItem | null>(null);

onMounted(() => {
  tasksStore.fetchTasks();
});

const totalCount = computed(() => tasksStore.tasks.length);
const readyCount = computed(() => tasksStore.tasks.filter((t) => t.status === 'ready').length);
const runningCount = computed(() => tasksStore.tasks.filter((t) => t.status === 'running').length);
const doneCount = computed(() => tasksStore.tasks.filter((t) => t.status === 'done').length);

function openAddModal() {
  editingTaskId.value = null;
  formTitle.value = '';
  formStatus.value = 'ready';
  formIsAuto.value = false;
  formRunAt.value = '';
  formRepeatInterval.value = undefined;
  formCron.value = '';
  isModalOpen.value = true;
}

function openEditModal(task: TaskItem) {
  editingTaskId.value = task.id;
  formTitle.value = task.title;
  formStatus.value = task.status;
  formIsAuto.value = !!task.is_auto;
  formRunAt.value = task.run_at ? new Date(task.run_at).toISOString().slice(0, 16) : '';
  formRepeatInterval.value = task.repeat_interval || undefined;
  formCron.value = task.cron_expression || '';
  isModalOpen.value = true;
}

function closeModal() {
  isModalOpen.value = false;
}

async function handleSaveTask() {
  if (!formTitle.value.trim()) {
    alert('Task title is required');
    return;
  }

  const payload = {
    title: formTitle.value.trim(),
    status: formStatus.value,
    is_auto: formIsAuto.value,
    run_at: formRunAt.value || undefined,
    repeat_interval: formRepeatInterval.value || undefined,
    cron_expression: formCron.value || undefined,
  };

  try {
    if (editingTaskId.value) {
      await tasksStore.updateTask(editingTaskId.value, payload);
    } else {
      await tasksStore.createTask(payload);
    }
    closeModal();
  } catch (err: any) {
    alert(`Error: ${err.message}`);
  }
}

async function handleDeleteTask(id: number) {
  if (confirm('Delete this task?')) {
    try {
      await tasksStore.deleteTask(id);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  }
}

function viewResult(task: TaskItem) {
  activeResultTask.value = task;
  isResultModalOpen.value = true;
}

function closeResultModal() {
  isResultModalOpen.value = false;
  activeResultTask.value = null;
}

function formatDate(d?: string | null): string {
  if (!d) return 'Immediate';
  try {
    return new Date(d).toLocaleString();
  } catch {
    return d;
  }
}
</script>

<template>
  <div class="chat-area tasks-container">
    <!-- Header -->
    <header class="chat-header">
      <div style="display: flex; align-items: center; gap: 12px;">
        <button class="btn-primary cyber-btn--sm" @click="router.push('/')">
          ← Back to Chat
        </button>
        <div class="system-status">Task Manager</div>
      </div>

      <div style="display: flex; gap: 10px;">
        <button
          class="btn-primary cyber-btn--sm"
          :disabled="tasksStore.isRunningBatch"
          @click="tasksStore.runReadyTasks"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
          </svg>
          <span>{{ tasksStore.isRunningBatch ? 'Executing...' : 'Run Ready Tasks' }}</span>
        </button>
        <button class="btn-new-chat" style="width: auto; padding: 7px 14px;" @click="openAddModal">
          <span>+ Create Task</span>
        </button>
      </div>
    </header>

    <!-- Content Area -->
    <div class="tasks-content">
      <!-- Metrics Overview Strip -->
      <div class="metrics-overview-strip">
        <div class="metric-card">
          <div class="metric-label">Total Tasks</div>
          <div class="metric-value">{{ totalCount }}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label" style="color: #818cf8;">Ready</div>
          <div class="metric-value">{{ readyCount }}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label" style="color: #fbbf24;">In Progress</div>
          <div class="metric-value">{{ runningCount }}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label" style="color: #34d399;">Completed</div>
          <div class="metric-value">{{ doneCount }}</div>
        </div>
      </div>

      <!-- Modern Tasks Table Container -->
      <div class="tasks-table-card">
        <table class="modern-table" v-if="tasksStore.tasks.length > 0">
          <thead>
            <tr>
              <th style="width: 60px;">ID</th>
              <th>Task Instruction</th>
              <th style="width: 110px;">Status</th>
              <th style="width: 140px;">Execution Mode</th>
              <th style="width: 170px;">Scheduled Run</th>
              <th style="width: 170px;">Created</th>
              <th style="width: 140px; text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in tasksStore.tasks" :key="t.id">
              <td class="id-cell">#{{ t.id }}</td>
              <td class="task-title-cell">
                <span class="task-name">{{ t.title }}</span>
              </td>
              <td>
                <span class="status-pill" :class="'status-' + t.status">
                  <span v-if="t.status === 'running'" class="pulse-dot"></span>
                  {{ t.status }}
                </span>
              </td>
              <td>
                <span v-if="t.cron_expression" class="mode-badge">Cron ({{ t.cron_expression }})</span>
                <span v-else-if="t.repeat_interval" class="mode-badge">Repeat ({{ t.repeat_interval }}s)</span>
                <span v-else-if="t.is_auto" class="mode-badge">Auto</span>
                <span v-else class="mode-badge">Manual</span>
              </td>
              <td class="date-cell">{{ formatDate(t.run_at) }}</td>
              <td class="date-cell">{{ formatDate(t.created_at) }}</td>
              <td class="actions-cell">
                <button
                  v-if="t.result"
                  class="btn-primary cyber-btn--xs"
                  title="View Task Result"
                  @click="viewResult(t)"
                >
                  Result
                </button>
                <button
                  class="session-action-icon-btn"
                  title="Edit task"
                  @click="openEditModal(t)"
                >
                  ✏️
                </button>
                <button
                  class="session-action-icon-btn delete-hover"
                  title="Delete task"
                  @click="handleDeleteTask(t.id)"
                >
                  🗑
                </button>
              </td>
            </tr>
          </tbody>
        </table>

        <div v-else class="empty-table-placeholder">
          <div style="font-size: 36px; margin-bottom: 10px;">📋</div>
          <div style="font-size: 15px; font-weight: 600; color: var(--text-main); margin-bottom: 4px;">No tasks scheduled</div>
          <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px;">Create autonomous background jobs or cron routines for RoninAgent.</div>
          <button class="btn-primary" @click="openAddModal">+ Create first task</button>
        </div>
      </div>
    </div>

    <!-- Modal: Add/Edit Task -->
    <div v-if="isModalOpen" class="modal-overlay" @click.self="closeModal">
      <div class="modal-content">
        <div class="modal-header">
          <div class="modal-title">{{ editingTaskId ? 'Edit Task #' + editingTaskId : 'Create New Task' }}</div>
          <button class="modal-close-btn" @click="closeModal">✕</button>
        </div>

        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Task Instruction *</label>
            <textarea
              v-model="formTitle"
              class="form-input"
              rows="3"
              placeholder="e.g. Check system logs, summarize errors, and send Telegram notification..."
            ></textarea>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
            <div class="form-group">
              <label class="form-label">Initial Status</label>
              <select v-model="formStatus" class="cyber-select">
                <option value="ready">Ready</option>
                <option value="running">Running</option>
                <option value="done">Done</option>
                <option value="failed">Failed</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Scheduled Run Time</label>
              <input
                v-model="formRunAt"
                type="datetime-local"
                class="form-input"
              />
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
            <div class="form-group">
              <label class="form-label">Repeat Interval (sec)</label>
              <input
                v-model.number="formRepeatInterval"
                type="number"
                class="form-input"
                placeholder="e.g. 3600"
              />
            </div>

            <div class="form-group">
              <label class="form-label">Cron Expression</label>
              <input
                v-model="formCron"
                type="text"
                class="form-input"
                placeholder="e.g. 0 * * * *"
              />
            </div>
          </div>

          <div style="margin-top: 6px;">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; color: var(--text-body);">
              <input type="checkbox" v-model="formIsAuto" style="accent-color: var(--accent-primary);" />
              <span>Enable automatic background execution</span>
            </label>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-primary cyber-btn--sm" @click="closeModal">Cancel</button>
          <button class="btn-new-chat" style="width: auto; padding: 7px 18px;" @click="handleSaveTask">
            {{ editingTaskId ? 'Save Changes' : 'Create Task' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Modal: View Task Result -->
    <div v-if="isResultModalOpen" class="modal-overlay" @click.self="closeResultModal">
      <div class="modal-content" style="max-width: 680px;">
        <div class="modal-header">
          <div class="modal-title">Task Result: #{{ activeResultTask?.id }}</div>
          <button class="modal-close-btn" @click="closeResultModal">✕</button>
        </div>

        <div class="modal-body">
          <div style="font-size: 13px; font-weight: 600; color: var(--text-main); margin-bottom: 8px;">
            {{ activeResultTask?.title }}
          </div>
          <pre class="result-code-box"><code>{{ activeResultTask?.result }}</code></pre>
        </div>

        <div class="modal-footer">
          <button class="btn-primary cyber-btn--sm" @click="closeResultModal">Close</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tasks-table-card {
  background: var(--bg-card);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm), var(--shadow-inner-light);
  overflow: hidden;
}

.modern-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 13px;
}

.modern-table th {
  background: var(--bg-elevated);
  padding: 12px 16px;
  font-weight: 600;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border-default);
  font-size: 12px;
}

.modern-table td {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-body);
}

.modern-table tr:hover td {
  background: var(--bg-elevated);
}

.id-cell {
  font-family: var(--font-mono, monospace);
  color: var(--text-faint);
  font-weight: 600;
}

.task-name {
  font-weight: 600;
  color: var(--text-main);
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: var(--radius-full);
  font-size: 11px;
  font-weight: 600;
  text-transform: capitalize;
}

.pulse-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  animation: live-pulse 1.4s infinite;
}

.mode-badge {
  font-size: 11.5px;
  padding: 2px 7px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xs);
  color: var(--text-muted);
}

.date-cell {
  font-size: 12px;
  color: var(--text-muted);
}

.actions-cell {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}

.empty-table-placeholder {
  padding: 48px 20px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-subtle);
}

.modal-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-main);
}

.modal-close-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 16px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--radius-xs);
}

.modal-close-btn:hover {
  background: var(--bg-elevated);
  color: var(--text-main);
}

.modal-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--border-subtle);
  background: var(--bg-surface-glass);
}

.result-code-box {
  background: #080d18;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  padding: 14px;
  max-height: 380px;
  overflow-y: auto;
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  color: #38bdf8;
  line-height: 1.5;
}
</style>
