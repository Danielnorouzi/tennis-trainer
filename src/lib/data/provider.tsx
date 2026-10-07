"use client";

import type { User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useEffectEvent, useMemo, useState, type ReactNode } from "react";
import { LocalStore } from "./local-store";
import { SupabaseStore } from "./supabase-store";
import { subscribe, type DataStore } from "./store";
import type { Profile, Settings } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { getSupabase } from "../supabase/client";
import { supabaseEnabled } from "../supabase/config";
import { getServerStatus, type ServerStatus } from "../api/client";

interface StoreContextValue {
  store: DataStore | null;
  user: User | null;
  /** auth state resolved and store ready */
  ready: boolean;
  status: ServerStatus | null;
  refreshStatus: () => void;
}

// One guest store per page lifetime (IndexedDB connection is reused across renders).
let guestStore: LocalStore | null = null;
const getGuestStore = () => (guestStore ??= new LocalStore());

const StoreContext = createContext<StoreContextValue>({ store: null, user: null, ready: false, status: null, refreshStatus: () => {} });

export function StoreProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // Without Supabase there is no auth to wait for: guest mode is resolved immediately.
  const [authResolved, setAuthResolved] = useState(!supabaseEnabled);
  const [status, setStatus] = useState<ServerStatus | null>(null);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    sb.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setAuthResolved(true);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const refreshStatus = useCallback(() => {
    getServerStatus().then(setStatus);
  }, []);
  useEffect(() => {
    refreshStatus();
  }, [refreshStatus, user?.id]);

  const store = useMemo<DataStore | null>(() => {
    if (!authResolved || typeof window === "undefined") return null;
    const sb = getSupabase();
    if (user && sb) return new SupabaseStore(sb, user.id);
    return getGuestStore();
  }, [authResolved, user]);

  const value = useMemo(() => ({ store, user, ready: Boolean(store), status, refreshStatus }), [store, user, status, refreshStatus]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStoreContext(): StoreContextValue {
  return useContext(StoreContext);
}

export function useStore(): DataStore | null {
  return useContext(StoreContext).store;
}

/**
 * Re-runs `load` whenever the store changes or any data is written. Returns
 * { data, loading, error, reload }.
 */
export function useStoreQuery<T>(load: (s: DataStore) => Promise<T>, deps: readonly unknown[] = []) {
  const store = useStore();
  const [state, setState] = useState<{ data: T | undefined; loading: boolean; error: Error | null }>({ data: undefined, loading: true, error: null });
  // bumped whenever stored data changes anywhere in the app (or on manual reload)
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => subscribe(reload), [reload]);

  const runLoad = useEffectEvent((s: DataStore) => load(s));
  const depsKey = JSON.stringify(deps);
  useEffect(() => {
    if (!store) return;
    let cancelled = false;
    runLoad(store).then(
      (data) => !cancelled && setState({ data, loading: false, error: null }),
      (error: Error) => !cancelled && setState((s) => ({ data: s.data, loading: false, error })),
    );
    return () => {
      cancelled = true;
    };
  }, [store, version, depsKey]);

  return { ...state, loading: state.loading || !store, reload };
}

export function useProfile() {
  return useStoreQuery((s) => s.getProfile());
}

export function useSettings(): { settings: Settings; loading: boolean; save: (patch: Partial<Settings>) => Promise<void> } {
  const store = useStore();
  const q = useStoreQuery((s) => s.getSettings());
  const settings = q.data ?? DEFAULT_SETTINGS;
  const save = useCallback(
    async (patch: Partial<Settings>) => {
      if (!store) return;
      await store.saveSettings({ ...(await store.getSettings()), ...patch });
    },
    [store],
  );
  return { settings, loading: q.loading, save };
}

export function defaultProfile(): Profile {
  const now = Date.now();
  return {
    id: "local",
    name: "",
    experience: "intermediate",
    handedness: "right",
    backhand: "two",
    frequency: "weekly",
    goals: [],
    preferredStrokes: [],
    challenges: [],
    equipment: ["racket"],
    environment: "both",
    withBall: true,
    onboarded: false,
    createdAt: now,
    updatedAt: now,
  };
}
