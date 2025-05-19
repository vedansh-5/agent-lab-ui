import React, { useState, useEffect } from 'react';
import ToolSelector from '../tools/ToolSelector';
import { fetchGofannonTools } from '../../services/agentService'; // For Gofannon tools

const AGENT_TYPES = ["Agent", "SequentialAgent", "LoopAgent", "ParallelAgent"];
const GEMINI_MODELS = [
    "gemini-1.5-flash-001", // Alias for latest flash
    "gemini-1.5-pro-001",   // Alias for latest pro
    "gemini-1.0-pro",
    // Add other models as they become available/supported by ADK
];

const AgentForm = ({ onSubmit, initialData = {}, isSaving = false }) => {
    const [name, setName] = useState(initialData.name || '');
    const [description, setDescription] = useState(initialData.description || '');
    const [agentType, setAgentType] = useState(initialData.agentType || AGENT_TYPES[0]);
    const [model, setModel] = useState(initialData.model || GEMINI_MODELS[0]);
    const [instruction, setInstruction] = useState(initialData.instruction || '');
    const [selectedTools, setSelectedTools] = useState(initialData.tools || []); // [{id, name, module_path, class_name}, ...]

    const [availableGofannonTools, setAvailableGofannonTools] = useState([]);
    const [loadingTools, setLoadingTools] = useState(false);
    const [toolError, setToolError] = useState('');


    const handleRefreshGofannonTools = async () => {
        setLoadingTools(true);
        setToolError('');
        try {
            const result = await fetchGofannonTools(); // This calls your Cloud Function
            if (result.success && result.manifest && result.manifest.tools) {
                setAvailableGofannonTools(result.manifest.tools);
            } else {
                setToolError("Could not load Gofannon tools from manifest.");
            }
        } catch (error) {
            console.error("Error fetching Gofannon tools:", error);
            setToolError("Failed to fetch Gofannon tools. Check console for details.");
        } finally {
            setLoadingTools(false);
        }
    };

    useEffect(() => {
        // Optionally load Gofannon tools on component mount
        handleRefreshGofannonTools();
    }, []); // Empty dependency array means this runs once on mount


    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit({ name, description, agentType, model, instruction, tools: selectedTools });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6 bg-white p-8 rounded-lg shadow">
            <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">Agent Name</label>
                <input
                    type="text"
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
            </div>

            <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700">Description</label>
                <textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows="3"
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                ></textarea>
            </div>

            <div>
                <label htmlFor="agentType" className="block text-sm font-medium text-gray-700">Agent Type</label>
                <select
                    id="agentType"
                    value={agentType}
                    onChange={(e) => setAgentType(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                >
                    {AGENT_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                </select>
            </div>

            <div>
                <label htmlFor="model" className="block text-sm font-medium text-gray-700">Model</label>
                <select
                    id="model"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                >
                    {GEMINI_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
            </div>

            <div>
                <label htmlFor="instruction" className="block text-sm font-medium text-gray-700">Instruction (System Prompt)</label>
                <textarea
                    id="instruction"
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    rows="5"
                    placeholder="e.g., You are a helpful assistant that specializes in space exploration."
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                ></textarea>
            </div>

            <ToolSelector
                availableGofannonTools={availableGofannonTools}
                selectedTools={selectedTools}
                setSelectedTools={setSelectedTools}
                onRefreshGofannon={handleRefreshGofannonTools}
                loadingGofannon={loadingTools}
                gofannonError={toolError}
            />

            <div>
                <button
                    type="submit"
                    disabled={isSaving}
                    className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                >
                    {isSaving ? 'Saving...' : (initialData.id ? 'Update Agent' : 'Create Agent')}
                </button>
            </div>
        </form>
    );
};

export default AgentForm;  