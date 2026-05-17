import { ipcMain } from 'electron';
import type { SkillManager } from '../../session/skill-manager.js';
import type { SkillCreateInput, SkillUpdateInput } from '../../types/skill.js';
import { logger } from '../../utils/logger.js';

export function setupSkillHandlers(skillManager: SkillManager): void {
  ipcMain.handle('skill:list', () => {
    try {
      return skillManager.list();
    } catch (error) {
      logger.error(`[IPC] Failed to list skills: ${error}`);
      return [];
    }
  });

  ipcMain.handle('skill:get', (_event, id: string) => {
    try {
      return skillManager.get(id);
    } catch (error) {
      logger.error(`[IPC] Failed to get skill ${id}: ${error}`);
      return null;
    }
  });

  ipcMain.handle('skill:create', (_event, input: SkillCreateInput) => {
    try {
      return { success: true, skill: skillManager.create(input) };
    } catch (error) {
      logger.error(`[IPC] Failed to create skill: ${error}`);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('skill:update', (_event, id: string, updates: SkillUpdateInput) => {
    try {
      return { success: true, skill: skillManager.update(id, updates) };
    } catch (error) {
      logger.error(`[IPC] Failed to update skill ${id}: ${error}`);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('skill:delete', (_event, id: string) => {
    try {
      return { success: true, deleted: skillManager.delete(id) };
    } catch (error) {
      logger.error(`[IPC] Failed to delete skill ${id}: ${error}`);
      return { success: false, error: String(error) };
    }
  });
}
