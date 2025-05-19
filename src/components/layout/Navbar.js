import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const Navbar = () => {
    const { currentUser, logout } = useAuth();
    const navigate = useNavigate();

    const handleLogout = async () => {
        try {
            await logout();
            navigate('/');
        } catch (error) {
            console.error("Failed to log out", error);
        }
    };

    return (
        <nav className="bg-gray-800 text-white p-4 fixed w-full top-0 z-10">
            <div className="container mx-auto flex justify-between items-center">
                <Link to="/" className="text-xl font-bold">AgentWebUI</Link>
                <div>
                    {currentUser ? (
                        <>
                            <Link to="/dashboard" className="px-3 hover:text-gray-300">Dashboard</Link>
                            <Link to="/settings" className="px-3 hover:text-gray-300">Settings</Link>
                            <button onClick={handleLogout} className="px-3 py-2 bg-red-500 hover:bg-red-700 rounded">
                                Logout ({currentUser.displayName || currentUser.email})
                            </button>
                        </>
                    ) : (
                        <Link to="/" className="px-3 hover:text-gray-300">Login</Link>
                    )}
                </div>
            </div>
        </nav>
    );
};

export default Navbar;