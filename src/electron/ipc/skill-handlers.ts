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

  ipcMain.handle('skill:clone', (_event, id: string) => {
    try {
      const skill = skillManager.get(id);
      if (!skill) return { success: false, error: 'Skill not found' };
      if (!skill.type) return { success: false, error: 'Skill has no type to clone' };
      const clone = skillManager.create({
        name: skill.name,
        description: skill.description,
        body: skill.body,
        aiAmendable: true,
        allProjects: skill.allProjects,
        projectIds: skill.projectIds,
        type: skill.type,
      });
      return { success: true, skill: clone };
    } catch (error) {
      logger.error(`[IPC] Failed to clone skill ${id}: ${error}`);
      return { success: false, error: String(error) };
    }
  });
}
