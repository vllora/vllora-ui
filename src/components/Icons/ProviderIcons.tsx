import openai from "./openai.svg";
import gemini from "./gemini.svg";
import anthropic from "./anthropic.svg";
import cohere from "./cohere.svg";
import bedrock from "./bedrock.svg";
import mistral from "./mistral.svg";
import meta from "./meta.svg";
import langdb from "./langdb.svg";
import lambda from "./lambda.svg";
import xai from "./xai.svg";
import deepseek from "./deepseek.svg";
import togetherai from "./together-ai.svg";
import fireworksai from "./fireworksai.svg";
import routers from "./routers.svg";
import deepinfra from "./deepinfra.svg";
import openrouter from "./openrouter.svg";
import amazon from "./amazon.svg";
import zai from "./zai.svg";
import nousresearch from "./nousresearch.svg";
import qwen from "./qwen.svg";
import perplexity from "./perplexity.svg";
import minimax from "./minimax.svg";
import nvidia from "./nvidia.svg";
import { SVGProps } from "react";
import langdb_white from "./langdb_white.svg";
import aionlabs from "./aionlabs.svg";
import microsoft from "./microsoft.svg";
import moonshot from "./moonshot.svg";
import arcee from "./arcee.svg";
import switchpoint from "./switchpoint.svg";
import bytedance from "./bytedance.svg";
import baidu from "./baidu.svg";
import agentica from "./agentica.svg";
import huggingface from "./huggingface.svg";
import liquid from "./liquid.svg";
import tencent from "./tencent.svg";
import arli from "./arli.svg";
import upstage from "./upstage.svg";
import infermatic from "./infermatic.svg";
import inflection from "./inflection.svg";
import google from './google.svg';
import mancer from "./mancer.svg";
import aws from "./aws.svg";
import parasail from "./parasail.svg";
import azureai from "./azureai.svg";
import vertexai from "./vertexai.svg";
import stepfun from "./stepfun.svg";
import ai21 from "./ai21.svg";
import pygmalionai from "./pygmalionai.svg";
import groq from "./groq.svg";
import { cn } from "@/lib/utils";
import { CuboidIcon } from "lucide-react";
// Use relative URLs for better compatibility with different ports/domains
const getIconUrl = (iconName: string) => {
  return `/provider-icons/${iconName}.svg`;
};

