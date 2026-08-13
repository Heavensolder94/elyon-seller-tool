export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true, service: "elyon-jarvis-worker", version: "0.1.0" });
    }

    if (request.method === "GET" && url.pathname === "/") {
      return Response.json({ service: "elyon-jarvis-worker", status: "online", health: "/health" });
    }

    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }
};
