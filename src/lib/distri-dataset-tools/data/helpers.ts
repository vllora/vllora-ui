/**
 * Data Tools Helpers
 *
 * Shared helper functions for data tools.
 */

/**
 * Get current project ID from URL or default
 */
export async function getCurrentProjectId(): Promise<string> {
  const urlParams = new URLSearchParams(window.location.search);
  const projectId = urlParams.get('project_id');
  if (projectId) return projectId;
  return 'default';
}
