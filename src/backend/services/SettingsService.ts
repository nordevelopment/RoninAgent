/**
 * SettingsService.ts - Service for managing system configuration and persistent environment settings
 * Author: Antigravity AI
 */

import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { updateEnvFile } from '../utils/envHelper.js';
import { getAIProvidersList, AIProvider } from '../config/ai_providers.js';
import { TelegramBot } from './TelegramBot.js';
import logger from '../utils/logger.js';

export interface UpdateSettingsDto {
  aiApiKey?: string;
  aiApiUrl?: string;
  aiDefaultModel?: string;
  telegramBotToken?: string;
  allowedTelegramUserIds?: string;
  appUser?: string;
  appPassword?: string;
  togetherApiKey?: string;
  togetherImageModel?: string;
  xaiApiKey?: string;
}

export interface PublicSettingsResponse {
  providers: AIProvider[];
  hasAiApiKey: boolean;
  aiApiUrl: string;
  aiDefaultModel: string;
  hasTelegramBotToken: boolean;
  allowedTelegramUserIds: string;
  appUser: string;
  hasAppPassword: boolean;
  appPasswordMasked: string;
  hasTogetherApiKey: boolean;
  togetherImageModel: string;
  hasXaiApiKey: boolean;
  aiApiKeyMasked: string;
  telegramBotTokenMasked: string;
  togetherApiKeyMasked: string;
  xaiApiKeyMasked: string;
}

export class SettingsService {
  private telegramBot?: TelegramBot;

  constructor(telegramBot?: TelegramBot) {
    this.telegramBot = telegramBot;
  }

  /**
   * Get public system settings with masked secrets
   */
  getPublicSettings(): PublicSettingsResponse {
    return {
      providers: getAIProvidersList(),
      hasAiApiKey: !!config.AI_API_KEY,
      aiApiUrl: config.AI_API_URL || 'https://openrouter.ai/api/v1/chat/completions',
      aiDefaultModel: config.AI_DEFAULT_MODEL || 'qwen/qwen3.5-flash-02-23',
      hasTelegramBotToken: !!config.TELEGRAM_BOT_TOKEN,
      allowedTelegramUserIds: config.ALLOWED_TELEGRAM_USER_IDS || '',
      appUser: config.APP_USER || 'admin',
      hasAppPassword: !!config.APP_PASSWORD,
      appPasswordMasked: config.APP_PASSWORD ? '******' : '',
      hasTogetherApiKey: !!config.images.together.key,
      togetherImageModel: config.images.together.model || 'black-forest-labs/FLUX.2-dev',
      hasXaiApiKey: !!config.images.xai.key,
      aiApiKeyMasked: config.AI_API_KEY ? '******' : '',
      telegramBotTokenMasked: config.TELEGRAM_BOT_TOKEN ? '******' : '',
      togetherApiKeyMasked: config.images.together.key ? '******' : '',
      xaiApiKeyMasked: config.images.xai.key ? '******' : ''
    };
  }

