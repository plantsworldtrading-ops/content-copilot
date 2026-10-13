import { Suspense } from "react";
import ProjectWorkspace from "@/components/ProjectWorkspace";

export default function Page({ params }: PageProps<"/projects/[id]">) {
  return (
    <Suspense fallback={<p className="text-fg-soft">Loading project…</p>}>
      <ProjectWorkspace params={params} />
    </Suspense>
  );
}