export const providerIcons: Record<string, { icon: any; invert: boolean; urlSource: string; }> = {
  openai: { icon: openai, invert: true, urlSource: getIconUrl('openai') },
  gemini: { icon: gemini, invert: false, urlSource: getIconUrl('gemini') },
  anthropic: { icon: anthropic, invert: true, urlSource: getIconUrl('anthropic') },
  cohere: { icon: cohere, invert: false, urlSource: getIconUrl('cohere') },
  mistral: { icon: mistral, invert: false, urlSource: getIconUrl('mistral') },
  bedrock: { icon: bedrock, invert: true, urlSource: getIconUrl('bedrock') },
  awslambda: { icon: lambda, invert: false, urlSource: getIconUrl('awslambda') },
  meta: { icon: meta, invert: false, urlSource: getIconUrl('meta') },
  langdbfunctions: { icon: langdb, invert: false, urlSource: getIconUrl('langdb') },
  langdb: { icon: langdb, invert: false, urlSource: getIconUrl('langdb') },
  langdb_white: { icon: langdb_white, invert: false, urlSource: getIconUrl('langdb_white') },
  deepseek: { icon: deepseek, invert: false, urlSource: getIconUrl('deepseek') },
  xai: { icon: xai, invert: false, urlSource: getIconUrl('xai') },
  togetherai: { icon: togetherai, invert: false, urlSource: getIconUrl('togetherai') },
  fireworksai: { icon: fireworksai, invert: false, urlSource: getIconUrl('fireworksai') },
  routers: { icon: routers, invert: true, urlSource: getIconUrl('routers') },
  deepinfra: { icon: deepinfra, invert: false, urlSource: getIconUrl('deepinfra') },
  openrouter: { icon: openrouter, invert: true, urlSource: getIconUrl('openrouter') },
  amazon: { icon: amazon, invert: true, urlSource: getIconUrl('amazon') },
  zai: { icon: zai, invert: false, urlSource: getIconUrl('zai') },
  qwen: { icon: qwen, invert: false, urlSource: getIconUrl('qwen') },
  minimax: { icon: minimax, invert: false, urlSource: getIconUrl('minimax') },
  nousresearch: { icon: nousresearch, invert: true, urlSource: getIconUrl('nousresearch') },
  perplexity: { icon: perplexity, invert: false, urlSource: getIconUrl('perplexity') },
  nvidia: { icon: nvidia, invert: false, urlSource: getIconUrl('nvidia') },
  aionlabs: { icon: aionlabs, invert: false, urlSource: getIconUrl('aionlabs') },
  microsoft: { icon: microsoft, invert: false, urlSource: getIconUrl('microsoft') },
  moonshot: { icon: moonshot, invert: true, urlSource: getIconUrl('moonshot') },
  arcee: { icon: arcee, invert: false, urlSource: getIconUrl('arcee') },
  switchpoint: { icon: switchpoint, invert: false, urlSource: getIconUrl('switchpoint') },
  bytedance: { icon: bytedance, invert: false, urlSource: getIconUrl('bytedance') },
  baidu: { icon: baidu, invert: false, urlSource: getIconUrl('baidu') },
  agentica: { icon: agentica, invert: false, urlSource: getIconUrl('agentica') },
  huggingface: { icon: huggingface, invert: false, urlSource: getIconUrl('huggingface') },
  liquid: { icon: liquid, invert: true, urlSource: getIconUrl('liquid') },
  tencent: { icon: tencent, invert: false, urlSource: getIconUrl('tencent') },
  arli: { icon: arli, invert: false, urlSource: getIconUrl('arli') },
  upstage: { icon: upstage, invert: false, urlSource: getIconUrl('upstage') },
  infermatic: { icon: infermatic, invert: false, urlSource: getIconUrl('infermatic') },
  inflection: { icon: inflection, invert: true, urlSource: getIconUrl('inflection') },
  mancer: { icon: mancer, invert: false, urlSource: getIconUrl('mancer') },
  google: { icon: google, invert: false, urlSource: getIconUrl('google') },
  aws: { icon: aws, invert: true, urlSource: getIconUrl('aws') },
  parasail: { icon: parasail, invert: true, urlSource: getIconUrl('parasail') },
  azureai: { icon: azureai, invert: false, urlSource: getIconUrl('azureai') },
  vertexai: { icon: vertexai, invert: false, urlSource: getIconUrl('vertexai') },
  stepfun: { icon: stepfun, invert: false, urlSource: getIconUrl('stepfun') },
  ai21: { icon: ai21, invert: true, urlSource: getIconUrl('ai21') },
  pygmalionai: { icon: pygmalionai, invert: false, urlSource: getIconUrl('pygmalionai') },
  groq: { icon: groq, invert: true, urlSource: getIconUrl('groq') },

  default: { icon: langdb, invert: false, urlSource: getIconUrl('langdb') },
}


