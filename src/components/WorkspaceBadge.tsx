"use client";

import { forgetWorkspace } from "@/lib/browser/workspace";
import { useWorkspace } from "./AppProviders";

/** Shows which folder projects are saved to, with a way to switch. */
export default function WorkspaceBadge() {
  const { state, setWorkspace } = useWorkspace();
  if (state?.status !== "ready") return null;
  const { workspace } = state;
  return (
    <div className="flex min-w-0 items-center gap-2 text-xs text-fg-soft">
      <span className="truncate" title={workspace.mode === "folder" ? "Projects are saved in this folder" : ""}>
        {workspace.mode === "folder" ? "📁 " : "🗄 "}
        {workspace.name}
      </span>
      <button
        className="shrink-0 rounded px-1.5 py-0.5 hover:bg-muted hover:text-fg"
        onClick={async () => {
          await forgetWorkspace();
          setWorkspace(null);
        }}
      >
        Change
      </button>
    </div>
  );
}
