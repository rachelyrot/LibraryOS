import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { supabase } from '@/api/base44Client';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  const loadProfileForUser = useCallback(async (authUser) => {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .maybeSingle();

    if (error) throw error;

    if (!profile) {
      // Authenticated with Supabase, but no row in `profiles` (should not normally
      // happen — the handle_new_user trigger creates one on signup — but handle it
      // defensively, e.g. a manually deleted row).
      setUser(null);
      setIsAuthenticated(false);
      setAuthError({ type: 'user_not_registered', message: 'User not registered for this app' });
      return;
    }

    setUser({ id: authUser.id, email: authUser.email, full_name: profile.full_name, role: profile.role });
    setIsAuthenticated(true);
    setAuthError(null);
  }, []);

  // Applies a session to auth state WITHOUT touching isLoadingAuth/authChecked —
  // used both by the initial check and by background auth-state events (e.g.
  // Supabase silently refreshing the token when the tab regains focus), so a
  // background refresh never re-triggers the full-page loading spinner and
  // unmounts the routed page tree (which was resetting in-progress UI state
  // every time the user switched tabs and came back).
  const applySession = useCallback(async (session) => {
    try {
      if (!session) {
        setUser(null);
        setIsAuthenticated(false);
        setAuthError({ type: 'auth_required', message: 'Authentication required' });
        return;
      }
      await loadProfileForUser(session.user);
    } catch (error) {
      console.error('Auth check failed:', error);
      setUser(null);
      setIsAuthenticated(false);
      setAuthError({ type: 'unknown', message: error.message || 'An unexpected error occurred' });
    }
  }, [loadProfileForUser]);

  // Initial auth check only — this is the sole place that toggles isLoadingAuth,
  // so the full-page spinner only appears once, on first load.
  const checkUserAuth = useCallback(async () => {
    setIsLoadingAuth(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await applySession(session);
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  }, [applySession]);

  useEffect(() => {
    checkUserAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });

    return () => subscription.unsubscribe();
  }, [checkUserAuth, applySession]);

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      authError,
      authChecked,
      logout,
      checkUserAuth,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
