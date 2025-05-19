import { useContext } from 'react';
// Correct the path if AuthContext is defined elsewhere or if this file is in a different location
import { AuthContext } from '../contexts/AuthContext'; // Assuming AuthContext is exported from here

export const useAuth = () => {
    return useContext(AuthContext);
};  