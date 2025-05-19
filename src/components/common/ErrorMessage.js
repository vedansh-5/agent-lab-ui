import React from 'react';

const ErrorMessage = ({ message }) => {
    if (!message) return null;
    return (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 my-4 rounded" role="alert">
            <p className="font-bold">Error</p>
            <p>{typeof message === 'object' ? JSON.stringify(message) : message}</p>
        </div>
    );
};

export default ErrorMessage;