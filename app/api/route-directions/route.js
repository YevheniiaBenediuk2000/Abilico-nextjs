/**
 * API Route: /api/route-directions
 * Proxies requests to OpenRouteService to avoid CORS issues.
 * The ORS API doesn't allow browser-side requests, so we proxy through our server.
 */

export async function POST(request) {
  try {
    const body = await request.json();

    const apiKey =
      process.env.ORS_API_KEY || process.env.NEXT_PUBLIC_ORS_API_KEY;

    if (!apiKey) {
      return Response.json(
        { error: { message: "ORS API key not configured" } },
        { status: 500 }
      );
    }

    const orsUrl =
      "https://api.openrouteservice.org/v2/directions/wheelchair/geojson";

    const response = await fetch(orsUrl, {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      return Response.json(data, { status: response.status });
    }

    return Response.json(data);
  } catch (error) {
    console.error("Route directions proxy error:", error);
    return Response.json(
      { error: { message: error.message || "Failed to fetch route" } },
      { status: 500 }
    );
  }
}
