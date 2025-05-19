import React from 'react';
// ADK tools might be predefined or fetched from another source if dynamic
const PREDEFINED_ADK_TOOLS = [
    // { id: "adk.Calculator", name: "ADK Calculator", type: "adk_prebuilt", module_path: "google.adk.tools", class_name: "Calculator" },
    // { id: "adk.WeatherTool", name: "ADK Weather Tool", type: "adk_prebuilt", module_path: "google.adk.tools", class_name: "WeatherTool"}
    // For now, let's keep this empty. You'd need a way to instantiate these in the backend.
];


const ToolSelector = ({
                          availableGofannonTools,
                          selectedTools,
                          setSelectedTools,
                          onRefreshGofannon,
                          loadingGofannon,
                          gofannonError
                      }) => {

    const handleToolToggle = (tool, type = 'gofannon') => { // type can be 'gofannon' or 'adk'
        const isSelected = selectedTools.some(st => st.id === tool.id);
        if (isSelected) {
            setSelectedTools(selectedTools.filter(st => st.id !== tool.id));
        } else {
            // For Gofannon tools, we have module_path and class_name from manifest.
            // For ADK tools, you might need to define how they are stored/instantiated.
            const toolToAdd = type === 'gofannon' ? {
                id: tool.id, // e.g., "gofannon.open_notify_space.iss_locator.IssLocator"
                name: tool.name,
                module_path: tool.module_path, // From Gofannon manifest
                class_name: tool.class_name,   // From Gofannon manifest
                type: 'gofannon' // To help backend differentiate if needed
            } : { ...tool, type: 'adk_prebuilt' }; // For predefined ADK tools

            setSelectedTools([...selectedTools, toolToAdd]);
        }
    };

    return (
        <div className="space-y-4">
            <div>
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-lg font-medium text-gray-900">Select Gofannon Tools</h3>
                    <button
                        type="button"
                        onClick={onRefreshGofannon}
                        disabled={loadingGofannon}
                        className="text-sm py-1 px-2 border border-blue-500 text-blue-500 rounded hover:bg-blue-50 disabled:opacity-50"
                    >
                        {loadingGofannon ? 'Refreshing...' : 'Refresh Gofannon Tools'}
                    </button>
                </div>
                {gofannonError && <p className="text-red-500 text-sm">{gofannonError}</p>}
                {availableGofannonTools.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-60 overflow-y-auto border p-2 rounded">
                        {availableGofannonTools.map(tool => (
                            <label key={tool.id} className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded">
                                <input
                                    type="checkbox"
                                    checked={selectedTools.some(st => st.id === tool.id)}
                                    onChange={() => handleToolToggle(tool, 'gofannon')}
                                    className="form-checkbox h-4 w-4 text-indigo-600 border-gray-300 rounded"
                                />
                                <span className="text-sm text-gray-700" title={tool.description}>{tool.name}</span>
                            </label>
                        ))}
                    </div>
                ) : (
                    !loadingGofannon && <p className="text-sm text-gray-500">No Gofannon tools loaded or available. Click refresh.</p>
                )}
            </div>

            {/* Placeholder for ADK Predefined Tools - if you have them */}
            {PREDEFINED_ADK_TOOLS.length > 0 && (
                <div>
                    <h3 className="text-lg font-medium text-gray-900">Select ADK Tools</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                        {PREDEFINED_ADK_TOOLS.map(tool => (
                            <label key={tool.id} className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded">
                                <input
                                    type="checkbox"
                                    checked={selectedTools.some(st => st.id === tool.id)}
                                    onChange={() => handleToolToggle(tool, 'adk')}
                                    className="form-checkbox h-4 w-4 text-indigo-600 border-gray-300 rounded"
                                />
                                <span className="text-sm text-gray-700" title={tool.description}>{tool.name}</span>
                            </label>
                        ))}
                    </div>
                </div>
            )}

            {selectedTools.length > 0 && (
                <div>
                    <h4 className="text-md font-medium text-gray-800">Selected Tools:</h4>
                    <ul className="list-disc list-inside pl-2 text-sm text-gray-600">
                        {selectedTools.map(st => <li key={st.id}>{st.name} ({st.type || 'gofannon'})</li>)}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default ToolSelector;  