"use client";

import { useState, useSyncExternalStore } from "react";
import {
  canPickFolder,
  canUseBrowserStorage,
  chooseFolder,
  reconnectFolder,
  connectBrowserStorage,
  type Workspace,
} from "@/lib/browser/workspace";
import { useWorkspace } from "./AppProviders";
import { Button, Card, ErrorNote } from "./ui";

const noop = () => () => {};

/** Renders children only once a workspace folder is connected. */
export default function WorkspaceGate({ children }: { children: (ws: Workspace) => React.ReactNode }) {
  const { state, setWorkspace } = useWorkspace();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Browser capabilities are only known on the client.
  const folderSupported = useSyncExternalStore(noop, canPickFolder, () => true);
  const browserSupported = useSyncExternalStore(noop, canUseBrowserStorage, () => true);

  const act = async (fn: () => Promise<Workspace | null>) => {
    setBusy(true);
    setError(null);
    try {
      const ws = await fn();
      if (ws) setWorkspace(ws);
      else setError("Permission was not granted.");
    } catch (err) {
      if ((err as DOMException).name !== "AbortError") setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (state === null) return <p className="text-fg-soft">Loading…</p>;
  if (state.status === "ready") return <>{children(state.workspace)}</>;

  if (state.status === "needs-permission") {
    return (
      <Card className="mx-auto max-w-xl text-center">
        <h1 className="text-lg font-semibold">Reconnect your projects folder</h1>
        <p className="mt-2 text-sm text-fg-soft">
          The browser needs your OK again to use <strong className="text-fg">{state.handle.name}</strong>.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Button busy={busy} onClick={() => act(() => reconnectFolder(state.handle))}>
            Allow access to {state.handle.name}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => act(chooseFolder)}>
            Choose a different folder
          </Button>
        </div>
        <div className="mt-4">
          <ErrorNote message={error} />
        </div>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-xl">
      <h1 className="text-lg font-semibold">Where should projects be saved?</h1>
      <p className="mt-2 text-sm text-fg-soft">
        Pick a folder on this computer, e.g. <code className="font-mono">Videos/Content Copilot</code>. Each project
        becomes a sub-folder with the script, footage, voiceover and subtitles, ready to open in your editor. Nothing is
        uploaded anywhere.
      </p>
      <div className="mt-5 flex flex-col gap-3">
        {folderSupported ? (
          <Button busy={busy} onClick={() => act(chooseFolder)}>
            Choose projects folder
          </Button>
        ) : (
          <>
            <p className="rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
              This browser can&apos;t save into a folder. Use <strong>Chrome</strong> or <strong>Edge</strong> on a
              computer for the best experience.
            </p>
            {browserSupported && (
              <>
                <Button busy={busy} onClick={() => act(connectBrowserStorage)}>
                  Keep projects inside this browser instead
                </Button>
                <p className="text-xs text-fg-soft">
                  Files stay in the browser&apos;s private storage; use “Download as .zip” on each project to get them
                  out.
                </p>
              </>
            )}
          </>
        )}
      </div>
      <div className="mt-4">
        <ErrorNote message={error} />
      </div>
    </Card>
  );
}
