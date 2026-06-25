
// 🔒 Tokens en memoria (NO localStorage, NO sessionStorage)

let accessToken = null;
let refreshToken = null;
let tokenExpiry = null;

export const setTokens = (access, refresh, expiresIn) => {
    accessToken = access;
    refreshToken = refresh;
    tokenExpiry = Date.now() + (expiresIn * 1000);
};

export const getAccessToken = () => accessToken;
export const getRefreshToken = () => refreshToken;

export const isTokenExpired = () => {
    if (!tokenExpiry) return true;
    // Refrescar 1 minuto antes de expirar
    return Date.now() >= (tokenExpiry - 60000);
};

export const clearTokens = () => {
    accessToken = null;
    refreshToken = null;
    tokenExpiry = null;
};

// 🔒 Interceptor de fetch con auto-refresh
export const apiFetch = async (url, options = {}) => {
    if (isTokenExpired() && refreshToken) {
        await refreshAccessToken();
    }
    
    const headers = {
        'Content-Type': 'application/json',
        ...(accessToken && { 'Authorization': `Bearer ${accessToken}` }),
        ...options.headers
    };
    
    const response = await fetch(url, { ...options, headers });
    
    if (response.status === 401) {
        // Token inválido, forzar logout
        clearTokens();
        window.location.href = '/login';
        throw new Error('Sesión expirada');
    }
    
    return response;
};

const refreshAccessToken = async () => {
    try {
        const response = await fetch('/auth/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken })
        });
        
        if (!response.ok) throw new Error('Refresh failed');
        
        const data = await response.json();
        setTokens(data.access_token, data.refresh_token, data.expires_in);
    } catch (error) {
        clearTokens();
        window.location.href = '/login';
        throw error;
    }
};