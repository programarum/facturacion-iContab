
// ==================== TAURI INVOKE ====================

// Invoca un comando del backend Rust embebido. En Tauri usa window.__TAURI__.core.invoke.
export const tauriInvoke = (cmd, args) => {
  if (typeof window !== 'undefined' && window.__TAURI__?.core?.invoke) {
    return window.__TAURI__.core.invoke(cmd, args);
  }
  // Fuera de Tauri (p. ej. navegador puro en dev) no hay backend embebido.
  return Promise.reject(new Error(`[tauri] comando '${cmd}' no disponible fuera de Tauri`));
};

// ==================== AUTENTICACIÓN ====================

export const apiLogin = (username, password) =>
  tauriInvoke('login', { req: { username, password } });

export const apiMe = () => tauriInvoke('me');

export const apiLogout = (refreshToken) =>
  tauriInvoke('logout', { refreshToken: refreshToken ?? null });
