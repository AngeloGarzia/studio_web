import React from "react";
import { api } from "./api";

export type Me = { id: string; email: string; role: "ADMIN" | "CLIENT"; profileName?: string; phone?: string };

type AuthState =
  | { status: "loading" }
  | { status: "anon" }
  | { status: "authed"; me: Me };

const AuthCtx = React.createContext<{
  state: AuthState;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}>({
  state: { status: "loading" },
  refresh: async () => {},
  logout: async () => {}
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<AuthState>({ status: "loading" });

  const refresh = React.useCallback(async () => {
    try {
      const me = await api.me();
      setState({ status: "authed", me });
    } catch {
      setState({ status: "anon" });
    }
  }, []);

  const logout = React.useCallback(async () => {
    await api.logout().catch(() => {});
    setState({ status: "anon" });
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return <AuthCtx.Provider value={{ state, refresh, logout }}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  return React.useContext(AuthCtx);
}

