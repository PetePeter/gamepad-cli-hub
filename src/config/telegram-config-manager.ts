import { DEFAULT_TELEGRAM_CONFIG } from './settings-manager.js';
import type { SettingsConfig, TelegramConfig } from './loader.js';

export class TelegramConfigManager {
  constructor(
    private readonly getSettings: () => SettingsConfig | null,
    private readonly saveSettings: () => void,
  ) {}

  get(): TelegramConfig {
    return this.getSettings()?.telegram ?? { ...DEFAULT_TELEGRAM_CONFIG };
  }

  set(updates: Partial<TelegramConfig>): void {
    const settings = this.getSettings();
    if (!settings) return;
    settings.telegram = {
      ...(settings.telegram ?? { ...DEFAULT_TELEGRAM_CONFIG }),
      ...updates,
    };
    this.saveSettings();
  }
}
