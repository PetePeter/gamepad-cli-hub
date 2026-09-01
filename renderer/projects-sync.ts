/**
 * Project mirror — refreshes `state.projects` from the main process.
 *
 * Lives outside `useAppBootstrap` because the pop-out shell needs the project
 * list (the Mess pane derives its project from the active session) but must not
 * pull in the main-window bootstrap graph: terminal manager, gamepad polling and
 * the session screens all hang off that module.
 */

import { state } from './state.js';
import { projectsClient } from './ipc/clients.js';

export type RendererProjectRecord = {
  id: string;
  name: string;
  canonicalPath: string;
  alternatePaths?: string[];
};

export async function refreshProjects(): Promise<void> {
  if (!projectsClient.projectList) return;
  try {
    const projects = (await projectsClient.projectList()) || [];
    state.projects = projects.map((project: RendererProjectRecord) => ({
      id: project.id,
      name: project.name,
      canonicalPath: project.canonicalPath,
      alternatePaths: project.alternatePaths || [],
    }));
  } catch (error) {
    console.error('[Projects] Failed to load projects:', error);
    state.projects = [];
  }
}
