// src/constants/agentConstants.js
export const AGENT_TYPES = ["Agent", "SequentialAgent", "LoopAgent", "ParallelAgent"];

export const MODEL_PROVIDERS_LITELLM = [
    {
        id: 'google',
        name: 'Google (via LiteLLM)',
        prefix: 'google/', // Maintained for UI parsing/display if needed
        models: [
            // IDs are now what LiteLLM expects for its 'model' parameter
            { id: 'gemini/gemini-1.5-pro-latest', name: 'Gemini 1.5 Pro (Latest)' },
            { id: 'gemini/gemini-1.5-flash-latest', name: 'Gemini 1.5 Flash (Latest)' },
            { id: 'gemini/gemini-pro', name: 'Gemini 1.0 Pro' }, // Older, but kept for example
            { id: 'gemini/gemini-1.0-pro-001', name: 'Gemini 1.0 Pro (001)' },
        ],
        apiBase: 'https://generativelanguage.googleapis.com/v1beta',
        requiresApiKeyInEnv: 'GOOGLE_API_KEY',
        allowsCustomBase: false,
        allowsCustomKey: false,
    },
    {
        id: 'openai',
        name: 'OpenAI (via LiteLLM)',
        prefix: 'openai/', // Maintained for UI parsing/display
        models: [
            { id: 'gpt-4o', name: 'GPT-4o' },
            { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
            { id: 'gpt-4-turbo-preview', name: 'GPT-4 Turbo Preview' },
            { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
        ],
        apiBase: 'https://api.openai.com/v1',
        requiresApiKeyInEnv: 'OPENAI_API_KEY',
        allowsCustomBase: false, // OpenAI generally doesn't allow changing the base for standard models
        allowsCustomKey: false,
    },
    {
        id: 'anthropic',
        name: 'Anthropic (via LiteLLM)',
        prefix: 'anthropic/', // Maintained for UI parsing/display
        models: [
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
        id: 'azure',
        name: 'Azure OpenAI (via LiteLLM)',
        prefix: 'azure/', // Maintained for UI parsing/display
        models: [
            // User will typically provide the full model string for Azure, e.g., "azure/your-deployment-name"
            // This 'id' is a placeholder to guide the user.
            { id: 'YOUR_AZURE_DEPLOYMENT_NAME', name: 'Enter Azure Deployment Name as Model String' }
        ],
        // LiteLLM docs: For Azure, set AZURE_API_KEY, AZURE_API_BASE, AZURE_API_VERSION
        // Providing a placeholder here, assuming user might override or rely on env.
        apiBase: 'https://your-resource-name.openai.azure.com', // Placeholder
        requiresApiKeyInEnv: 'AZURE_API_KEY', // also AZURE_API_BASE, AZURE_API_VERSION for LiteLLM
        allowsCustomBase: true, // User often needs to set this if not using AZURE_API_BASE env var
        allowsCustomKey: true,
    },
    {
        id: 'groq',
        name: 'Groq (via LiteLLM)',
        prefix: 'groq/',
        models: [
            { id: 'llama3-8b-8192', name: 'LLaMA3-8b (Groq)'},
            { id: 'llama3-70b-8192', name: 'LLaMA3-70b (Groq)'},
            { id: 'mixtral-8x7b-32768', name: 'Mixtral-8x7B (Groq)'},
            { id: 'gemma-7b-it', name: 'Gemma-7b-it (Groq)'}
        ],
        apiBase: 'https://api.groq.com/openai/v1',
        requiresApiKeyInEnv: 'GROQ_API_KEY',
        allowsCustomBase: false,
        allowsCustomKey: false,
    },
    {
        id: 'ollama', // Example for local Ollama models
        name: 'Ollama (Local via LiteLLM)',
        prefix: 'ollama/', // User appends model name like ollama/mistral
        models: [
            { id: 'mistral', name: 'Mistral (requires Ollama running)'},
            { id: 'llama2', name: 'Llama2 (requires Ollama running)'},
            { id: 'codellama', name: 'CodeLlama (requires Ollama running)'}
            // Add more common Ollama models or guide user to type "ollama/modelname"
        ],
        apiBase: 'http://localhost:11434', // Default Ollama API base
        requiresApiKeyInEnv: null, // Ollama typically doesn't require an API key by default
        allowsCustomBase: true, // User might run Ollama on a different host/port
        allowsCustomKey: false, // Usually no API key for Ollama
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
const defaultProvider = MODEL_PROVIDERS_LITELLM.find(p => p.id === 'google') || MODEL_PROVIDERS_LITELLM[0];
const defaultBaseModel = defaultProvider.models.find(m => m.id === 'gemini/gemini-1.5-flash-latest') || defaultProvider.models[0];

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
// Note: modelId here is the full LiteLLM model string (e.g., "gpt-4o", "gemini/gemini-1.5-flash-latest")
export const getLiteLLMModelConfig = (providerId, modelId) => {
    const provider = getLiteLLMProviderConfig(providerId);
    return provider?.models.find(m => m.id === modelId);
};  