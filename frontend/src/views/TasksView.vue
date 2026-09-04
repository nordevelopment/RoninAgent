<script setup lang="ts">
import { ref, onMounted } from 'vue';
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
    <header class="chat-header cyber-tile--bottom">
      <div style="display: flex; align-items: center; gap: 12px;">
        <button class="cyber-btn cyber-btn--cyan" @click="router.push('/')">
          ← BACK TO CHAT
        </button>
        <div class="system-status">TASK CONTROL MATRIX</div>
      </div>

      <div style="display: flex; gap: 10px;">
        <button
          class="cyber-btn cyber-btn--magenta"
          :disabled="tasksStore.isRunningBatch"
          @click="tasksStore.runReadyTasks"
        >
          {{ tasksStore.isRunningBatch ? '⚡ RUNNING...' : '⚡ RUN READY TASKS' }}
        </button>
        <button class="cyber-btn cyber-btn--green" @click="openAddModal">
          + CREATE TASK
        </button>
      </div>
    </header>

    <!-- Content Area -->
    <div class="tasks-content">
      <table class="cyber-table">
        <thead>
          <tr>
            <th style="width: 60px;">ID</th>
            <th>INSTRUCTION / TITLE</th>
            <th style="width: 100px;">STATUS</th>
            <th style="width: 120px;">MODE</th>
            <th style="width: 160px;">SCHEDULED RUN</th>
            <th style="width: 160px;">CREATED AT</th>
            <th style="width: 180px;">ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in tasksStore.tasks" :key="t.id">
            <td>#{{ t.id }}</td>
            <td class="task-title-cell">
              <strong>{{ t.title }}</strong>
            </td>
            <td>
              <span class="cyber-badge" :class="'cyber-badge--' + t.status">
                {{ t.status.toUpperCase() }}
              </span>
            </td>
            <td>
              <span v-if="t.cron_expression" class="mode-tag">CRON ({{ t.cron_expression }})</span>
              <span v-else-if="t.repeat_interval" class="mode-tag">REPEAT ({{ t.repeat_interval }}s)</span>
              <span v-else-if="t.is_auto" class="mode-tag">AUTO</span>
              <span v-else class="mode-tag manual">MANUAL</span>
            </td>
            <td>{{ formatDate(t.run_at) }}</td>
            <td>{{ formatDate(t.created_at) }}</td>
            <td class="actions-cell">
              <button
                v-if="t.result"
                class="cyber-btn cyber-btn--xs cyber-btn--cyan"
                title="View Result"
                @click="viewResult(t)"
              >
                👁 RESULT
              </button>
              <button
                class="cyber-btn cyber-btn--xs"
                title="Edit Task"
                @click="openEditModal(t)"
              >
                ✏️
              </button>
              <button
                class="cyber-btn cyber-btn--xs cyber-btn--red"
                title="Delete Task"
                @click="handleDeleteTask(t.id)"
              >
                🗑
              </button>
            </td>
          </tr>

          <tr v-if="tasksStore.tasks.length === 0">
            <td colspan="7" class="empty-table-cell">
              {{ tasksStore.isLoading ? 'LOADING TASKS...' : 'NO TASKS FOUND. CREATE ONE TO GET STARTED.' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Create / Edit Task Modal -->
    <div v-if="isModalOpen" class="task-modal-overlay" @click.self="closeModal">
      <div class="task-modal-card">
        <div class="task-modal-header">
          <div class="task-modal-title cyber-text-glow">
            {{ editingTaskId ? 'EDIT TASK #' + editingTaskId : 'CREATE NEW TASK' }}
          </div>
          <button class="task-modal-close" @click="closeModal">✕</button>
        </div>

        <div class="task-modal-body">
          <div class="cyber-form-group">
            <label class="cyber-label">TASK INSTRUCTION / TITLE *</label>
            <textarea
              v-model="formTitle"
              class="cyber-textarea"
              rows="3"
              placeholder="e.g. Check server logs and summarize errors"
            ></textarea>
          </div>

          <div class="form-row">
            <div class="cyber-form-group flex-1">
              <label class="cyber-label">STATUS</label>
              <select v-model="formStatus" class="cyber-select">
                <option value="ready">READY</option>
                <option value="running">RUNNING</option>
                <option value="done">DONE</option>
                <option value="failed">FAILED</option>
              </select>
            </div>

            <div class="cyber-form-group flex-1">
              <label class="cyber-label">SCHEDULED RUN TIME</label>
              <input v-model="formRunAt" type="datetime-local" class="cyber-input" />
            </div>
          </div>

          <div class="form-row">
            <div class="cyber-form-group flex-1">
              <label class="cyber-label">REPEAT INTERVAL (SECONDS)</label>
              <input
                v-model.number="formRepeatInterval"
                type="number"
                class="cyber-input"
                placeholder="Optional, e.g. 3600"
              />
            </div>

            <div class="cyber-form-group flex-1">
              <label class="cyber-label">CRON EXPRESSION</label>
              <input
                v-model="formCron"
                type="text"
                class="cyber-input"
                placeholder="Optional, e.g. 0 * * * *"
              />
            </div>
          </div>

          <div class="cyber-form-group checkbox-group">
            <label class="cyber-checkbox-label">
              <input v-model="formIsAuto" type="checkbox" />
              <span>ENABLE AUTOMATIC BACKGROUND EXECUTION</span>
            </label>
          </div>
        </div>

        <div class="task-modal-footer">
          <button class="cyber-btn" @click="closeModal">CANCEL</button>
          <button class="cyber-btn cyber-btn--green" @click="handleSaveTask">
            {{ editingTaskId ? 'SAVE CHANGES' : 'CREATE TASK' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Task Result Modal -->
    <div v-if="isResultModalOpen && activeResultTask" class="task-modal-overlay" @click.self="closeResultModal">
      <div class="task-modal-card task-modal-card--lg">
        <div class="task-modal-header">
          <div class="task-modal-title cyber-text-glow">
            EXECUTION RESULT: #{{ activeResultTask.id }}
          </div>
          <button class="task-modal-close" @click="closeResultModal">✕</button>
        </div>

        <div class="task-modal-body">
          <div class="cyber-form-group">
            <label class="cyber-label">TASK INSTRUCTION</label>
            <div class="result-instruction-box">{{ activeResultTask.title }}</div>
          </div>

          <div class="cyber-form-group">
            <label class="cyber-label">OUTPUT / LOG</label>
            <pre class="result-output-box"><code>{{ activeResultTask.result }}</code></pre>
          </div>
        </div>

        <div class="task-modal-footer">
          <button class="cyber-btn cyber-btn--cyan" @click="closeResultModal">CLOSE</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tasks-container {
  display: flex;
  flex-direction: column;
  flex: 1;
  height: 100vh;
  overflow: hidden;
  background: var(--color-bg-main, #0b0f19);
}

.tasks-content {
  flex: 1;
  overflow: auto;
  padding: 20px;
}

.task-title-cell {
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mode-tag {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  padding: 2px 6px;
  background: rgba(0, 240, 255, 0.1);
  border: 1px solid rgba(0, 240, 255, 0.3);
  border-radius: 3px;
}

.mode-tag.manual {
  opacity: 0.5;
  border-color: rgba(255, 255, 255, 0.2);
}

.actions-cell {
  display: flex;
  gap: 6px;
}

.empty-table-cell {
  text-align: center;
  padding: 40px;
  color: rgba(255, 255, 255, 0.4);
  font-family: var(--font-mono, monospace);
}

.cyber-badge--ready { background: rgba(0, 240, 255, 0.2); color: #00f0ff; border: 1px solid #00f0ff; }
.cyber-badge--running { background: rgba(255, 170, 0, 0.2); color: #ffaa00; border: 1px solid #ffaa00; }
.cyber-badge--done { background: rgba(0, 255, 136, 0.2); color: #00ff88; border: 1px solid #00ff88; }
.cyber-badge--failed { background: rgba(255, 0, 85, 0.2); color: #ff0055; border: 1px solid #ff0055; }

/* Custom Scoped Modal */
.task-modal-overlay {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(3, 8, 16, 0.85);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 99999;
}

.task-modal-card {
  background: #101726;
  border: 1px solid var(--cyber-cyan-500, #00f0ff);
  border-radius: 8px;
  width: 90%;
  max-width: 580px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 0 35px rgba(0, 240, 255, 0.25);
  color: #e2e8f0;
}

.task-modal-card--lg {
  max-width: 800px;
}

.task-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(0, 240, 255, 0.2);
  background: rgba(0, 240, 255, 0.04);
}

.task-modal-title {
  font-family: var(--font-mono, monospace);
  font-size: 14px;
  font-weight: bold;
  color: var(--cyber-cyan-300, #87eaf2);
}

.task-modal-close {
  background: none;
  border: none;
  color: #fff;
  font-size: 18px;
  cursor: pointer;
  padding: 2px 6px;
  opacity: 0.7;
  transition: opacity 0.2s;
}

.task-modal-close:hover {
  opacity: 1;
}

.task-modal-body {
  padding: 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.task-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid rgba(0, 240, 255, 0.2);
  background: rgba(0, 240, 255, 0.02);
}

.form-row {
  display: flex;
  gap: 12px;
}

.flex-1 {
  flex: 1;
}

.checkbox-group {
  margin-top: 6px;
}

.cyber-checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  cursor: pointer;
}

.result-instruction-box {
  background: rgba(0, 0, 0, 0.3);
  padding: 10px;
  border-radius: 4px;
  font-size: 13px;
}

.result-output-box {
  background: #060a12;
  border: 1px solid rgba(0, 240, 255, 0.2);
  padding: 12px;
  border-radius: 4px;
  max-height: 350px;
  overflow: auto;
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  white-space: pre-wrap;
}
</style>
