// src/constants/agentConstants.js
export const AGENT_TYPES = ["Agent", "SequentialAgent", "LoopAgent", "ParallelAgent"];

export const MODEL_PROVIDERS_LITELLM = [
    {
        id: 'together_ai',
        name: 'TogetherAI',
        prefix: 'together_ai/', // Maintained for UI parsing/display if needed
        models: [

            { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', name: 'Llama 3.3 70B Turbo' },
            { id: 'meta-llama/Llama-4-Scout-17B-16E-Instruct ', name: 'Llama 4 Scout 17b 16E Instruct' },
            { id: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8', name: 'Llama 4 Maverick 17B 128E Instruct FP8' }, // Older, but kept for example
        ],
        apiBase: 'https://api.together.xyz/v1',
        requiresApiKeyInEnv: 'TOGETHER_API_KEY',
        allowsCustomBase: false,
        allowsCustomKey: false,
    },
    {
        id: 'gemini',
        name: 'Google (via LiteLLM)',
        prefix: 'gemini/', // Maintained for UI parsing/display if needed
        models: [
            // IDs are now what LiteLLM expects for its 'model' parameter
            { id: 'gemini-2.5-flash-preview-05-20', name: 'Gemini 2.5 Flash' },
            { id: 'gemini-2.5-pro-preview-05-06 ', name: 'Gemini 2.5 Pro Preview' },
            { id: 'gemini-2.0-flash-lite-001', name: 'Gemini 2.0 Flash Lite' },
            { id: 'gemini-2.0-flash-001', name: 'Gemini 2.0 Flash' },
        ],
        apiBase: 'https://generativelanguage.googleapis.com/v1beta/openai',
        requiresApiKeyInEnv: 'GOOGLE_API_KEY',
        allowsCustomBase: false,
        allowsCustomKey: false,
    },
    {
        id: 'openai',
        name: 'OpenAI',
        prefix: 'openai/', // Maintained for UI parsing/display
        models: [
            { id: 'gpt-4o-mini-2024-07-18', name: 'GPT-4o Mini'},
            { id: 'gpt-4o', name: 'GPT-4o' },
            { id: 'o3-2025-04-16', name: 'o3'},
            { id: 'o3-mini-2025-01-31', name: 'o3-Mini'},
            { id: 'o1-2024-12-17', name: 'o1'},
            { id: 'o4-mini-2025-04-16', name: 'o4-Mini'},
        ],
        apiBase: 'https://api.openai.com/v1',
        requiresApiKeyInEnv: 'OPENAI_API_KEY',
        allowsCustomBase: false, // OpenAI generally doesn't allow changing the base for standard models
        allowsCustomKey: false,
    },
    {
        id: 'anthropic',
        name: 'Anthropic',
        prefix: 'anthropic/', // Maintained for UI parsing/display
        models: [
            { id: 'claude-opus-4-20250514', name: 'Claude 4 Opus'},
            { id: 'claude-sonnet-4-20250514', name: 'Claude 4 Sonnet'},
            { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet'},
            { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku'},
            { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
            { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet' },
            { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' },
        ],
        apiBase: 'https://api.anthropic.com/v1', // Default, often proxied. Check LiteLLM docs for direct.
        requiresApiKeyInEnv: 'ANTHROPIC_API_KEY',
        allowsCustomBase: false,
        allowsCustomKey: false,
    },
    {
        id: 'custom',
        name: 'Custom LiteLLM Configuration',
        prefix: null, // No prefix for fully custom model strings
        models: [], // User types the full model string
        apiBase: 'http://localhost:8000/v1', // Placeholder, user must define
        requiresApiKeyInEnv: null, // API key handling is entirely up to the custom setup
        allowsCustomBase: true,
        allowsCustomKey: true,
    }
];

// Determine the default provider and model based on the updated structure
const defaultProvider = MODEL_PROVIDERS_LITELLM.find(p => p.id === 'together_ai') || MODEL_PROVIDERS_LITELLM[0];
const defaultBaseModel = defaultProvider.models.find(m => m.id === 'meta-llama/Llama-3.3-70B-Instruct-Turbo') || defaultProvider.models[0];

export const DEFAULT_LITELLM_PROVIDER_ID = defaultProvider.id;
// DEFAULT_LITELLM_BASE_MODEL_ID now stores the full LiteLLM model string for the default model
export const DEFAULT_LITELLM_BASE_MODEL_ID = defaultBaseModel.id;
// DEFAULT_LITELLM_MODEL_STRING is the same, used as the initial value for the model string state
export const DEFAULT_LITELLM_MODEL_STRING = defaultBaseModel.id;

// Helper function to get provider config by ID
export const getLiteLLMProviderConfig = (providerId) => {
    return MODEL_PROVIDERS_LITELLM.find(p => p.id === providerId);
};

// Helper function to get model config by ID within a provider
export const getLiteLLMModelConfig = (providerId, modelId) => {
    const provider = getLiteLLMProviderConfig(providerId);
    return provider?.models.find(m => m.id === modelId);
};  