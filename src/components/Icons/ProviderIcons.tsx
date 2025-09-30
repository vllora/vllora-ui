import { SVGProps } from 'react';

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ')
}

export const getActualIconName = (provider_name: string, fallbackProviderName?: string) => {
  let actualProviderName = provider_name;
  if(provider_name ==='z-ai') actualProviderName = 'zai';
  if(provider_name ==='mistralai') actualProviderName = 'mistral';
  if(provider_name ==='meta-llama') actualProviderName = 'meta';
  if(provider_name ==='minimax') actualProviderName = 'minimax';
  if(provider_name ==='x-ai') actualProviderName = 'xai';
  if(provider_name ==='stepfun-ai' || provider_name ==='stepfun') actualProviderName = 'stepfun';
  if(provider_name ==='aion-labs') actualProviderName = 'aionlabs';
  if(['arli', 'arliai', 'arli-ai'].includes(provider_name)) actualProviderName = 'arli';
  if(['moonshot', 'moonshot-ai', 'moonshotai'].includes(provider_name)) actualProviderName = 'moonshot';
  if(['arcee', 'arceeai', 'arcee-ai'].includes(provider_name)) actualProviderName = 'arcee';
  if(['huggingface', 'huggingface-color', 'anthracite-org','gryphe', 'neversleep','scb10x', 'cognitivecomputations','sophosympatheia', 'alfredpros', 'alpindale', 'eleutherai', 'shisa-ai', 'sao10k', 'thudm','raifle', 'tngtech', 'undi95'].includes(provider_name)) actualProviderName = 'huggingface';
  if(!fallbackProviderName && ['openrouter', 'opengvlab'].includes(provider_name)) actualProviderName = 'openrouter';
  if(['agentica', 'agenticaai', 'agentica-ai', 'agentica-org'].includes(provider_name)) actualProviderName = 'agentica';
  if(['aws', 'amazon-web-services', 'amazon'].includes(provider_name)) actualProviderName = 'aws';
  if(['parasail', 'parasail-ai', 'parasailai'].includes(provider_name)) actualProviderName = 'parasail';
  if(['azureai', 'azure-ai', 'azureai-ai', 'azure'].includes(provider_name)) actualProviderName = 'azureai';
  if(['vertexai', 'vertex-ai', 'vertexai-ai', 'vertex'].includes(provider_name)) actualProviderName = 'vertexai';
  return actualProviderName;
}

export const providerIcons: Record<string, { urlSource: string; invert: boolean }> = {
  openai: { urlSource: '/provider-icons/openai.svg', invert: true },
  gemini: { urlSource: '/provider-icons/gemini.svg', invert: false },
  anthropic: { urlSource: '/provider-icons/anthropic.svg', invert: true },
  cohere: { urlSource: '/provider-icons/cohere.svg', invert: false },
  mistral: { urlSource: '/provider-icons/mistral.svg', invert: false },
  together: { urlSource: '/provider-icons/togetherai.svg', invert: false },
  bedrock: { urlSource: '/provider-icons/bedrock.svg', invert: true },
  meta: { urlSource: '/provider-icons/meta.svg', invert: false },
  deepseek: { urlSource: '/provider-icons/deepseek.svg', invert: false },
  xai: { urlSource: '/provider-icons/xai.svg', invert: false },
  fireworks: { urlSource: '/provider-icons/fireworksai.svg', invert: false },
  deepinfra: { urlSource: '/provider-icons/deepinfra.svg', invert: false },
  openrouter: { urlSource: '/provider-icons/openrouter.svg', invert: true },
  google: { urlSource: '/provider-icons/google.svg', invert: false },
  groq: { urlSource: '/provider-icons/groq.svg', invert: true },
  perplexity: { urlSource: '/provider-icons/perplexity.svg', invert: false },
  nvidia: { urlSource: '/provider-icons/nvidia.svg', invert: false },
  default: { urlSource: '/provider-icons/langdb.svg', invert: false },
};

export const getProviderIconByName = (provider_name: string, fallbackProviderName?: string): any => {
  let actualProviderName = getActualIconName(provider_name, fallbackProviderName);
  let result = providerIcons[actualProviderName.toLowerCase() as keyof typeof providerIcons]
  if(result) return result;
  if(fallbackProviderName){
    let fallbackResult = getProviderIconByName(fallbackProviderName);
    return fallbackResult;
  }
  return providerIcons.default;
}

export interface ProviderIconProps extends SVGProps<SVGSVGElement> {
  provider_name: string;
  className?: string;
  fallbackProviderName?: string;
  invert?: boolean;
}

export const ProviderIcon = (props: ProviderIconProps) => {
  const { provider_name, className, fallbackProviderName, invert } = props;
  const icon = provider_name ? getProviderIconByName(provider_name, fallbackProviderName) : providerIcons.default;

  return icon ? (
    <div className={classNames(className ? className : 'w-6 h-6 mr-2', `${(icon?.invert || invert) ? 'dark:invert' : ''}`)}>
      <img
        src={icon.urlSource}
        alt={provider_name}
        className={className ? className : "w-6 h-6 mr-2"}
      />
    </div>
  ) : <></>;
}