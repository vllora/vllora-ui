export interface ModelPricing {
  model: string;
  model_provider: string;
  inference_provider: {
    provider: string;
    model_name: string;
  };
  description: string;
  price: {
    per_input_token: number;
    per_output_token: number;
    per_cached_input_token?: number;
    per_cached_input_write_token?: number;
    valid_from?: any;
    type_prices?: {
      hd?: {
        [key: string]: number
      },
      standard?: {
        [key: string]: number
      }
    }
  };
  input_formats: string[];
  output_formats: string[];
  capabilities?: string[];
  type: string;
  limits: {
    max_context_size: number;
  };
  release_date?: string;
  langdb_release_date?: string;
  benchmark_info?: {
    rank?: { [category: string]: number };
    scores?: { [category: string]: number };
  };
  image_price?: {
    by_type?: {
      [key: string]: {
        [key: string]: number
      }
    },
    mp_price?: number | null
  };
  endpoints?: Array<{
    provider: {
      provider: string;
      model_name: string;
      endpoint: string | null;
    };
    available: boolean;
    pricing: {
      per_input_token: number;
      per_output_token: number;
      per_cached_input_token?: number;
      per_cached_input_write_token?: number;
    };
  }>;
}

export interface ModelAnalytics {
  totalModels: number;
  totalProviders: number;
  newModelsCount: number;
  multiModalCount: number;
  avgContextSize: number;
  avgInputCost: number;
  avgOutputCost: number;
}

export interface LocalModel {
  model: string;
  model_provider: string;
  inference_provider: {
    provider: string;
    model_name: string;
    endpoint?: string;
  };
  description: string;
  price: {
    per_input_token: number;
    per_output_token: number;
    per_cached_input_token?: number;
    per_cached_input_write_token?: number;
    valid_from?: any;
    type_prices?: {
      hd?: {
        [key: string]: number
      },
      standard?: {
        [key: string]: number
      }
    }
  };
  input_formats: string[];
  output_formats: string[];
  capabilities?: string[];
  type: string;
  limits: {
    max_context_size: number;
  };
  release_date?: string;
  langdb_release_date?: string;
  benchmark_info?: {
    rank?: { [category: string]: number };
    scores?: { [category: string]: number };
  };
  image_price?: {
    by_type?: {
      [key: string]: {
        [key: string]: number
      }
    },
    mp_price?: number | null
  };
  endpoints?: Array<{
    provider: {
      provider: string;
      model_name: string;
      endpoint: string | null;
    };
    available: boolean;
    pricing: {
      per_input_token: number;
      per_output_token: number;
      per_cached_input_token?: number;
      per_cached_input_write_token?: number;
    };
  }>;
}

export interface LocalModelsResponse {
  object: string;
  data: LocalModel[];
}