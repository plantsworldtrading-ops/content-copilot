import { connection } from "next/server";
import { handle } from "@/lib/http";
import { listVoices } from "@/lib/tts";

export async function GET() {
  await connection();
  return handle(listVoices);
}
