
// ==================== ENTORNO ====================

const isTauri = () => typeof window !== 'undefined' && window.__TAURI__ !== undefined;

const API_BASE = isTauri() ? 'http://localhost:8000' : '';

const buildUrl = (path) => `${API_BASE}${path}`;

// ==================== TOKENS EN MEMORIA ====================

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
    return Date.now() >= (tokenExpiry - 60000);
};

export const clearTokens = () => {
    accessToken = null;
    refreshToken = null;
    tokenExpiry = null;
};

// ==================== FETCH INTERCEPTOR ====================

export const apiFetch = async (url, options = {}) => {
    if (isTokenExpired() && refreshToken) {
        await refreshAccessToken();
    }

    const headers = {
        'Content-Type': 'application/json',
        ...(accessToken && { 'Authorization': `Bearer ${accessToken}` }),
        ...options.headers
    };

    const fullUrl = buildUrl(url);

    const response = await fetch(fullUrl, { ...options, headers });

    if (response.status === 401) {
        clearTokens();
        window.location.href = '/login';
        throw new Error('Sesion expirada');
    }

    return response;
};

const refreshAccessToken = async () => {
    try {
        const response = await fetch(buildUrl('/auth/refresh'), {
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

// ==================== BACKEND HEALTH ====================

export const checkBackendHealth = async () => {
    try {
        const response = await fetch(buildUrl('/health'), {
            method: 'GET',
            signal: AbortSignal.timeout(3000)
        });
        return response.ok;
    } catch {
        return false;
    }
};

// ==================== TAURI BACKEND MANAGER ====================

export const startBackendViaTauri = async () => {
    if (!isTauri()) return true;

    try {
        const { invoke } = window.__TAURI__.core;

        // Verificar si ya esta corriendo
        const running = await invoke('check_backend');
        if (running) return true;

        // Iniciar backend
        await invoke('start_backend');

        // Esperar a que este listo
        for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 1000));
            const healthy = await checkBackendHealth();
            if (healthy) return true;
        }

        return false;
    } catch (err) {
        console.error('Error iniciando backend via Tauri:', err);
        return false;
    }
};
