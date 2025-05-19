import React from 'react';
import { Link } from 'react-router-dom';

const AgentList = ({ agents }) => {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map(agent => (
                <div key={agent.id} className="bg-white p-6 rounded-lg shadow hover:shadow-md transition-shadow">
                    <h2 className="text-xl font-semibold mb-2">{agent.name}</h2>
                    <p className="text-gray-700 mb-1 text-sm">
                        Type: <span className="font-medium">{agent.agentType || 'Agent'}</span>
                    </p>
                    <p className="text-gray-700 mb-1 text-sm">
                        Model: <span className="font-medium">{agent.model || 'N/A'}</span>
                    </p>
                    <p className="text-gray-600 mb-3 truncate text-sm">{agent.description || "No description."}</p>
                    <p className="text-xs text-gray-500 mb-3">
                        Status: <span className={`font-semibold ${
                        agent.deploymentStatus === 'deployed' ? 'text-green-600' :
                            agent.deploymentStatus === 'deploying' ? 'text-yellow-600' :
                                agent.deploymentStatus === 'error' ? 'text-red-600' :
                                    'text-gray-600'
                    }`}>
              {agent.deploymentStatus?.replace('_', ' ') || 'Not Deployed'}
            </span>
                    </p>
                    <div className="flex justify-end space-x-2">
                        <Link
                            to={`/agent/${agent.id}`}
                            className="text-sm bg-blue-500 hover:bg-blue-700 text-white py-1 px-3 rounded"
                        >
                            View / Run
                        </Link>
                        <Link
                            to={`/agent/${agent.id}/edit`}
                            className="text-sm bg-yellow-500 hover:bg-yellow-700 text-white py-1 px-3 rounded"
                        >
                            Edit
                        </Link>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default AgentList;  