import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BACKEND_URL}/api`;

const TOKEN_KEY = "asc_token";
const USER_KEY = "asc_user";

export const tokenStore = {
    get: () => localStorage.getItem(TOKEN_KEY),
    set: (t) => localStorage.setItem(TOKEN_KEY, t),
    clear: () => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
    },
};

export const userStore = {
    get: () => {
        try {
            return JSON.parse(localStorage.getItem(USER_KEY));
        } catch {
            return null;
        }
    },
    set: (u) => localStorage.setItem(USER_KEY, JSON.stringify(u)),
};

export const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((config) => {
    const t = tokenStore.get();
    if (t) config.headers.Authorization = `Bearer ${t}`;
    return config;
});

api.interceptors.response.use(
    (r) => r,
    (e) => {
        if (e?.response?.status === 401) {
            const path = window.location.pathname;
            if (path !== "/login") {
                tokenStore.clear();
                window.location.href = "/login";
            }
        }
        return Promise.reject(e);
    }
);

export function formatApiError(detail) {
    if (detail == null) return "Something went wrong";
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail))
        return detail
            .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
            .join(" ");
    if (detail && typeof detail.msg === "string") return detail.msg;
    return String(detail);
}

export function fmtINR(n) {
    return "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

export function fmtDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleString("en-IN", {
        year: "numeric", month: "short", day: "2-digit",
        hour: "2-digit", minute: "2-digit",
    });
}

export function fmtDay(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", { month: "short", day: "2-digit" });
}
