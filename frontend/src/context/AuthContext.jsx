import React, { createContext, useContext, useEffect, useState } from "react";
import { api, tokenStore, userStore, formatApiError } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(undefined); // undefined=loading, null=guest, object=auth'd
    const [bootChecked, setBootChecked] = useState(false);

    useEffect(() => {
        const t = tokenStore.get();
        if (!t) {
            setUser(null);
            setBootChecked(true);
            return;
        }
        api
            .get("/auth/me")
            .then((r) => {
                setUser(r.data);
                userStore.set(r.data);
            })
            .catch(() => {
                tokenStore.clear();
                setUser(null);
            })
            .finally(() => setBootChecked(true));
    }, []);

    async function login(email, password) {
        try {
            const { data } = await api.post("/auth/login", { email, password });
            tokenStore.set(data.token);
            userStore.set(data.user);
            setUser(data.user);
            return { ok: true };
        } catch (e) {
            return { ok: false, error: formatApiError(e?.response?.data?.detail) || e.message };
        }
    }

    function logout() {
        tokenStore.clear();
        setUser(null);
        window.location.href = "/login";
    }

    return (
        <AuthContext.Provider value={{ user, login, logout, bootChecked }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
