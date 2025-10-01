import { LOCAL_API_URL } from '@/config/api';

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

export interface CreateProjectResponse {
  project: Project;
}

export interface UpdateProjectResponse {
  project: Project;
}

/**
 * List all projects
 */
export async function listProjects(): Promise<Project[]> {
  const url = `${LOCAL_API_URL}/projects`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to list projects: ${response.status} ${response.statusText}`);
    }

    const data: Project[] = await response.json();
    return data;
  } catch (error) {
    console.error('Error listing projects:', error);
    throw error;
  }
}

/**
 * Get a specific project by ID
 */
export async function getProject(projectId: string): Promise<Project> {
  const url = `${LOCAL_API_URL}/projects/${projectId}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get project: ${response.status} ${response.statusText}`);
    }

    const data: GetProjectResponse = await response.json();
    return data.project;
  } catch (error) {
    console.error(`Error getting project ${projectId}:`, error);
    throw error;
  }
}

/**
 * Create a new project
 */
export async function createProject(request: CreateProjectRequest): Promise<Project> {
  const url = `${LOCAL_API_URL}/projects`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Failed to create project: ${response.status} ${response.statusText}`);
    }

    const data: CreateProjectResponse = await response.json();
    return data.project;
  } catch (error) {
    console.error('Error creating project:', error);
    throw error;
  }
}

/**
 * Update an existing project
 */
export async function updateProject(
  projectId: string,
  request: UpdateProjectRequest
): Promise<Project> {
  const url = `${LOCAL_API_URL}/projects/${projectId}`;

  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Failed to update project: ${response.status} ${response.statusText}`);
    }

    const data: UpdateProjectResponse = await response.json();
    return data.project;
  } catch (error) {
    console.error(`Error updating project ${projectId}:`, error);
    throw error;
  }
}

/**
 * Delete a project
 */
export async function deleteProject(projectId: string): Promise<void> {
  const url = `${LOCAL_API_URL}/projects/${projectId}`;

  try {
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to delete project: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error(`Error deleting project ${projectId}:`, error);
    throw error;
  }
}