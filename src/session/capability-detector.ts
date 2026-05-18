import { existsSync, accessSync, constants } from 'fs';
import type { ConfigLoader } from '../config/loader.js';

export interface TelegramCapabilities {
  available: boolean;
  openwhisper: boolean;
  piper: boolean;
  ffmpeg: boolean;
}

export class CapabilityDetector {
  private cache: TelegramCapabilities | null = null;

  constructor(private configLoader: ConfigLoader) {}

  getCapabilities(): TelegramCapabilities {
    // Return cached result if available
    if (this.cache) {
      return this.cache;
    }

    const config = this.configLoader.getTelegramConfig();

    // If Telegram is disabled, all capabilities are false
    if (!config?.enabled) {
      this.cache = {
        available: false,
        openwhisper: false,
        piper: false,
        ffmpeg: false,
      };
      return this.cache;
    }

    // Check each tool path
    const capabilities: TelegramCapabilities = {
      available: true,
      openwhisper: this.verifyToolPath(config?.openWhisprPath),
      piper: this.verifyToolPath(config?.piperPath),
      ffmpeg: this.verifyToolPath(config?.ffmpegPath),
    };

    this.cache = capabilities;
    return capabilities;
  }

  invalidateCache(): void {
    this.cache = null;
  }

  private verifyToolPath(toolPath: string | undefined): boolean {
    // Empty or undefined path
    if (!toolPath || toolPath.trim() === '') {
      return false;
    }

    try {
      // Check if file exists
      if (!existsSync(toolPath)) {
        return false;
      }

      // Check if file is executable
      accessSync(toolPath, constants.X_OK);
      return true;
    } catch {
      // File not accessible/executable
      return false;
    }
  }
}
