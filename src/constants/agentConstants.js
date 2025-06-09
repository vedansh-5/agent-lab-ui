// src/constants/agentConstants.js
export const AGENT_TYPES = ["Agent", "SequentialAgent", "LoopAgent", "ParallelAgent"];

export const MODEL_PROVIDERS_LITELLM = [
    {
        id: 'google',
        name: 'Google (via LiteLLM)',
        prefix: 'google/',
        models: [
            { id: 'gemini-2.5-pro-latest', name: 'Gemini 2.5 Pro (Latest)' },
            { id: 'gemini-2.5-flash-latest', name: 'Gemini 2.5 Flash (Latest)' },
            // { id: 'gemini-pro', name: 'Gemini 1.0 Pro' },
            // Add more specific versions if needed, e.g., gemini-1.5-pro-001
        ],
        requiresApiKeyInEnv: 'GOOGLE_API_KEY',
        allowsCustomBase: false, // Typically no custom base for direct Google models via LiteLLM
        allowsCustomKey: false,  // Key expected in environment
    },
    {
        id: 'openai',
        name: 'OpenAI (via LiteLLM)',
        prefix: 'openai/',
        models: [
            { id: 'gpt-4o', name: 'GPT-4o' },
            { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
            { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
        ],
        requiresApiKeyInEnv: 'OPENAI_API_KEY',
        allowsCustomBase: false,
        allowsCustomKey: false,
    },
    {
        id: 'anthropic',
        name: 'Anthropic (via LiteLLM)',
        prefix: 'anthropic/',
        models: [
            { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
            { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet' },
            { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' },
        ],
        requiresApiKeyInEnv: 'ANTHROPIC_API_KEY',
        allowsCustomBase: false,
        allowsCustomKey: false,
    },
    {
        id: 'azure',
        name: 'Azure OpenAI (via LiteLLM)',
        prefix: 'azure/', // User will append their deployment name
        models: [
            // For Azure, the "model" part is often the deployment name.
            // It's better to have the user input this directly in the custom model string field
            // if this provider is selected, or guide them.
            // Let's make this behave more like custom for model input for now.
            { id: 'YOUR_AZURE_DEPLOYMENT_NAME', name: 'Enter Azure Deployment Name below' }
        ],
        requiresApiKeyInEnv: 'AZURE_API_KEY, AZURE_API_BASE, AZURE_API_VERSION (or other Azure specific env vars)',
        allowsCustomBase: true, // Azure often requires specific base URLs.
        allowsCustomKey: true, // And specific keys.
    },
    {
        id: 'custom',
        name: 'Custom LiteLLM Configuration',
        prefix: null, // User provides the full string
        models: [], // No predefined models, user types full string
        requiresApiKeyInEnv: 'Depends on endpoint',
        allowsCustomBase: true,
        allowsCustomKey: true,
    }
];

// Default Provider and Model for new agents
export const DEFAULT_LITELLM_PROVIDER_ID = MODEL_PROVIDERS_LITELLM[0].id; // Google
export const DEFAULT_LITELLM_BASE_MODEL_ID = MODEL_PROVIDERS_LITELLM[0].models[1].id; // Gemini 1.5 Flash
export const DEFAULT_LITELLM_MODEL_STRING = `${MODEL_PROVIDERS_LITELLM[0].prefix}${MODEL_PROVIDERS_LITELLM[0].models[1].id}`;

// Helper function to get provider config by ID
export const getLiteLLMProviderConfig = (providerId) => {
    return MODEL_PROVIDERS_LITELLM.find(p => p.id === providerId);
};

// Helper function to get model config by ID within a provider
export const getLiteLLMModelConfig = (providerId, modelId) => {
    const provider = getLiteLLMProviderConfig(providerId);
    return provider?.models.find(m => m.id === modelId);
};