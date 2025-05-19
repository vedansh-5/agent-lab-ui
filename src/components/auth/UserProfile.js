import React from 'react';
import { useAuth } from '../../contexts/AuthContext';

const UserProfile = () => {
    const { currentUser } = useAuth();

    if (!currentUser) {
        return <p>Not logged in.</p>;
    }

    return (
        <div className="p-4 bg-gray-100 rounded shadow">
            <h2 className="text-xl font-semibold">User Profile</h2>
            <p><strong>Email:</strong> {currentUser.email}</p>
            {currentUser.displayName && <p><strong>Name:</strong> {currentUser.displayName}</p>}
            {/* Add more profile information or settings links here */}
        </div>
    );
};

export default UserProfile;