import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiService, AuthUser } from '../services/apiService.js';
import { supabase } from '../services/supabaseClient.js';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, confirmPassword: string) => Promise<boolean>;
  logout: () => Promise<void>;
  updateUser: (user: AuthUser | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void apiService.getSession().then(({ user: sessionUser }) => {
      if (active) setUser(sessionUser);
    }).catch(() => {
      if (active) setUser(null);
    }).finally(() => {
      if (active) setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        if (active) setUser(null);
        return;
      }
      // Supabase recommends keeping network work outside the auth callback.
      window.setTimeout(() => {
        void apiService.getSession().then(({ user: sessionUser }) => {
          if (active) setUser(sessionUser);
        }).catch(() => {
          if (active) setUser(null);
        }).finally(() => {
          if (active) setLoading(false);
        });
      }, 0);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const value: AuthContextValue = {
    user,
    loading,
    async login(email, password) {
      const result = await apiService.login(email, password);
      setUser(result.user);
    },
    async register(name, email, password, confirmPassword) {
      const result = await apiService.register(name, email, password, confirmPassword);
      setUser(result.user);
      return result.needsEmailConfirmation;
    },
    async logout() {
      await apiService.logout();
      setUser(null);
    },
    updateUser: setUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
