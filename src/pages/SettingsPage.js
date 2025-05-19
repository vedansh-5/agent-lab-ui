import React from 'react';
import UserProfile from '../components/auth/UserProfile'; // Assuming you might want this here

const SettingsPage = () => {
    return (
        <div>
            <h1 className="text-3xl font-bold mb-6">Settings</h1>
            <UserProfile />
            <div className="mt-6 bg-white p-6 rounded-lg shadow">
                <h2 className="text-xl font-semibold mb-3">Application Preferences</h2>
                <p className="text-gray-600">
                    User-specific settings and key management will be available here in the future.
                </p>
                {/* Example:
        <div className="mt-4">
          <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700">Your External API Key:</label>
          <input type="password" id="apiKey" className="mt-1 block w-full md:w-1/2 px-3 py-2 border border-gray-300 rounded-md shadow-sm" placeholder="Enter your key"/>
          <button className="mt-2 py-2 px-3 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm">Save Key</button>
        </div>
        */}
            </div>

            <div className="mt-6 bg-white p-6 rounded-lg shadow">
                <h2 className="text-xl font-semibold mb-3">Agent Sharing (Future)</h2>
                <p className="text-gray-600">
                    Control how your agents can be accessed:
                </p>
                <ul className="list-disc list-inside text-gray-600 pl-4 mt-2">
                    <li><strong>Private:</strong> Only you can access.</li>
                    <li><strong>Semi-Private:</strong> Share with specific users (they use your keys).</li>
                    <li><strong>Public:</strong> Anyone with the link (they bring their own keys).</li>
                </ul>
                <p className="text-sm text-gray-500 mt-3">This feature is planned for a future update.</p>
            </div>
        </div>
    );
};

export default SettingsPage;  