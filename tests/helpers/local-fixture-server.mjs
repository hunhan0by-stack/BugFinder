import http from "node:http";

/**
 * Minimal local HTTP fixture bound to 127.0.0.1 for scanner tests.
 * Never bind to 0.0.0.0.
 */
export async function startLocalFixtureServer(preferredPort = 3100) {
  const host = "127.0.0.1";

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${host}`);

    if (url.pathname === "/ok" || url.pathname === "/clean") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(
        '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Fixture OK</title></head><body><h1>OK</h1></body></html>',
      );
      return;
    }

    if (url.pathname === "/console-error") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html><head><title>Console Error Fixture</title></head>
<body>
  <h1>Console error</h1>
  <script>console.error("Fixture console error");</script>
</body></html>`);
      return;
    }

    if (url.pathname === "/console-error-dup") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html><head><title>Duplicate Console Fixture</title></head>
<body>
  <h1>Duplicate console errors</h1>
  <script>
    function emitFixtureConsoleError() {
      console.error("Fixture console error");
    }
    emitFixtureConsoleError();
    emitFixtureConsoleError();
    emitFixtureConsoleError();
  </script>
</body></html>`);
      return;
    }

    if (url.pathname === "/page-error") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html><head><title>Page Error Fixture</title></head>
<body>
  <h1>Page error</h1>
  <script>
    setTimeout(() => {
      throw new Error("Fixture uncaught exception");
    }, 0);
  </script>
</body></html>`);
      return;
    }

    if (url.pathname === "/missing.js") {
      response.writeHead(404, { "Content-Type": "application/javascript" });
      response.end("// missing");
      return;
    }

    if (url.pathname === "/http-404-resource") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html><head><title>HTTP 404 Resource Fixture</title>
<script src="/missing.js"></script>
</head><body><h1>404 resource</h1></body></html>`);
      return;
    }

    if (url.pathname === "/api/fail-500") {
      response.writeHead(500, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "fixture-500" }));
      return;
    }

    if (url.pathname === "/http-500-api") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html><head><title>HTTP 500 API Fixture</title></head>
<body>
  <h1>500 API</h1>
  <script>
    fetch("/api/fail-500").catch(() => {});
  </script>
</body></html>`);
      return;
    }

    if (url.pathname === "/drop-connection") {
      request.socket.destroy();
      return;
    }

    if (url.pathname === "/request-failed") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html><head><title>Request Failed Fixture</title></head>
<body>
  <h1>Request failed</h1>
  <script>
    fetch("/drop-connection").catch(() => {});
  </script>
</body></html>`);
      return;
    }

    if (url.pathname === "/multi") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html><head><title>Multi Issue Fixture</title>
<script src="/missing.js"></script>
</head>
<body>
  <h1>Multi</h1>
  <script>
    console.error("Fixture console error");
    fetch("/api/fail-500").catch(() => {});
    fetch("/drop-connection").catch(() => {});
    setTimeout(() => { throw new Error("Fixture uncaught exception"); }, 0);
  </script>
</body></html>`);
      return;
    }

    if (url.pathname === "/flood") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html><head><title>Flood Fixture</title></head>
<body>
  <h1>Flood</h1>
  <script>
    for (let i = 0; i < 80; i += 1) {
      console.error("Flood console error " + i);
    }
  </script>
</body></html>`);
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

    const tinyPng =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

    if (url.pathname === "/missing.png") {
      response.writeHead(404, { "Content-Type": "text/plain" });
      response.end("missing");
      return;
    }

    if (url.pathname === "/drop-image") {
      request.socket.destroy();
      return;
    }

    if (url.pathname === "/phase6-clean") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html lang="en"><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Phase 6 Clean</title>
<style>img{max-width:100%;height:auto} .box{max-width:100%}</style>
</head><body>
<main>
  <h1>Phase 6 clean</h1>
  <img src="${tinyPng}" alt="Valid pixel" width="40" height="40" />
  <button type="button">Save</button>
  <label for="name">Name</label>
  <input id="name" type="text" />
  <div class="box">Responsive content</div>
</main>
</body></html>`);
      return;
    }

    if (url.pathname === "/broken-image") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Broken Image</title></head>
<body><h1>Broken</h1><img src="/missing.png" alt="broken" width="120" height="80" /></body></html>`);
      return;
    }

    if (url.pathname === "/broken-image-dup") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Dup Broken</title></head>
<body>
  <img src="/missing.png" alt="a" width="100" height="60" />
  <img src="/missing.png" alt="b" width="100" height="60" />
  <img src="/missing.png" alt="c" width="100" height="60" />
</body></html>`);
      return;
    }

    if (url.pathname === "/broken-image-hidden") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Hidden Broken</title></head>
<body><img src="/missing.png" alt="hidden" style="display:none" width="100" height="60" /><p>ok</p></body></html>`);
      return;
    }

    if (url.pathname === "/broken-image-lazy") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Lazy Broken</title></head>
<body>
  <h1>Lazy</h1>
  <div style="height:3000px"></div>
  <img loading="lazy" src="/missing.png" alt="lazy" width="100" height="60" />
</body></html>`);
      return;
    }

    if (url.pathname === "/broken-image-data") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Data Image</title></head>
