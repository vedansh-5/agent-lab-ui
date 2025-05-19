import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getUserAgents } from '../services/firebaseService';
import AgentList from '../components/agents/AgentList';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';

const DashboardPage = () => {
    const { currentUser } = useAuth();
    const [agents, setAgents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (currentUser) {
            const fetchAgents = async () => {
                try {
                    setLoading(true);
                    setError(null);
                    const userAgents = await getUserAgents(currentUser.uid);
                    setAgents(userAgents);
                } catch (err) {
                    console.error("Error fetching agents:", err);
                    setError("Failed to load your agents. Please try again.");
                } finally {
                    setLoading(false);
                }
            };
            fetchAgents();
        }
    }, [currentUser]);

    if (loading) return <LoadingSpinner />;
    if (error) return <ErrorMessage message={error} />;

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Your Agents</h1>
                <Link
                    to="/create-agent"
                    className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
                >
                    + Create New Agent
                </Link>
            </div>
            {agents.length > 0 ? (
                <AgentList agents={agents} />
            ) : (
                <p className="text-gray-600">You haven't created any agents yet.
                    <Link to="/create-agent" className="text-blue-500 hover:underline ml-1">Create one now!</Link>
                </p>
            )}
        </div>
    );
};

export default DashboardPage;