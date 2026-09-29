import { notFound, redirect } from "next/navigation";
import { completeSession, getSessionView, ReviewError, type SessionView } from "@/server/review";
import { SessionRunner } from "@/features/review/session-runner";

export const dynamic = "force-dynamic";
export const metadata = { title: "Session" };

async function loadView(id: string): Promise<SessionView | null> {
  try {
    return await getSessionView(id);
  } catch (err) {
    if (err instanceof ReviewError) return null;
    throw err;
  }
}

export default async function SessionPage(props: PageProps<"/session/[id]">) {
  const { id } = await props.params;
  const view = await loadView(id);
  if (!view) notFound();
  if (view.completed) {
    await completeSession(id);
    redirect(`/session/${id}/resume`);
  }
  return <SessionRunner initial={view} />;
}
