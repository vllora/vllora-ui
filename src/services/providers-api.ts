import { apiClient, handleApiResponse } from '@/lib/api-client';

// Credentials types based on the Rust backend
export interface ApiKeyCredentials {
  api_key: string;
}

export interface AwsIAMCredentials {
  access_key: string;
  access_secret: string;
  region?: string;
}

export interface AwsApiKeyCredentials {
  api_key: string;
  region?: string;
}

export interface VertexCredentialsFile {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri?: string;
  token_uri?: string;
  auth_provider_x509_cert_url?: string;
  client_x509_cert_url?: string;
  universe_domain?: string;
}

export interface VertexCredentials {
  region: string;
  credentials: VertexCredentialsFile;
}

export type Credentials =
  | ApiKeyCredentials
  | { api_key: string; endpoint: string }
  | AwsIAMCredentials
  | AwsApiKeyCredentials
  | VertexCredentials
  | 'LangDb';

export interface ProviderInfo {
  id: string;
  name: string;
  description?: string;
  endpoint?: string;
  priority: number;
  privacy_policy_url?: string;
  terms_of_service_url?: string;
  provider_type: string;
  has_credentials: boolean;
  custom_endpoint?: string;
}

export interface ListProvidersResponse {
  providers: ProviderInfo[];
}

export interface ProviderResponse {
  provider: ProviderInfo;
}

export interface CreateProviderRequest {
  provider_type: string;
  credentials: Credentials;
}

export interface UpdateProviderRequest {
  provider_type?: string;
  credentials?: Credentials;
}

/**
 * List all providers with their credential status
 */
export async function listProviders(projectId?: string): Promise<ProviderInfo[]> {
  const response = await apiClient('/providers', {
    method: 'GET',
    ...(projectId && {
      headers: {
        'x-project-id': projectId,
      },
    }),
  });
  return handleApiResponse<ProviderInfo[]>(response);
}

/**
 * Create a new provider
 */
export async function createProvider(request: CreateProviderRequest, projectId?: string): Promise<ProviderInfo> {
  const response = await apiClient('/providers', {
    method: 'POST',
    body: JSON.stringify(request),
    ...(projectId && {
      headers: {
        'x-project-id': projectId,
      },
    }),
  });
  const data = await handleApiResponse<ProviderResponse>(response);
  return data.provider;
}

/**
 * Update provider credentials
 */
export async function updateProvider(
  providerName: string,
  request: UpdateProviderRequest,
  projectId?: string
): Promise<ProviderInfo> {
  const response = await apiClient(`/providers/${providerName}`, {
    method: 'PUT',
    body: JSON.stringify(request),
    ...(projectId && {
      headers: {
        'x-project-id': projectId,
      },
    }),
  });
  const data = await handleApiResponse<ProviderResponse>(response);
  return data.provider;
}

/**
 * Delete provider credentials
 */
export async function deleteProvider(providerName: string, projectId?: string): Promise<void> {
  const response = await apiClient(`/providers/${providerName}`, {
    method: 'DELETE',
    ...(projectId && {
      headers: {
        'x-project-id': projectId,
      },
    }),
  });
  await handleApiResponse<void>(response);
}
