/**
 * Constants for Finetune Jobs
 *
 * BASE_MODELS: Available models for fine-tuning via Fireworks AI
 */

export const BASE_MODELS = [
  // Llama 4
  { value: "llama4-maverick-instruct-basic", label: "Llama 4 Maverick Instruct" },
  { value: "llama4-scout-instruct-basic", label: "Llama 4 Scout Instruct" },

  // Llama 3.3
  { value: "llama-v3p3-70b-instruct", label: "Llama 3.3 70B Instruct" },

  // Llama 3.2
  { value: "llama-v3p2-3b-instruct", label: "Llama 3.2 3B Instruct" },
  { value: "llama-v3p2-1b-instruct", label: "Llama 3.2 1B Instruct" },

  // Llama 3.1
  { value: "llama-v3p1-70b-instruct", label: "Llama 3.1 70B Instruct" },
  { value: "llama-v3p1-8b-instruct", label: "Llama 3.1 8B Instruct" },
  { value: "llama-v3p1-nemotron-70b-instruct", label: "Llama 3.1 Nemotron 70B" },

  // Llama 3
  { value: "llama-v3-70b-instruct", label: "Llama 3 70B Instruct" },
  { value: "llama-v3-70b-instruct-hf", label: "Llama 3 70B Instruct (HF)" },
  { value: "llama-v3-8b-instruct", label: "Llama 3 8B Instruct" },
  { value: "llama-v3-8b-instruct-hf", label: "Llama 3 8B Instruct (HF)" },

  // Llama 2
  { value: "llama-v2-13b-chat", label: "Llama 2 13B Chat" },
  { value: "llama-v2-7b-chat", label: "Llama 2 7B Chat" },

  // Llama Guard
  { value: "llama-guard-3-8b", label: "Llama Guard 3 8B" },
  { value: "llama-guard-3-1b", label: "Llama Guard 3 1B" },
  { value: "llama-guard-2-8b", label: "Llama Guard 2 8B" },
  { value: "llamaguard-7b", label: "Llama Guard 7B" },

  // DeepSeek R1
  { value: "deepseek-r1", label: "DeepSeek R1" },
  { value: "deepseek-r1-05-28", label: "DeepSeek R1 (05-28)" },
  { value: "deepseek-r1-basic", label: "DeepSeek R1 Basic" },
  { value: "deepseek-r1-distill-llama-70b", label: "DeepSeek R1 Distill Llama 70B" },
  { value: "deepseek-r1-distill-llama-8b", label: "DeepSeek R1 Distill Llama 8B" },
  { value: "deepseek-r1-distill-qwen-32b", label: "DeepSeek R1 Distill Qwen 32B" },
  { value: "deepseek-r1-distill-qwen-14b", label: "DeepSeek R1 Distill Qwen 14B" },
  { value: "deepseek-r1-distill-qwen-7b", label: "DeepSeek R1 Distill Qwen 7B" },
  { value: "deepseek-r1-distill-qwen-1p5b", label: "DeepSeek R1 Distill Qwen 1.5B" },
  { value: "deepseek-r1-0528-distill-qwen3-8b", label: "DeepSeek R1 0528 Distill Qwen3 8B" },

  // DeepSeek V3
  { value: "deepseek-v3", label: "DeepSeek V3" },
  { value: "deepseek-v3-03-24", label: "DeepSeek V3 (03-24)" },
  { value: "deepseek-v3p1", label: "DeepSeek V3.1" },
  { value: "deepseek-v3p1-terminus", label: "DeepSeek V3.1 Terminus" },

  // DeepSeek V2
  { value: "deepseek-v2p5", label: "DeepSeek V2.5" },
  { value: "deepseek-v2-lite-chat", label: "DeepSeek V2 Lite Chat" },

  // DeepSeek Coder
  { value: "deepseek-coder-v2-instruct", label: "DeepSeek Coder V2 Instruct" },
  { value: "deepseek-coder-v2-lite-instruct", label: "DeepSeek Coder V2 Lite Instruct" },
  { value: "deepseek-coder-v2-lite-base", label: "DeepSeek Coder V2 Lite Base" },
  { value: "deepseek-coder-33b-instruct", label: "DeepSeek Coder 33B Instruct" },
  { value: "deepseek-coder-7b-instruct-v1p5", label: "DeepSeek Coder 7B Instruct V1.5" },
  { value: "deepseek-coder-7b-base-v1p5", label: "DeepSeek Coder 7B Base V1.5" },
  { value: "deepseek-coder-7b-base", label: "DeepSeek Coder 7B Base" },
  { value: "deepseek-coder-1b-base", label: "DeepSeek Coder 1B Base" },
  { value: "deepseek-prover-v2", label: "DeepSeek Prover V2" },

  // Qwen 3
  { value: "qwen3-235b-a22b", label: "Qwen 3 235B-A22B" },
  { value: "qwen3-235b-a22b-instruct-2507", label: "Qwen 3 235B-A22B Instruct" },
  { value: "qwen3-235b-a22b-thinking-2507", label: "Qwen 3 235B-A22B Thinking" },
  { value: "qwen3-32b", label: "Qwen 3 32B" },
  { value: "qwen3-30b-a3b", label: "Qwen 3 30B-A3B" },
  { value: "qwen3-30b-a3b-instruct-2507", label: "Qwen 3 30B-A3B Instruct" },
  { value: "qwen3-30b-a3b-thinking-2507", label: "Qwen 3 30B-A3B Thinking" },
  { value: "qwen3-14b", label: "Qwen 3 14B" },
  { value: "qwen3-8b", label: "Qwen 3 8B" },
  { value: "qwen3-4b", label: "Qwen 3 4B" },
  { value: "qwen3-4b-instruct-2507", label: "Qwen 3 4B Instruct" },
  { value: "qwen3-1p7b", label: "Qwen 3 1.7B" },
  { value: "qwen3-0p6b", label: "Qwen 3 0.6B" },

  // Qwen 3 Coder
  { value: "qwen3-coder-480b-a35b-instruct", label: "Qwen 3 Coder 480B-A35B Instruct" },
  { value: "qwen3-coder-480b-instruct-bf16", label: "Qwen 3 Coder 480B Instruct BF16" },
  { value: "qwen3-coder-30b-a3b-instruct", label: "Qwen 3 Coder 30B-A3B Instruct" },

  // Qwen 3 VL
  { value: "qwen3-vl-235b-a22b-instruct", label: "Qwen 3 VL 235B-A22B Instruct" },
  { value: "qwen3-vl-235b-a22b-thinking", label: "Qwen 3 VL 235B-A22B Thinking" },
  { value: "qwen3-vl-32b-instruct", label: "Qwen 3 VL 32B Instruct" },
  { value: "qwen3-vl-30b-a3b-instruct", label: "Qwen 3 VL 30B-A3B Instruct" },
  { value: "qwen3-vl-30b-a3b-thinking", label: "Qwen 3 VL 30B-A3B Thinking" },
  { value: "qwen3-vl-8b-instruct", label: "Qwen 3 VL 8B Instruct" },

  // Qwen 2.5
  { value: "qwen2p5-72b", label: "Qwen 2.5 72B" },
  { value: "qwen2p5-72b-instruct", label: "Qwen 2.5 72B Instruct" },
  { value: "qwen2p5-32b", label: "Qwen 2.5 32B" },
  { value: "qwen2p5-32b-instruct", label: "Qwen 2.5 32B Instruct" },
  { value: "qwen2p5-14b", label: "Qwen 2.5 14B" },
  { value: "qwen2p5-14b-instruct", label: "Qwen 2.5 14B Instruct" },
  { value: "qwen2p5-7b", label: "Qwen 2.5 7B" },
  { value: "qwen2p5-7b-instruct", label: "Qwen 2.5 7B Instruct" },
  { value: "qwen2p5-1p5b-instruct", label: "Qwen 2.5 1.5B Instruct" },
  { value: "qwen2p5-0p5b-instruct", label: "Qwen 2.5 0.5B Instruct" },

  // Qwen 2.5 Coder
  { value: "qwen2p5-coder-32b", label: "Qwen 2.5 Coder 32B" },
  { value: "qwen2p5-coder-32b-instruct", label: "Qwen 2.5 Coder 32B Instruct" },
  { value: "qwen2p5-coder-32b-instruct-128k", label: "Qwen 2.5 Coder 32B Instruct 128K" },
  { value: "qwen2p5-coder-32b-instruct-64k", label: "Qwen 2.5 Coder 32B Instruct 64K" },
  { value: "qwen2p5-coder-32b-instruct-32k-rope", label: "Qwen 2.5 Coder 32B Instruct 32K" },
  { value: "qwen2p5-coder-14b", label: "Qwen 2.5 Coder 14B" },
  { value: "qwen2p5-coder-14b-instruct", label: "Qwen 2.5 Coder 14B Instruct" },
  { value: "qwen2p5-coder-7b", label: "Qwen 2.5 Coder 7B" },
  { value: "qwen2p5-coder-7b-instruct", label: "Qwen 2.5 Coder 7B Instruct" },
  { value: "qwen2p5-coder-3b", label: "Qwen 2.5 Coder 3B" },
  { value: "qwen2p5-coder-3b-instruct", label: "Qwen 2.5 Coder 3B Instruct" },
  { value: "qwen2p5-coder-1p5b", label: "Qwen 2.5 Coder 1.5B" },
  { value: "qwen2p5-coder-1p5b-instruct", label: "Qwen 2.5 Coder 1.5B Instruct" },
  { value: "qwen2p5-coder-0p5b", label: "Qwen 2.5 Coder 0.5B" },
  { value: "qwen2p5-coder-0p5b-instruct", label: "Qwen 2.5 Coder 0.5B Instruct" },

  // Qwen 2.5 Math
  { value: "qwen2p5-math-72b-instruct", label: "Qwen 2.5 Math 72B Instruct" },

  // Qwen 2.5 VL
  { value: "qwen2p5-vl-72b-instruct", label: "Qwen 2.5 VL 72B Instruct" },
  { value: "qwen2p5-vl-32b-instruct", label: "Qwen 2.5 VL 32B Instruct" },
  { value: "qwen2p5-vl-7b-instruct", label: "Qwen 2.5 VL 7B Instruct" },
  { value: "qwen2p5-vl-3b-instruct", label: "Qwen 2.5 VL 3B Instruct" },

  // Qwen 2
  { value: "qwen2-72b-instruct", label: "Qwen 2 72B Instruct" },
  { value: "qwen2-7b-instruct", label: "Qwen 2 7B Instruct" },

  // Qwen 1.5
  { value: "qwen1p5-72b-chat", label: "Qwen 1.5 72B Chat" },

  // QwQ
  { value: "qwq-32b", label: "QwQ 32B" },
  { value: "qwen-qwq-32b-preview", label: "Qwen QwQ 32B Preview" },

  // Qwen (Other)
  { value: "qwen-v2p5-14b-instruct", label: "Qwen V2.5 14B Instruct" },
  { value: "qwen-v2p5-7b", label: "Qwen V2.5 7B" },

  // Gemma
  { value: "gemma-3-27b-it", label: "Gemma 3 27B IT" },

  // GLM
  { value: "glm-4p7", label: "GLM 4.7" },
  { value: "glm-4p6", label: "GLM 4.6" },
  { value: "glm-4p5", label: "GLM 4.5" },
  { value: "glm-4p5-air", label: "GLM 4.5 Air" },

  // Kimi
  { value: "kimi-k2p5", label: "Kimi K2.5" },
  { value: "kimi-k2-instruct", label: "Kimi K2 Instruct" },
  { value: "kimi-k2-instruct-0905", label: "Kimi K2 Instruct (0905)" },
  { value: "kimi-k2-thinking", label: "Kimi K2 Thinking" },

  // Cogito
  { value: "cogito-v1-preview-llama-70b", label: "Cogito V1 Preview Llama 70B" },
  { value: "cogito-v1-preview-llama-8b", label: "Cogito V1 Preview Llama 8B" },
  { value: "cogito-v1-preview-llama-3b", label: "Cogito V1 Preview Llama 3B" },
  { value: "cogito-v1-preview-qwen-32b", label: "Cogito V1 Preview Qwen 32B" },
  { value: "cogito-v1-preview-qwen-14b", label: "Cogito V1 Preview Qwen 14B" },

  // Mistral
  { value: "mistral-small-24b-instruct-2501", label: "Mistral Small 24B Instruct" },
  { value: "mistral-nemo-instruct-2407", label: "Mistral Nemo Instruct" },
  { value: "mistral-7b-instruct-v3", label: "Mistral 7B Instruct V3" },
  { value: "mistral-7b-instruct-v0p2", label: "Mistral 7B Instruct V0.2" },
  { value: "mistral-7b-instruct-4k", label: "Mistral 7B Instruct 4K" },

  // Code Llama
  { value: "code-llama-70b-instruct", label: "Code Llama 70B Instruct" },
  { value: "code-llama-70b", label: "Code Llama 70B" },
  { value: "code-llama-34b-instruct", label: "Code Llama 34B Instruct" },
  { value: "code-llama-34b", label: "Code Llama 34B" },
  { value: "code-llama-13b-instruct", label: "Code Llama 13B Instruct" },
  { value: "code-llama-13b", label: "Code Llama 13B" },
  { value: "code-llama-7b-instruct", label: "Code Llama 7B Instruct" },
  { value: "code-llama-7b", label: "Code Llama 7B" },

  // GPT-OSS
  { value: "gpt-oss-120b", label: "GPT-OSS 120B" },
  { value: "gpt-oss-20b", label: "GPT-OSS 20B" },
  { value: "gpt-oss-safeguard-120b", label: "GPT-OSS Safeguard 120B" },
  { value: "gpt-oss-safeguard-20b", label: "GPT-OSS Safeguard 20B" },

  // Kat
  { value: "kat-dev-72b-exp", label: "Kat Dev 72B Exp" },
  { value: "kat-dev-32b", label: "Kat Dev 32B" },
  { value: "kat-coder", label: "Kat Coder" },

  // ROLM
  { value: "rolm-ocr", label: "ROLM OCR" },

  // Fare
  { value: "fare-20b", label: "Fare 20B" },

  // Firefunction
  { value: "firefunction-v2", label: "Firefunction V2" },

  // Hermes
  { value: "hermes-2-pro-mistral-7b", label: "Hermes 2 Pro Mistral 7B" },
  { value: "chronos-hermes-13b-v2", label: "Chronos Hermes 13B V2" },
  { value: "nous-hermes-llama2-70b", label: "Nous Hermes Llama 2 70B" },
  { value: "nous-hermes-llama2-13b", label: "Nous Hermes Llama 2 13B" },
  { value: "nous-hermes-llama2-7b", label: "Nous Hermes Llama 2 7B" },

  // OpenHermes
  { value: "openhermes-2p5-mistral-7b", label: "OpenHermes 2.5 Mistral 7B" },
  { value: "openhermes-2-mistral-7b", label: "OpenHermes 2 Mistral 7B" },

  // Dolphin
  { value: "dolphin-2-9-2-qwen2-72b", label: "Dolphin 2.9.2 Qwen 2 72B" },

  // OpenChat
  { value: "openchat-3p5-0106-7b", label: "OpenChat 3.5 7B" },

  // OpenOrca
  { value: "openorca-7b", label: "OpenOrca 7B" },

  // MythoMax
  { value: "mythomax-l2-13b", label: "MythoMax L2 13B" },

  // Toppy
  { value: "toppy-m-7b", label: "Toppy M 7B" },

  // Zephyr
  { value: "zephyr-7b-beta", label: "Zephyr 7B Beta" },

  // Snorkel
  { value: "snorkel-mistral-7b-pairrm-dpo", label: "Snorkel Mistral 7B PairRM DPO" },
];
