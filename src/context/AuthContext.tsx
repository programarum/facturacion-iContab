// src/context/AuthContext.tsx
import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { apiFetch, setTokens, clearTokens, getAccessToken, getRefreshToken } from '../services/auth';

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
        const token = getAccessToken();
        if (!token) {
            setLoading(false);
            return;
        }
        
        try {
            const response = await apiFetch('/auth/me');
            if (response.ok) {
                const userData = await response.json();
                setUser(userData);
            }
        } catch (error) {
            console.error('Session check failed');
        }
        setLoading(false);
    };

    const login = async (username: string, password: string) => {
        let response: Response;
        try {
            response = await apiFetch('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ username, password })
            });
        } catch {
            throw new Error('No se pudo conectar con el servidor');
        }
        
        if (!response.ok) {
            try {
                const error = await response.json();
                throw new Error(error.detail || 'Error de autenticación');
            } catch (err: any) {
                if (err.message) throw err;
                throw new Error(`Error del servidor (${response.status})`);
            }
        }
        
        const data = await response.json();
        setTokens(data.access_token, data.refresh_token, data.expires_in);
        
        const meResponse = await apiFetch('/auth/me');
        const userData = await meResponse.json();
        setUser(userData);
        
        return userData;
    };

    const logout = async () => {
        await apiFetch('/auth/logout', {
            method: 'POST',
            body: JSON.stringify({ refresh_token: getRefreshToken() })
        }).catch(() => {});
        
        clearTokens();
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
