// src/context/AuthContext.tsx
import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { apiLogin, apiMe, apiLogout } from '../services/auth';

interface AuthContextType {
  user: any;
  login: (username: string, password: string) => Promise<any>;
  logout: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<any>(null);
    const [loading, setLoading] = useState<boolean>(true);

    useEffect(() => {
        checkSession();
    }, []);

    const checkSession = async () => {
        try {
            const userData = await apiMe();
            setUser(userData);
        } catch {
            setUser(null);
        }
        setLoading(false);
    };

    const login = async (username: string, password: string) => {
        try {
            const data = await apiLogin(username, password);
            setUser(data.user);
            return data.user;
        } catch (err: any) {
            throw new Error(err?.message || 'No se pudo conectar con el servidor');
        }
    };

    const logout = async () => {
        try {
            await apiLogout(null);
        } catch {
            // ignorar errores de logout
        }
        setUser(null);
    };

    useEffect(() => {
        if (!user) return;

        const interval = setInterval(() => {
            checkSession();
        }, 60000);

        return () => clearInterval(interval);
    }, [user]);

    return (
        <AuthContext.Provider value={{ user, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
