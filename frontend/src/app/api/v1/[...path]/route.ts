/**
 * Same-origin API proxy (catch-all route handler).
 *
 * The browser only ever talks to Next.js; this handler forwards `/api/v1/*` to
 * the FastAPI backend configured by `AQUANEXUS_BACKEND_ORIGIN` (server-side
 * only, never exposed to the client bundle).
 *
 * Why a route handler instead of `next.config.mjs` rewrites: the rewrite proxy
 * returns a bare `500 Internal Server Error` text body when the backend is
 * unreachable. That is indistinguishable from a genuine application failure and
 * the frontend's JSON client reports it as an opaque `http_error`. This handler
 * instead:
 *   - returns a structured `{"error": {...}}` envelope with an honest status
 *     (503 `backend_unreachable` / 504 `backend_timeout`) so the UI can render a
 *     real "API unreachable" state;
 *   - streams the response body through as bytes, so binary payloads (the PDF
 *     report) and JSON both pass through intact;
 *   - never echoes upstream internals or credentials to the browser.
 */
import { NextResponse, type NextRequest } from "next/server";

const BACKEND_ORIGIN = (
  process.env.AQUANEXUS_BACKEND_ORIGIN ?? "http://localhost:8000"
).replace(/\/$/, "");

// Long enough for a slow provider round-trip (the AI analysis can take ~45 s),
// short enough that a hung backend does not pin a request forever.
const UPSTREAM_TIMEOUT_MS = 120_000;

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "content-encoding",
  "content-length",
]);

function errorResponse(
  status: number,
  code: string,
  message: string,
): NextResponse {
  return NextResponse.json(
    { error: { code, message, details: { backend: BACKEND_ORIGIN } } },
    { status },
  );
}

async function proxy(
  request: NextRequest,
  { params }: { params: { path: string[] } },
): Promise<NextResponse> {
  const target = `${BACKEND_ORIGIN}/api/v1/${params.path.join("/")}${request.nextUrl.search}`;

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  headers.set("accept", request.headers.get("accept") ?? "application/json");
  // Forward the client's cancellation so a superseded search really cancels.
  const signal = AbortSignal.any([
    request.signal,
    AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  ]);

  const method = request.method;
  const body =
    method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();

  let upstream: Response;
  try {
    upstream = await fetch(target, { method, headers, body, signal, cache: "no-store" });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      // A caller cancellation is not an error worth reporting as a timeout.
      if (request.signal.aborted) {
        return errorResponse(499, "client_closed_request", "The request was cancelled.");
      }
      return errorResponse(
        504,
        "backend_timeout",
        "The AquaNexus API did not respond in time.",
      );
    }
    return errorResponse(
      503,
      "backend_unreachable",
      "The AquaNexus API is not reachable. Start the backend (see README) and retry.",
    );
  }

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) responseHeaders.set(key, value);
  });

  // Pass the body through as raw bytes so JSON and PDF are both untouched.
  const buffer = await upstream.arrayBuffer();
  return new NextResponse(buffer, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
export const OPTIONS = proxy;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
