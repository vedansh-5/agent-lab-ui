// src/constants/agentConstants.js
export const AGENT_TYPES = ["Agent", "SequentialAgent", "LoopAgent", "ParallelAgent"];

export const MODEL_PROVIDERS = [
    { id: 'google_gemini', name: 'Google Gemini' },
    { id: 'openai_compatible', name: 'OpenAI-Compatible Endpoint' }
];

// Specific list for Google Gemini models
export const GOOGLE_GEMINI_MODELS_LIST = [
    "gemini-2.5-flash-preview-05-20",
    "gemini-2.5-pro-preview-05-06",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    // "gemini-1.5-flash-001", // Older
    // "gemini-1.5-pro-001",   // Older
];

// Default model if a new agent is created with Google Gemini
export const DEFAULT_GEMINI_MODEL = GOOGLE_GEMINI_MODELS_LIST[0];  