<body><img src="${tinyPng}" alt="data" width="40" height="40" /></body></html>`);
      return;
    }

    if (url.pathname === "/broken-image-fail") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Fail Image</title></head>
<body><img src="/drop-image" alt="fail" width="100" height="60" /></body></html>`);
      return;
    }

    if (url.pathname === "/mobile-clean") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Mobile Clean</title>
<style>body{margin:0}.wrap{max-width:100%;padding:8px}</style></head>
<body><div class="wrap"><h1>Mobile clean</h1><p>Fits</p></div></body></html>`);
      return;
    }

    if (url.pathname === "/mobile-overflow") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Mobile Overflow</title></head>
<body><div style="width:1200px;background:#ddd">Wide fixed container</div></body></html>`);
      return;
    }

    if (url.pathname === "/mobile-overflow-nested") {
      const children = Array.from(
        { length: 20 },
        (_, i) => `<div style="width:1100px">child ${i}</div>`,
      ).join("");
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Nested Overflow</title></head>
<body><div style="width:1200px">${children}</div></body></html>`);
      return;
    }

    if (url.pathname === "/mobile-missing-viewport") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(
        `<!doctype html><html><head><title>Missing Viewport</title></head><body><p>No viewport meta</p></body></html>`,
      );
      return;
    }

    if (url.pathname === "/mobile-tiny-overflow") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Tiny Overflow</title></head>
<body><div style="width:392px">Near tolerance</div></body></html>`);
      return;
    }

    if (url.pathname === "/a11y-clean") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>A11y Clean</title></head>
<body>
<main>
  <h1>Accessible</h1>
  <button type="button">Continue</button>
  <label for="email">Email</label>
  <input id="email" type="email" />
  <img src="${tinyPng}" alt="Pixel" width="20" height="20" />
</main>
</body></html>`);
      return;
    }

    if (url.pathname === "/a11y-violations") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>A11y Violations</title></head>
<body>
  <button type="button"></button>
  <input type="text" />
  <img src="${tinyPng}" width="40" height="40" />
</body></html>`);
      return;
    }

    if (url.pathname === "/a11y-repeated") {
      const buttons = Array.from(
        { length: 12 },
        () => `<button type="button"></button>`,
      ).join("");
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>A11y Repeated</title></head>
<body>${buttons}</body></html>`);
      return;
    }

    if (url.pathname === "/a11y-flood") {
      const inputs = Array.from(
        { length: 40 },
        () => `<input type="text" />`,
      ).join("");
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>A11y Flood</title></head>
<body>${inputs}</body></html>`);
      return;
    }

    if (url.pathname === "/mobile-tall") {
      const blocks = Array.from(
        { length: 200 },
        (_, i) => `<p>Mobile line ${i}</p>`,
      ).join("");
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Mobile Tall</title></head>
<body>${blocks}</body></html>`);
      return;
    }

    if (url.pathname === "/mobile-blocked-subresource") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Mobile Blocked</title></head>
<body><img src="http://169.254.169.254/latest/meta-data/" alt="blocked" width="40" height="40" /></body></html>`);
      return;
    }

    if (url.pathname === "/safe-toggle") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Safe Toggle</title></head>
<body>
  <button type="button" id="toggle" aria-expanded="false" aria-controls="panel">Toggle</button>
  <div id="panel" hidden>Panel</div>
  <script>
    document.getElementById("toggle").addEventListener("click", function () {
      var panel = document.getElementById("panel");
      var open = this.getAttribute("aria-expanded") === "true";
      this.setAttribute("aria-expanded", open ? "false" : "true");
      panel.hidden = open;
    });
  </script>
</body></html>`);
      return;
    }

    if (url.pathname === "/dead-click") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Dead Click</title></head>
<body><button type="button">No handler</button></body></html>`);
      return;
    }

    if (url.pathname === "/obstructed-button") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Obstructed</title>
<style>
  .wrap{position:relative;width:200px;height:60px}
  button{width:200px;height:60px}
  .overlay{position:absolute;inset:0;background:rgba(0,0,0,.4)}
</style></head>
<body><div class="wrap"><button type="button">Covered</button><div class="overlay"></div></div></body></html>`);
      return;
    }

    if (url.pathname === "/network-click") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Network Click</title></head>
<body>
  <button type="button" id="net">Fetch</button>
  <script>
    document.getElementById("net").addEventListener("click", function () {
      fetch("/interaction-mutation", { method: "POST", body: "x" }).catch(function(){});
    });
  </script>
</body></html>`);
      return;
    }

    if (url.pathname === "/interaction-mutation") {
      response.writeHead(200, { "Content-Type": "text/plain" });
      response.end("mutated");
      return;
    }

    if (url.pathname === "/persistent-busy") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Busy</title></head>
<body>
  <button type="button" id="busy">Load</button>
  <script>
    document.getElementById("busy").addEventListener("click", function () {
      this.setAttribute("aria-busy", "true");
      this.disabled = true;
    });
  </script>
</body></html>`);
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
