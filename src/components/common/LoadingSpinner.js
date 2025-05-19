import React from 'react';

const LoadingSpinner = ({ small = false }) => {
    const sizeClass = small ? 'h-5 w-5' : 'h-12 w-12';
    return (
        <div className={`flex justify-center items-center ${small ? '' : 'py-10'}`}>
            <div
                className={`animate-spin rounded-full ${sizeClass} border-t-2 border-b-2 border-blue-500`}
            ></div>
        </div>
    );
};

export default LoadingSpinner;