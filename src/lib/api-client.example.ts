/**
 * Examples of how to use the API client
 * This file demonstrates the usage - delete it if not needed
 */

import { api, handleApiResponse } from './api-client';

// Example 1: Simple GET request
export async function getProjects() {
  const response = await api.get('/projects');
  return handleApiResponse(response);
}

// Example 2: POST request with data
export async function createProject(name: string, description: string) {
  const response = await api.post('/projects', {
    name,
    description,
  });
  return handleApiResponse(response);
}

// Example 3: PUT request
export async function updateProject(id: string, data: any) {
  const response = await api.put(`/projects/${id}`, data);
  return handleApiResponse(response);
}

// Example 4: DELETE request
export async function deleteProject(id: string) {
  const response = await api.delete(`/projects/${id}`);
  return handleApiResponse(response);
}

// Example 5: Using in a React component
/*
import { api, handleApiResponse } from '@/lib/api-client';

function MyComponent() {
  const fetchData = async () => {
    try {
      const response = await api.get('/my-endpoint');
      const data = await handleApiResponse(response);
      console.log(data);
    } catch (error) {
      console.error('Failed to fetch:', error);
    }
  };

  return <button onClick={fetchData}>Fetch Data</button>;
}
*/

// Example 6: Custom headers
export async function uploadFile(file: File) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await api.post('/upload', formData, {
    headers: {
      // Content-Type will be set automatically by browser for FormData
    },
  });

  return handleApiResponse(response);
}
