"use client";

import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { settingsStore } from "@/lib/browser/settings";
import { getWorkspaceState, type Workspace, type WorkspaceState } from "@/lib/browser/workspace";
import type { Settings } from "@/lib/types";

interface WorkspaceContextValue {
  state: WorkspaceState | null; // null while loading
  setWorkspace: (ws: Workspace | null) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WorkspaceState | null>(null);

  useEffect(() => {
    getWorkspaceState()
      .then(setState)
      .catch(() => setState({ status: "none" }));
  }, []);

  const setWorkspace = useCallback(
    (ws: Workspace | null) => setState(ws ? { status: "ready", workspace: ws } : { status: "none" }),
    [],
  );

  return <WorkspaceContext.Provider value={{ state, setWorkspace }}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside AppProviders");
  return ctx;
}

/** Settings from this browser's storage; null during server render. */
export function useSettings(): [Settings | null, (next: Settings) => void] {
  const settings = useSyncExternalStore(settingsStore.subscribe, settingsStore.get, settingsStore.getServer);
  return [settings, settingsStore.set];
}
