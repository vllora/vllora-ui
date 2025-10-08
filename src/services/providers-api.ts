import { getBackendUrl } from '@/config/api';

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

export type BedrockCredentials =
  | { IAM: AwsIAMCredentials }
  | { ApiKey: AwsApiKeyCredentials };

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
  | BedrockCredentials
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
export async function listProviders(): Promise<ProviderInfo[]> {
  const url = `${getBackendUrl()}/providers`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to list providers: ${response.status} ${response.statusText}`);
    }

    const data:  ProviderInfo[] = await response.json();
    return data;
  } catch (error) {
    console.error('Error listing providers:', error);
    throw error;
  }
}

/**
 * Create a new provider
 */
export async function createProvider(request: CreateProviderRequest): Promise<ProviderInfo> {
  const url = `${getBackendUrl()}/providers`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Failed to create provider: ${response.status} ${response.statusText}`);
    }

    const data: ProviderResponse = await response.json();
    return data.provider;
  } catch (error) {
    console.error('Error creating provider:', error);
    throw error;
  }
}

/**
 * Update provider credentials
 */
export async function updateProvider(
  providerName: string,
  request: UpdateProviderRequest
): Promise<ProviderInfo> {
  const url = `${getBackendUrl()}/providers/${providerName}`;

  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Failed to update provider: ${response.status} ${response.statusText}`);
    }

    const data: ProviderResponse = await response.json();
    return data.provider;
  } catch (error) {
    console.error(`Error updating provider ${providerName}:`, error);
    throw error;
  }
}

/**
 * Delete provider credentials
 */
export async function deleteProvider(providerName: string): Promise<void> {
  const url = `${getBackendUrl()}/providers/${providerName}`;

  try {
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Failed to delete provider: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error(`Error deleting provider ${providerName}:`, error);
    throw error;
  }
}