  /**
   * Save system settings to disk (.env or config.json) and update in-memory config
   */
  async saveSettings(dto: UpdateSettingsDto): Promise<void> {
    const {
      aiApiKey,
      aiApiUrl,
      aiDefaultModel,
      telegramBotToken,
      allowedTelegramUserIds,
      appUser,
      appPassword,
      togetherApiKey,
      togetherImageModel,
      xaiApiKey
    } = dto;

    const envPath = path.join(process.cwd(), '.env');
    const configJsonPath = path.join(process.cwd(), 'config.json');
    const isNewKey = (key?: string) => key !== undefined && key !== '******';

    if (fs.existsSync(envPath)) {
      // Mode 1: .env file
      const envUpdates: Record<string, string> = {};

      if (isNewKey(aiApiKey)) {
        const clean = aiApiKey!.trim();
        envUpdates.AI_API_KEY = clean;
        config.AI_API_KEY = clean;
      }
      if (aiApiUrl !== undefined) {
        const clean = aiApiUrl.trim();
        envUpdates.AI_API_URL = clean;
        config.AI_API_URL = clean;
      }
      if (aiDefaultModel !== undefined) {
        const clean = aiDefaultModel.trim();
        envUpdates.AI_DEFAULT_MODEL = clean;
        config.AI_DEFAULT_MODEL = clean;
      }
      if (isNewKey(telegramBotToken)) {
        const clean = telegramBotToken!.trim();
        envUpdates.TELEGRAM_BOT_TOKEN = clean;
        config.TELEGRAM_BOT_TOKEN = clean;
        if (this.telegramBot) {
          this.telegramBot.updateToken(clean).catch(err => {
            logger.error({ err }, '[SettingsService] Failed to reload Telegram bot dynamically');
          });
        }
      }
      if (allowedTelegramUserIds !== undefined) {
        const clean = allowedTelegramUserIds.trim();
        envUpdates.ALLOWED_TELEGRAM_USER_IDS = clean;
        config.ALLOWED_TELEGRAM_USER_IDS = clean;
      }
      if (appUser !== undefined) {
        const clean = appUser.trim();
        envUpdates.APP_USER = clean;
        config.APP_USER = clean;
      }
      if (isNewKey(appPassword)) {
        const clean = appPassword!.trim();
        envUpdates.APP_PASSWORD = clean;
        config.APP_PASSWORD = clean;
      }
      if (isNewKey(togetherApiKey)) {
        const clean = togetherApiKey!.trim();
        envUpdates.TOGETHER_API_KEY = clean;
        config.images.together.key = clean;
      }
      if (togetherImageModel !== undefined) {
        const clean = togetherImageModel.trim();
        envUpdates.TOGETHER_IMAGE_MODEL = clean;
        config.images.together.model = clean;
      }
      if (isNewKey(xaiApiKey)) {
        const clean = xaiApiKey!.trim();
        envUpdates.XAI_API_KEY = clean;
        config.images.xai.key = clean;
      }

      updateEnvFile(envPath, envUpdates);

      // Clean up config.json if it exists to prevent conflict/duplication
      if (fs.existsSync(configJsonPath)) {
        try {
          fs.unlinkSync(configJsonPath);
        } catch {
          // ignore
        }
      }
    } else {
      // Mode 2: config.json file
      let configData: Record<string, string> = {};
      if (fs.existsSync(configJsonPath)) {
        try {
          const raw = fs.readFileSync(configJsonPath, 'utf-8');
          if (raw.trim()) {
            configData = JSON.parse(raw);
          }
        } catch {
          // ignore
        }
      }

      if (isNewKey(aiApiKey)) {
        configData.ai_api_key = aiApiKey!.trim();
        config.AI_API_KEY = configData.ai_api_key;
      }
      if (aiApiUrl !== undefined) {
        const cleanUrl = aiApiUrl.trim();
        configData.ai_api_url = cleanUrl;
        config.AI_API_URL = cleanUrl;
      }
      if (aiDefaultModel !== undefined) {
        const cleanModel = aiDefaultModel.trim();
        configData.ai_default_model = cleanModel;
        config.AI_DEFAULT_MODEL = cleanModel;
      }
      if (isNewKey(telegramBotToken)) {
        const cleanToken = telegramBotToken!.trim();
        configData.telegram_bot_token = cleanToken;
        config.TELEGRAM_BOT_TOKEN = cleanToken;
        if (this.telegramBot) {
          this.telegramBot.updateToken(cleanToken).catch(err => {
            logger.error({ err }, '[SettingsService] Failed to reload Telegram bot dynamically');
          });
        }
      }
      if (allowedTelegramUserIds !== undefined) {
        const cleanIds = allowedTelegramUserIds.trim();
        configData.allowed_telegram_user_ids = cleanIds;
        config.ALLOWED_TELEGRAM_USER_IDS = cleanIds;
      }
      if (appUser !== undefined) {
        const clean = appUser.trim();
        configData.app_user = clean;
        config.APP_USER = clean;
      }
      if (isNewKey(appPassword)) {
        const clean = appPassword!.trim();
        configData.app_password = clean;
        config.APP_PASSWORD = clean;
      }
      if (isNewKey(togetherApiKey)) {
        configData.together_api_key = togetherApiKey!.trim();
        config.images.together.key = configData.together_api_key;
      }
      if (togetherImageModel !== undefined) {
        const clean = togetherImageModel.trim();
        configData.together_image_model = clean;
        config.images.together.model = clean;
      }
      if (isNewKey(xaiApiKey)) {
        configData.xai_api_key = xaiApiKey!.trim();
        config.images.xai.key = configData.xai_api_key;
      }

      fs.writeFileSync(configJsonPath, JSON.stringify(configData, null, 2), 'utf-8');
    }
  }
}