export const getActualyIconName = (provider_name: string, fallbackProviderName?: string) => {
  let actualProviderName = provider_name;
  if (provider_name === 'z-ai') {
    actualProviderName = 'zai';
  }
  if (provider_name === 'mistralai') {
    actualProviderName = 'mistral';
  }
  if (provider_name === 'meta-llama') {
    actualProviderName = 'meta';
  }
  if (provider_name === 'minimax') {
    actualProviderName = 'minimax';
  }
  if (provider_name === 'x-ai') {
    actualProviderName = 'xai';
  }
  if (provider_name === 'stepfun-ai' || provider_name === 'stepfun') {
    actualProviderName = 'stepfun';
  }
  if (provider_name === 'aion-labs') {
    actualProviderName = 'aionlabs';
  }
  if (['arli', 'arliai', 'arli-ai'].includes(provider_name)) {
    actualProviderName = 'arli';
  }
  if (['moonshot', 'moonshot-ai', 'moonshotai'].includes(provider_name)) {
    actualProviderName = 'moonshot';
  }
  if (['arcee', 'arceeai', 'arcee-ai'].includes(provider_name)) {
    actualProviderName = 'arcee';
  }
  if (['huggingface', 'huggingface-color', 'anthracite-org', 'gryphe', 'neversleep', 'scb10x', 'cognitivecomputations', 'sophosympatheia', 'alfredpros', 'alpindale', 'eleutherai', , 'shisa-ai', 'sao10k', 'thudm', 'raifle', 'tngtech', 'undi95'].includes(provider_name)) {
    actualProviderName = 'huggingface';
  }
  if (!fallbackProviderName && ['openrouter', 'opengvlab'].includes(provider_name)) {
    actualProviderName = 'openrouter';
  }
  if (['agentica', 'agenticaai', 'agentica-ai', 'agentica-org'].includes(provider_name)) {
    actualProviderName = 'agentica';
  }

  if (['aws', 'amazon-web-services', 'amazon'].includes(provider_name)) {
    actualProviderName = 'aws';
  }
  if (['parasail', 'parasail-ai', 'parasailai'].includes(provider_name)) {
    actualProviderName = 'parasail';
  }
  if (['azureai', 'azure-ai', 'azureai-ai', 'azure'].includes(provider_name)) {
    actualProviderName = 'azureai';
  }
  if (['vertexai', 'vertex-ai', 'vertexai-ai', 'vertex'].includes(provider_name)) {
    actualProviderName = 'vertexai';
  }
  return actualProviderName;
}

export const getProviderIconByName = (provider_name: string, fallbackProviderName?: string): any => {


  if (['deepcogito'].includes(provider_name)) {
    return {
      urlSource: 'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://www.deepcogito.com/&size=256'
    }
  }
  if (['morph'].includes(provider_name)) {
    return {
      urlSource: 'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://morphllm.com&size=256'
    }
  }
  if (['allenai'].includes(provider_name)) {
    return {
      urlSource: 'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://allenai.org/&size=256'
    }
  }
  if (['inception'].includes(provider_name)) {
    return {
      urlSource: 'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://www.inceptionlabs.ai/&size=256'
    }
  }
  if (['thedrummer'].includes(provider_name)) {
    return {
      urlSource: 'https://openrouter.ai/images/icons/TheDrummer.png'
    }
  }
  let actualProviderName = getActualyIconName(provider_name, fallbackProviderName);
  let result = providerIcons[actualProviderName.toLowerCase() as keyof typeof providerIcons]
  if (result) {
    return result;
  }
  if (fallbackProviderName) {
    let fallbackResult = getProviderIconByName(fallbackProviderName);
    return fallbackResult;
  }
  return providerIcons.default;
}

export interface ProviderIconProps extends SVGProps<SVGSVGElement> {
  provider_name: string;
  className?: string,
  fallbackProviderName?: string,
  invert?: boolean
}
export const ProviderIcon = (props: ProviderIconProps) => {
  const { provider_name, className, fallbackProviderName, invert } = props;

  const icon = provider_name ? getProviderIconByName(provider_name, fallbackProviderName) : null;
  let providerName = provider_name;

  // If no icon found, show a puzzle icon for custom providers
  if (!icon || icon === providerIcons.default) {
    return (
      <div className={cn(className ? className : 'w-6 h-6 mr-2', 'flex items-center justify-center')}>
        <CuboidIcon className={className ? className : 'w-5 h-5'} style={{ color: 'rgb(var(--theme-500))' }} />
      </div>
    );
  }

  return (
    <div className={cn(className ? className : 'w-6 h-6 mr-2', `${(icon?.invert || invert) ? 'dark:invert' : ''}`)}>
      <img
        src={icon.urlSource}
        alt={providerName}
        className={className ? className : "w-6 h-6 mr-2"}
      />
    </div>
  );
}