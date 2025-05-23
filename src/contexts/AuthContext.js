import React, { createContext, useState, useEffect, useContext } from 'react';
import { auth } from '../firebaseConfig';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { googleProvider } from '../firebaseConfig';
import { ensureUserProfile } from '../services/firebaseService'; // Import new function

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const loginWithGoogle = () => signInWithPopup(auth, googleProvider);
    const logout = () => signOut(auth);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                // User is signed in, ensure their profile exists in Firestore
                // and get their full profile including permissions.
                const userProfile = await ensureUserProfile(user);
                setCurrentUser({
                    ...user, // Firebase Auth user object (uid, email, displayName, photoURL)
                    ...userProfile, // Firestore profile data (uid, email, ..., permissions)
                });
            } else {
                // User is signed out
                setCurrentUser(null);
            }
            setLoading(false);
        });
        return unsubscribe;
    }, []);

    const value = { currentUser, loginWithGoogle, logout, loading };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);