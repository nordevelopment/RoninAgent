/**
 * TaskService.ts - Service for managing and executing background tasks
 * Author: Antigravity AI
 */

import { DatabaseClient } from '../database/DatabaseClient.js';
import { TaskModel, Task, CreateTask } from '../models/task.js';
import { ChatManager } from '../ai/ChatManager.js';
import { TelegramBot } from './TelegramBot.js';
import { config } from '../config.js';
import { getNextRunTime } from '../utils/schedule.js';
import logger from '../utils/logger.js';

export class TaskService {
  private taskModel: TaskModel;
  private chatManager: ChatManager;
  private telegramBot?: TelegramBot;
  private isExecutingTasks = false;
  private schedulerInterval: NodeJS.Timeout | null = null;

  constructor(db: DatabaseClient, chatManager: ChatManager, telegramBot?: TelegramBot) {
    this.taskModel = new TaskModel(db);
    this.chatManager = chatManager;
    this.telegramBot = telegramBot;
  }

  /**
   * Get all tasks
   */
  async getAllTasks(): Promise<Task[]> {
    return await this.taskModel.findAll();
  }

  /**
   * Find task by ID
   */
  async getTaskById(id: number): Promise<Task | null> {
    return await this.taskModel.findById(id);
  }

  /**
   * Create a new task
   */
  async createTask(dto: CreateTask): Promise<number> {
    return await this.taskModel.create(dto);
  }

  /**
   * Update task by ID
   */
  async updateTask(id: number, data: Partial<CreateTask>): Promise<number> {
    return await this.taskModel.update(id, data);
  }

  /**
   * Delete task by ID
   */
  async deleteTask(id: number): Promise<number> {
    return await this.taskModel.delete(id);
  }

  /**
   * Trigger execution of all ready tasks (manual or triggered)
   */
  async triggerReadyTasks(onlyAuto = false): Promise<{ success: boolean; message: string; count: number }> {
    if (this.isExecutingTasks) {
      return { success: true, message: 'Task execution is already in progress', count: 0 };
    }

    const nowIso = new Date().toISOString();
    const readyTasks = await this.taskModel.claimReadyTasks(nowIso, onlyAuto);

    if (readyTasks.length === 0) {
      return { success: true, message: 'No tasks ready to run', count: 0 };
    }

    this.isExecutingTasks = true;
    this.executeTasks(readyTasks)
      .catch(err => {
        logger.error({ err }, '[TaskService] Error in background task execution');
      })
      .finally(() => {
        this.isExecutingTasks = false;
      });

    return {
      success: true,
      message: `Started executing ${readyTasks.length} tasks in the background.`,
      count: readyTasks.length
    };
  }

  /**
   * Execute list of tasks sequentially in isolated chat sessions
   */
  private async executeTasks(tasksToRun: Task[]): Promise<void> {
    let telegramOwnerId: number | null = null;
    if (config.ALLOWED_TELEGRAM_USER_IDS) {
      const firstId = config.ALLOWED_TELEGRAM_USER_IDS.split(',')[0].trim();
      if (firstId) {
        telegramOwnerId = parseInt(firstId, 10);
      }
    }

    for (const task of tasksToRun) {
      const taskSessionId = `task_${task.id}`;

      try {
        // Ensure isolated session exists for this specific task
        const session = await this.chatManager.getSession(taskSessionId);
        if (!session) {
          await this.chatManager.createSession(taskSessionId, 'main_agent');
          const taskTitleTruncated = task.title.length > 40 ? task.title.slice(0, 37) + '...' : task.title;
          await this.chatManager.updateSessionTitle(taskSessionId, `⚡ [Task #${task.id}] ${taskTitleTruncated}`);
        }

        if (telegramOwnerId && this.telegramBot) {
          await this.telegramBot.sendMessage(telegramOwnerId, `⏳ **[TASK #${task.id}] STARTED**\nInstruction: "${task.title}"`).catch(err => {
            logger.error({ err }, '[Telegram] Notification error on task start');
          });
        }

        // Execute task instruction inside its dedicated session
        const response = await this.chatManager.sendMessage(task.title, taskSessionId);

        // Check if task is recurring (CRON or repeat interval)
        const nextRunIso = getNextRunTime(task);

        if (nextRunIso) {
          await this.taskModel.update(task.id, {
            status: 'ready',
            run_at: nextRunIso,
            result: response.content
          });
        } else {
          await this.taskModel.update(task.id, {
            status: 'done',
            result: response.content
          });
        }

        if (telegramOwnerId && this.telegramBot) {
          const statusHeader = nextRunIso ? `🔁 **[TASK #${task.id}] RECURRED** (Next: ${nextRunIso})` : `✅ **[TASK #${task.id}] COMPLETED**`;
          await this.telegramBot.sendMessage(telegramOwnerId, `${statusHeader}\nInstruction: "${task.title}"\n\nResult:\n${response.content}`).catch(err => {
            logger.error({ err }, '[Telegram] Notification error on task completion');
          });
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error({ err: error, taskId: task.id }, `[TaskService] Failed to execute task #${task.id}`);

        const nextRunIso = getNextRunTime(task);
        if (nextRunIso) {
          await this.taskModel.update(task.id, {
            status: 'ready',
            run_at: nextRunIso,
            result: `Error: ${errorMsg}`
          });
        } else {
          await this.taskModel.update(task.id, {
            status: 'failed',
            result: errorMsg
          });
        }

        if (telegramOwnerId && this.telegramBot) {
          await this.telegramBot.sendMessage(telegramOwnerId, `❌ **[TASK #${task.id}] FAILED**\nInstruction: "${task.title}"\n\nError: ${errorMsg}`).catch(err => {
            logger.error({ err }, '[Telegram] Notification error on task failure');
          });
        }
      }
    }
  }

  /**
   * Start the background scheduler (scans for ready auto-tasks)
   */
  startScheduler(intervalMs = 60000): void {
    if (this.schedulerInterval) return;

    this.schedulerInterval = setInterval(async () => {
      try {
        await this.triggerReadyTasks(true);
      } catch (err) {
        logger.error({ err }, '[TaskService] Error in automatic task scheduler tick');
      }
    }, intervalMs);
  }

  /**
   * Stop background scheduler
   */
  stopScheduler(): void {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }
  }
}
