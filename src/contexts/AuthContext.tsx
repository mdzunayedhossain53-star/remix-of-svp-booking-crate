import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { apiAuth, clearSession, getSession } from "@/lib/api";

interface User {
  login: string;
  name?: string;
  email?: string;
  role?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (accessToken: string, user?: any) => void;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: () => {},
  logout: async () => {},
  isAuthenticated: false,
});

export function useAuth() {
  return useContext(AuthContext);
}

function decodeJwtPayload(token: string) {
  try {
    const payload = token.split(".")[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(normalized));
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { accessToken } = getSession();
    if (accessToken) {
      const payload = decodeJwtPayload(accessToken);
      if (payload?.exp && Number(payload.exp) * 1000 <= Date.now()) {
        clearSession();
      } else {
        setUser(payload ? { login: payload.login || "User" } : { login: "User" });
      }
    }
    setLoading(false);
  }, []);

  const loginFn = useCallback((accessToken: string, userData?: any) => {
    localStorage.setItem("accessToken", accessToken);
    const payload = decodeJwtPayload(accessToken);
    setUser({
      login: userData?.login || payload?.login || "User",
      email: userData?.email || payload?.email,
      name: userData?.fullName || payload?.fullName,
    });
  }, []);

  const logoutFn = useCallback(async () => {
    try {
      const { sessionId } = getSession();
      await apiAuth("/logout", { sessionId });
    } catch {}
    clearSession();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login: loginFn,
        logout: logoutFn,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
