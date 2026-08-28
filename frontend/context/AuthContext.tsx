"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

type User = { userId: string; name: string; email: string; role: "staff" | "admin" };

type AuthContextType = {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string, role: string) => Promise<void>;
  signup: (name: string, email: string, password: string, role: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const stored = localStorage.getItem("thermalguard_token");
    if (stored) {
      setToken(stored);
      fetch(`${API_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${stored}` } })
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((data) => setUser(data.user))
        .catch(() => {
          localStorage.removeItem("thermalguard_token");
          setToken(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  async function login(email: string, password: string, role: string) {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, role }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Login failed");
    localStorage.setItem("thermalguard_token", json.token);
    setToken(json.token);
    setUser({ userId: json.user.id, name: json.user.name, email: json.user.email, role: json.user.role });
    router.push("/dashboard");
  }

  async function signup(name: string, email: string, password: string, role: string) {
    const res = await fetch(`${API_URL}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, role }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Signup failed");
    localStorage.setItem("thermalguard_token", json.token);
    setToken(json.token);
    setUser({ userId: json.user.id, name: json.user.name, email: json.user.email, role: json.user.role });
    router.push("/dashboard");
  }

  function logout() {
    localStorage.removeItem("thermalguard_token");
    setToken(null);
    setUser(null);
    router.push("/signin");
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
