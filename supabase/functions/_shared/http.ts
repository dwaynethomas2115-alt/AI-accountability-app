export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
export function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
export async function readJson(req: Request) {
  if (Number(req.headers.get("content-length") ?? 0) > 20000)
    throw new Error("Request too large");
  const text = await req.text();
  if (text.length > 20000) throw new Error("Request too large");
  return JSON.parse(text);
}
