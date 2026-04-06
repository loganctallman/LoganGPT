import { readFileSync } from "fs";
import { join } from "path";

export const runtime = "nodejs";

export async function GET() {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json(
      { status: "error", message: "API key not configured" },
      { status: 500 }
    );
  }

  try {
    readFileSync(join(process.cwd(), "data", "chunks.json"), "utf-8");
  } catch {
    return Response.json(
      { status: "error", message: "Knowledge base unavailable" },
      { status: 500 }
    );
  }

  return Response.json({ status: "ok" });
}
