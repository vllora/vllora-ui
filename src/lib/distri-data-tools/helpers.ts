/**
 * Helper utilities for data tools
 */

import { listProjects } from '@/services/projects-api';

// Cache for the default project ID
let cachedDefaultProjectId: string | null = null;

/**
 * Get current project ID from URL, localStorage, or fetch from API
 * Priority: URL params > localStorage > cached default > fetch default
 */
export async function getCurrentProjectId(): Promise<string> {
  if (typeof window === 'undefined') {
    throw new Error('Cannot get project ID in server context');
  }

  // First try URL params
  const params = new URLSearchParams(window.location.search);
  const urlProjectId = params.get('project_id') || params.get('projectId');
  if (urlProjectId) return urlProjectId;

  // Use cached default if available
  if (cachedDefaultProjectId) return cachedDefaultProjectId;

  // Fetch default project from API
  try {
    const projects = await listProjects();
    const defaultProject = projects.find(p => p.is_default) || projects[0];
    if (defaultProject) {
      cachedDefaultProjectId = defaultProject.id;
      // Also cache in localStorage for next time
      localStorage.setItem('currentProjectId', defaultProject.id);
      return defaultProject.id;
    }
  } catch (error) {
    console.error('[distri-data-tools] Failed to fetch default project:', error);
  }

  throw new Error('No project ID available. Please select a project or add project_id to URL.');
}

/**
 * Helper to convert array to comma-separated string (API format)
 */
export function toCommaSeparated(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value.join(',') : value;
}
