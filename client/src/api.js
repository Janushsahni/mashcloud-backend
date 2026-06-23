// Central API configuration
// In production (served from same origin), use relative URLs
// In development (Vite dev server on :5173), proxy to backend on :3005
const API_BASE = import.meta.env.DEV ? 'http://localhost:3005' : (import.meta.env.VITE_API_URL || '');

export const api = async (path, options = {}) => {
    const url = `${API_BASE}${path}`;
    const res = await fetch(url, {
        credentials: 'include',
        cache: 'no-store',
        ...options,
        headers: {
            ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
            ...options.headers,
        },
    });
    return res;
};

export const apiJson = async (path, options = {}) => {
    const res = await api(path, options);
    const data = await res.json();
    return { res, data, ok: res.ok };
};

export default API_BASE;
