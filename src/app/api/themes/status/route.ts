import { NextResponse } from "next/server";
import { countUnclassified, getClassifyState } from "@/server/themes";

export const dynamic = "force-dynamic";

/** GET /api/themes/status — état du rangement automatique (suivi par la page Thèmes). */
export async function GET() {
  const state = getClassifyState();
  return NextResponse.json({ ...state, unclassified: await countUnclassified() });
}
