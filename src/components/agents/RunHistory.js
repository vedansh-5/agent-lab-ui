import React, { useState, useEffect } from 'react';
import { getAgentRuns } from '../../services/firebaseService';
import LoadingSpinner from '../common/LoadingSpinner';
import ErrorMessage from '../common/ErrorMessage';

const RunHistory = ({ agentId }) => {
    const [runs, setRuns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchRuns = async () => {
            if (!agentId) return;
            try {
                setLoading(true);
                setError(null);
                const agentRuns = await getAgentRuns(agentId);
                setRuns(agentRuns);
            } catch (err) {
                console.error("Error fetching agent runs:", err);
                setError("Failed to load run history.");
            } finally {
                setLoading(false);
            }
        };
        fetchRuns();
    }, [agentId]);

    if (loading) return <LoadingSpinner />;
    if (error) return <ErrorMessage message={error} />;

    return (
        <div className="bg-white p-6 rounded-lg shadow mt-8">
            <h2 className="text-2xl font-semibold mb-4">Run History</h2>
            {runs.length > 0 ? (
                <div className="space-y-4 max-h-96 overflow-y-auto">
                    {runs.map(run => (
                        <div key={run.id} className="border border-gray-200 p-4 rounded-md">
                            <p className="text-xs text-gray-500 mb-1">
                                Run ID: {run.id} | Session: {run.sessionId || 'N/A'} | Timestamp: {run.timestamp?.toDate ? new Date(run.timestamp.toDate()).toLocaleString() : 'N/A'}
                            </p>
                            <div className="mb-2">
                                <strong className="text-sm">User:</strong>
                                <p className="bg-gray-100 p-2 rounded text-sm whitespace-pre-wrap">{run.inputMessage}</p>
                            </div>
                            <div>
                                <strong className="text-sm">Agent:</strong>
                                <p className="bg-blue-50 p-2 rounded text-sm whitespace-pre-wrap">{run.finalResponse || "No final text response."}</p>
                            </div>
                            <details className="mt-1">
                                <summary className="text-xs text-blue-600 cursor-pointer">View Raw Events ({run.outputEvents?.length || 0})</summary>
                                <pre className="bg-gray-50 p-2 mt-1 rounded text-xs whitespace-pre-wrap max-h-60 overflow-auto">
                  {JSON.stringify(run.outputEvents, null, 2)}
                </pre>
                            </details>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-gray-600">No run history available for this agent.</p>
            )}
        </div>
    );
};

export default RunHistory;  