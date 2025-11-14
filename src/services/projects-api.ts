import { api, handleApiResponse } from '@/lib/api-client';

export interface Project {
  id: string;
  name: string;
  description?: string;
  settings?: Record<string, any>;
  owner_id: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  settings?: Record<string, any>;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  settings?: Record<string, any>;
  is_default?: boolean;
}

export interface ListProjectsResponse {
  projects: Project[];
}

export interface GetProjectResponse {
  project: Project;
}


export interface UpdateProjectResponse {
  project: Project;
}

/**
 * List all projects
 */
export async function listProjects(): Promise<Project[]> {
  const response = await api.get('/projects');
  return handleApiResponse<Project[]>(response);
}

/**
 * Get a specific project by ID
 */
export async function getProject(projectId: string): Promise<Project> {
  const response = await api.get(`/projects/${projectId}`);
  const data = await handleApiResponse<GetProjectResponse>(response);
  return data.project;
}

/**
 * Create a new project
 */
export async function createProject(request: CreateProjectRequest): Promise<Project> {
  const response = await api.post('/projects', request);
  const data = await handleApiResponse<Project>(response);
  return data;
}

/**
 * Update an existing project
 */
export async function updateProject(
  projectId: string,
  request: UpdateProjectRequest
): Promise<Project> {
  const response = await api.put(`/projects/${projectId}`, request);
  const data = await handleApiResponse<Project>(response);
  return data;
}

/**
 * Delete a project (archive)
 */
export async function deleteProject(projectId: string): Promise<void> {
  const response = await api.post(`/projects/${projectId}/archive`);
  await handleApiResponse<void>(response);
}