import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

type AuthContextType = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  isPlatformAdmin: boolean;
  adminSetupPending: boolean;
  signUp: (
    email: string,
    password: string,
    firstName: string,
    lastName: string
  ) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  signIn: (
    email: string,
    password: string
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [adminSetupPending, setAdminSetupPending] = useState(false);

  useEffect(() => {
    let active = true;
    let sessionVersion = 0;

    async function loadSession(nextSession: Session | null) {
      const version = ++sessionVersion;
      if (active) {
        setSession(nextSession);
      }

      if (!nextSession?.user) {
        if (active) {
          setIsAdmin(false);
          setIsPlatformAdmin(false);
          setAdminSetupPending(false);
          setLoading(false);
        }
        return;
      }

      const [legacy, authority, platform] = await Promise.all([
        supabase.from("profiles").select("is_admin").eq("id", nextSession.user.id).maybeSingle(),
        supabase.rpc("is_admin"),
        supabase.rpc("is_platform_admin"),
      ]);
      if (active && version === sessionVersion) {
        setIsAdmin(authority.error ? !legacy.error && Boolean(legacy.data?.is_admin) : Boolean(authority.data));
        setIsPlatformAdmin(!platform.error && Boolean(platform.data));
        setAdminSetupPending(Boolean(platform.error && platform.error.code === "PGRST202"));
        setLoading(false);
      }
    }

    // Load any existing session on first paint.
    supabase.auth.getSession().then(({ data }) => {
      loadSession(data.session);
    });

    // Keep the session in sync across login/logout/refresh.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      loadSession(newSession);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp: AuthContextType["signUp"] = async (
    email,
    password,
    firstName,
    lastName
  ) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { first_name: firstName, last_name: lastName },
      },
    });
    if (error) return { error: error.message, needsConfirmation: false };
    // When email confirmation is ON, Supabase returns a user but no session.
    const needsConfirmation = !data.session;
    return { error: null, needsConfirmation };
  };

  const signIn: AuthContextType["signIn"] = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error ? error.message : null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const value: AuthContextType = {
    session,
    user: session?.user ?? null,
    loading,
    isAdmin,
    isPlatformAdmin,
    adminSetupPending,
    signUp,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
