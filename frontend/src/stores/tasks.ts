import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface TaskItem {
  id: number;
  title: string;
  status: 'ready' | 'running' | 'done' | 'failed';
  result?: string | null;
  run_at?: string | null;
  is_auto?: number | boolean;
  repeat_interval?: number | null;
  cron_expression?: string | null;
  created_at?: string;
  updated_at?: string;
}

export const useTasksStore = defineStore('tasks', () => {
  const tasks = ref<TaskItem[]>([]);
  const isLoading = ref<boolean>(false);
  const isRunningBatch = ref<boolean>(false);

  async function fetchTasks() {
    isLoading.value = true;
    try {
      const res = await fetch('/api/tasks');
      if (res.ok) {
        const data = await res.json();
        tasks.value = data.tasks || [];
      }
    } catch (err) {
      console.error('Failed to load tasks:', err);
    } finally {
      isLoading.value = false;
    }
  }

  async function createTask(payload: {
    title: string;
    status?: string;
    run_at?: string;
    is_auto?: boolean;
    repeat_interval?: number;
    cron_expression?: string;
  }) {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to create task');
    }
    await fetchTasks();
  }

  async function updateTask(
    id: number,
    payload: {
      title?: string;
      status?: string;
      result?: string;
      run_at?: string;
      is_auto?: boolean;
      repeat_interval?: number | null;
      cron_expression?: string | null;
    }
  ) {
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to update task');
    }
    await fetchTasks();
  }

  async function deleteTask(id: number) {
    const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to delete task');
    }
    await fetchTasks();
  }

  async function runReadyTasks() {
    isRunningBatch.value = true;
    try {
      const res = await fetch('/api/tasks/run', { method: 'POST' });
      if (res.ok) {
        await fetchTasks();
      }
    } catch (err) {
      console.error('Failed to run ready tasks:', err);
    } finally {
      isRunningBatch.value = false;
    }
  }

  return {
    tasks,
    isLoading,
    isRunningBatch,
    fetchTasks,
    createTask,
    updateTask,
    deleteTask,
    runReadyTasks,
  };
});
