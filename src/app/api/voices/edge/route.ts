import { connection } from "next/server";
import { handle } from "@/lib/server/http";
import { listVoices } from "@/lib/server/edge-tts";

export async function GET() {
  await connection();
  return handle(listVoices);
}
