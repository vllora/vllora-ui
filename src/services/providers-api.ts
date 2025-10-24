import { api, handleApiResponse } from '@/lib/api-client';

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
  const response = await api.get('/providers');
  return handleApiResponse<ProviderInfo[]>(response);
}

/**
 * Create a new provider
 */
export async function createProvider(request: CreateProviderRequest): Promise<ProviderInfo> {
  const response = await api.post('/providers', request);
  const data = await handleApiResponse<ProviderResponse>(response);
  return data.provider;
}

/**
 * Update provider credentials
 */
export async function updateProvider(
  providerName: string,
  request: UpdateProviderRequest
): Promise<ProviderInfo> {
  const response = await api.put(`/providers/${providerName}`, request);
  const data = await handleApiResponse<ProviderResponse>(response);
  return data.provider;
}

/**
 * Delete provider credentials
 */
export async function deleteProvider(providerName: string): Promise<void> {
  const response = await api.delete(`/providers/${providerName}`);
  await handleApiResponse<void>(response);
}
