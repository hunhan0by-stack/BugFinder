import http from "node:http";

/**
 * Minimal local HTTP fixture bound to 127.0.0.1 for Phase 4 scanner tests.
 * Never bind to 0.0.0.0.
 */
export async function startLocalFixtureServer(preferredPort = 3100) {
  const host = "127.0.0.1";

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${host}`);

    if (url.pathname === "/ok") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(
        "<!doctype html><html><head><title>Fixture OK</title></head><body><h1>OK</h1></body></html>",
      );
      return;
    }

    if (url.pathname === "/redirect-safe") {
      response.writeHead(302, { Location: "/ok" });
      response.end();
      return;
    }

    if (url.pathname === "/redirect-private") {
      response.writeHead(302, { Location: "http://127.0.0.1:9/" });
      response.end();
      return;
    }

    if (url.pathname === "/redirect-chain") {
      const step = Number(url.searchParams.get("step") ?? "0");
      if (step >= 6) {
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end("<!doctype html><title>Too many</title><h1>end</h1>");
        return;
      }
      response.writeHead(302, {
        Location: `/redirect-chain?step=${step + 1}`,
      });
      response.end();
      return;
    }

    if (url.pathname === "/tall") {
      const blocks = Array.from({ length: 400 }, (_, index) => {
        return `<p>Line ${index} ${"x".repeat(80)}</p>`;
      }).join("");
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(
        `<!doctype html><html><head><title>Tall Fixture</title></head><body>${blocks}</body></html>`,
      );
      return;
    }

    if (url.pathname === "/pdf") {
      response.writeHead(200, { "Content-Type": "application/pdf" });
      response.end("%PDF-1.4 fixture");
      return;
    }

    if (url.pathname === "/slow") {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end("<!doctype html><title>Slow</title><h1>Slow</h1>");
      return;
    }

    if (url.pathname === "/blocked-subresource") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html><head><title>Blocked Subresource</title></head>
<body>
  <h1>Public fixture</h1>
  <img src="http://169.254.169.254/latest/meta-data/" alt="blocked" />
</body></html>`);
      return;
    }

    if (url.pathname === "/many-hosts") {
      const tags = Array.from({ length: 50 }, (_, index) => {
        return `<img src="https://host${index}.example.invalid/pixel.png" alt="" />`;
      }).join("");
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(
        `<!doctype html><html><head><title>Many Hosts</title></head><body>${tags}</body></html>`,
      );
      return;
    }

    response.writeHead(404, { "Content-Type": "text/plain" });
    response.end("not found");
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(preferredPort, host, () => resolve(undefined));
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Local fixture server failed to bind.");
  }

  return {
    host,
    port: address.port,
    origin: `http://${host}:${address.port}`,
    close: async () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve(undefined)));
      }),
  };
}
