// src/constants/platformConstants.js
export const PLATFORM_IDS = {
    GOOGLE_VERTEX: 'google_vertex',
    AWS_BEDROCK: 'aws_bedrock',
    LLAMASTACK: 'llamastack',
    WATSONX: 'watsonx'
};

export const PLATFORMS = [
    {
        id: PLATFORM_IDS.GOOGLE_VERTEX,
        name: 'Google Vertex AI',
        isConstructed: true,
    },
    {
        id: PLATFORM_IDS.WATSONX,
        name: 'IBM Watsonx Orchestrate',
        isConstructed: false,
        moreInfoUrl: 'https://github.com/The-AI-Alliance/agent-lab-ui/discussions/84',
    },
    {
        id: PLATFORM_IDS.AWS_BEDROCK,
        name: 'AWS Bedrock',
        isConstructed: false,
        moreInfoUrl: 'https://github.com/The-AI-Alliance/agent-lab-ui/discussions/6',
    },
    {
        id: PLATFORM_IDS.LLAMASTACK,
        name: 'LlamaStack',
        isConstructed: false,
        moreInfoUrl: 'https://github.com/The-AI-Alliance/agent-lab-ui/discussions/5',
    },
];

export const getPlatformById = (platformId) => {
    return PLATFORMS.find(p => p.id === platformId);
};