import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  tenantId: string;
  isSuperAdmin?: boolean;
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
  settings?: {
    branding?: { primaryColor?: string; logoUrl?: string };
    enabledModules?: string[];
    locale?: string;
    timezone?: string;
  };
  // Modules provisioned by the platform (super admin) on the tenant's license.
  // Tenant admins may enable at most these; they cannot grant themselves more.
  licensedModules?: string[];
}

interface AuthState {
  user: User | null;
  tenant: Tenant | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  login: (user: User, tenant: Tenant | null, accessToken: string, refreshToken: string) => void;
  logout: () => void;
  setTenant: (tenant: Tenant) => void;
  setUser: (user: User) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      tenant: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      login: (user, tenant, accessToken, refreshToken) =>
        set({ user, tenant, accessToken, refreshToken, isAuthenticated: true }),

      logout: () =>
        set({ user: null, tenant: null, accessToken: null, refreshToken: null, isAuthenticated: false }),

      setTenant: (tenant) => set({ tenant }),

      setUser: (user) => set({ user }),

      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
    }),
    {
      name: 'erp-auth',
      // Deliberately DO NOT persist refreshToken: the long-lived token lives in
      // memory only (and, in production, in an httpOnly cookie the server sets),
      // so an XSS can't read it out of localStorage. On reload the client
      // silently refreshes via the cookie to obtain a new access token.
      partialize: (state) => ({
        user: state.user,
        tenant: state.tenant,
        accessToken: state.accessToken,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
