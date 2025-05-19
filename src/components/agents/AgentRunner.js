import React, { useState } from 'react';
import { queryAgent } from '../../services/agentService';
import LoadingSpinner from '../common/LoadingSpinner';
import ErrorMessage from '../common/ErrorMessage';

const AgentRunner = ({ agentResourceName, agentFirestoreId, adkUserId }) => {
    const [message, setMessage] = useState('');
    const [conversation, setConversation] = useState([]); // [{type: 'user'/'agent', text: '', events: []}]
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [currentSessionId, setCurrentSessionId] = useState(null); // For conversational context

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!message.trim()) return;

        const userMessage = { type: 'user', text: message, timestamp: new Date() };
        setConversation(prev => [...prev, userMessage]);
        setMessage('');
        setIsLoading(true);
        setError(null);

        try {
            // agentFirestoreId is passed to Cloud Function to correctly save the run.
            const result = await queryAgent(agentResourceName, userMessage.text, adkUserId, currentSessionId, agentFirestoreId);
            if (result.success) {
                const agentResponse = {
                    type: 'agent',
                    text: result.responseText || "Agent responded.",
                    events: result.events, // For detailed inspection if needed
                    timestamp: new Date()
                };
                setConversation(prev => [...prev, agentResponse]);
                if (result.sessionId) { // ADK session ID for continuity
                    setCurrentSessionId(result.sessionId);
                }
            } else {
                setError(result.message || "Agent query failed.");
            }
        } catch (err) {
            console.error("Error querying agent:", err);
            setError(err.message || "An error occurred while querying the agent.");
            const errorResponse = { type: 'error', text: err.message || "Failed to get response", timestamp: new Date() };
            setConversation(prev => [...prev, errorResponse]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-white p-6 rounded-lg shadow mt-8">
            <h2 className="text-2xl font-semibold mb-4">Run Agent</h2>
            <div className="mb-4 border border-gray-200 rounded-lg p-4 h-96 overflow-y-auto bg-gray-50 space-y-3">
                {conversation.map((entry, index) => (
                    <div key={index} className={`flex ${entry.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div
                            className={`max-w-xl p-3 rounded-lg shadow-sm ${
                                entry.type === 'user' ? 'bg-blue-500 text-white' :
                                    entry.type === 'agent' ? 'bg-gray-200 text-gray-800' :
                                        'bg-red-100 text-red-700' // For error messages  
                            }`}
                        >
                            <p className="text-sm">{entry.text}</p>
                            <p className="text-xs opacity-70 mt-1">
                                {new Date(entry.timestamp).toLocaleTimeString()}
                                {entry.type === 'agent' && currentSessionId && ` (Session: ...${currentSessionId.slice(-6)})`}
                            </p>
                            {/* Optionally display raw events for debugging */}
                            {/* {entry.events && <details><summary>Raw Events</summary><pre className="text-xs whitespace-pre-wrap">{JSON.stringify(entry.events, null, 2)}</pre></details>} */}
                        </div>
                    </div>
                ))}
                {isLoading && (
                    <div className="flex justify-start">
                        <div className="bg-gray-200 text-gray-800 p-3 rounded-lg shadow-sm inline-flex items-center">
                            <LoadingSpinner small /> <span className="ml-2 text-sm">Agent is thinking...</span>
                        </div>
                    </div>
                )}
            </div>

            {error && <ErrorMessage message={error} />}

            <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
                <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Type your message to the agent..."
                    className="flex-grow p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                    disabled={isLoading}
                />
                <button
                    type="submit"
                    disabled={isLoading || !message.trim()}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
                >
                    {isLoading ? 'Sending...' : 'Send'}
                </button>
            </form>
            {currentSessionId && (
                <button
                    onClick={() => {
                        setCurrentSessionId(null);
                        setConversation([]); // Optionally clear conversation on new session
                        alert("Session reset. The next message will start a new conversation.");
                    }}
                    className="mt-2 text-xs text-blue-500 hover:underline"
                >
                    Reset Conversation Session
                </button>
            )}
        </div>
    );
};

export default AgentRunner;  