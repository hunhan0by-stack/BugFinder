import http from "node:http";

/**
 * Minimal local HTTP fixture bound to 127.0.0.1 for scanner tests.
 * Never bind to 0.0.0.0.
 */
export async function startLocalFixtureServer(preferredPort = 3100) {
  const host = "127.0.0.1";
  const counters = {
    interactionMutation: 0,
    interactionGet: 0,
    formSubmit: 0,
  };

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

    if (url.pathname === "/safe-checkbox") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Safe Checkbox</title></head>
<body><label><input type="checkbox" /> Option</label></body></html>`);
      return;
    }

    if (url.pathname === "/safe-radio") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Safe Radio</title></head>
<body>
  <label><input type="radio" name="g" value="a" /> A</label>
  <label><input type="radio" name="g" value="b" /> B</label>
</body></html>`);
      return;
    }

    if (url.pathname === "/safe-details") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Safe Details</title></head>
<body><details><summary>More</summary><p>Content</p></details></body></html>`);
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

    if (url.pathname === "/partial-obstructed-button") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Partial Obstructed</title>
<style>
  .wrap{position:relative;width:220px;height:60px;margin:20px}
  button{width:220px;height:60px}
  .overlay{position:absolute;left:0;top:0;width:120px;height:60px;background:rgba(0,0,0,.35)}
</style></head>
<body><div class="wrap"><button type="button">Partial</button><div class="overlay"></div></div></body></html>`);
      return;
    }

    if (url.pathname === "/child-icon-button") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Child Icon</title></head>
<body>
  <button type="button" id="icon-btn" style="width:120px;height:48px">
    <svg width="24" height="24" aria-hidden="true"><rect width="24" height="24" fill="#333"/></svg>
  </button>
  <script>
    document.getElementById("icon-btn").addEventListener("click", function () {
      this.setAttribute("aria-pressed", this.getAttribute("aria-pressed") === "true" ? "false" : "true");
    });
  </script>
</body></html>`);
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

    if (url.pathname === "/get-side-effect") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>GET Side Effect</title></head>
<body>
  <button type="button" id="get">Get</button>
  <script>
    document.getElementById("get").addEventListener("click", function () {
      fetch("/interaction-get").catch(function(){});
    });
  </script>
</body></html>`);
      return;
    }

    if (url.pathname === "/nav-click") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Nav Click</title></head>
<body>
  <button type="button" id="nav">Go</button>
  <script>
    document.getElementById("nav").addEventListener("click", function () {
      location.assign("/ok");
    });
  </script>
</body></html>`);
      return;
    }

    if (url.pathname === "/hash-nav-click") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Hash Nav</title></head>
<body>
  <button type="button" id="hash">Hash</button>
  <script>
    document.getElementById("hash").addEventListener("click", function () {
      location.hash = "section";
    });
  </script>
</body></html>`);
      return;
    }

    if (url.pathname === "/popup-click") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Popup</title></head>
<body>
  <button type="button" id="pop">Open</button>
  <script>
    document.getElementById("pop").addEventListener("click", function () {
      window.open("/ok");
    });
  </script>
</body></html>`);
      return;
    }

    if (url.pathname === "/submit-form") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Submit</title></head>
<body>
  <form method="POST" action="/form-submit">
    <button type="submit">Submit</button>
  </form>
</body></html>`);
      return;
    }

    if (url.pathname === "/destructive-button") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Destructive</title></head>
<body><button type="button">Delete account</button></body></html>`);
      return;
    }

    if (url.pathname === "/orphan-submit") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Orphan Submit</title></head>
<body><button type="submit">Save</button></body></html>`);
      return;
    }

    if (url.pathname === "/offscreen-safe") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Offscreen</title></head>
<body>
  <div style="height:2000px"></div>
  <button type="button" id="far">Far</button>
  <script>
    document.getElementById("far").addEventListener("click", function () {
      this.setAttribute("aria-pressed", "true");
    });
  </script>
</body></html>`);
      return;
    }

    if (url.pathname === "/interaction-mutation") {
      counters.interactionMutation += 1;
      response.writeHead(200, { "Content-Type": "text/plain" });
      response.end("mutated");
      return;
    }

    if (url.pathname === "/interaction-get") {
      counters.interactionGet += 1;
      response.writeHead(200, { "Content-Type": "text/plain" });
      response.end("got");
      return;
    }

    if (url.pathname === "/form-submit") {
      counters.formSubmit += 1;
      response.writeHead(200, { "Content-Type": "text/plain" });
      response.end("submitted");
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

    if (url.pathname === "/busy-recovers") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Busy Recovers</title></head>
<body>
  <button type="button" id="busy" aria-controls="panel" aria-expanded="false">Load</button>
  <div id="panel" hidden>Done</div>
  <script>
    document.getElementById("busy").addEventListener("click", function () {
      var btn = this;
      var panel = document.getElementById("panel");
      btn.setAttribute("aria-busy", "true");
      setTimeout(function () {
        btn.setAttribute("aria-busy", "false");
        btn.setAttribute("aria-expanded", "true");
        panel.hidden = false;
      }, 50);
    });
  </script>
</body></html>`);
      return;
    }

    if (url.pathname === "/phase8/reversible-checkbox") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Phase8 Reversible Checkbox</title></head>
<body><label><input type="checkbox" /> Option</label></body></html>`);
      return;
    }

    if (url.pathname === "/phase8/reversible-details") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Phase8 Reversible Details</title></head>
<body><details><summary>More</summary><p>Content</p></details></body></html>`);
      return;
    }

    if (url.pathname === "/phase8/reversible-aria-pressed") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Phase8 Aria Pressed</title></head>
<body>
  <button type="button" id="pressed" aria-pressed="false">Toggle</button>
  <script>
    document.getElementById("pressed").addEventListener("click", function () {
      this.setAttribute("aria-pressed", this.getAttribute("aria-pressed") === "true" ? "false" : "true");
    });
  </script>
</body></html>`);
      return;
    }

    if (url.pathname === "/phase8/reversible-switch") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Phase8 Switch</title></head>
<body>
  <button type="button" role="switch" id="sw" aria-checked="false">Switch</button>
  <script>
    document.getElementById("sw").addEventListener("click", function () {
      this.setAttribute("aria-checked", this.getAttribute("aria-checked") === "true" ? "false" : "true");
    });
  </script>
</body></html>`);
      return;
    }

    if (url.pathname === "/phase8/reversible-disclosure") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Phase8 Disclosure</title></head>
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

    if (url.pathname === "/phase8/failed-reversal") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Phase8 Failed Reversal</title></head>
<body>
  <button type="button" id="stuck" aria-pressed="false">Stuck</button>
  <script>
    document.getElementById("stuck").addEventListener("click", function () {
      this.setAttribute("aria-pressed", "true");
    });
  </script>
</body></html>`);
      return;
    }

    if (url.pathname === "/phase8/second-disabled") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Phase8 Second Disabled</title></head>
<body>
  <button type="button" id="once" aria-pressed="false">Once</button>
  <script>
    document.getElementById("once").addEventListener("click", function () {
      this.setAttribute("aria-pressed", "true");
      this.disabled = true;
    });
  </script>
</body></html>`);
      return;
    }

    if (url.pathname === "/phase8/second-obstructed") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Phase8 Second Obstructed</title>
<style>
  .wrap{position:relative;width:200px;height:60px}
  button{width:200px;height:60px}
  .overlay{position:absolute;inset:0;background:rgba(0,0,0,.5);display:none}
</style></head>
<body>
  <div class="wrap">
    <button type="button" id="tog" aria-pressed="false">Toggle</button>
    <div class="overlay" id="overlay"></div>
  </div>
  <script>
    document.getElementById("tog").addEventListener("click", function () {
      this.setAttribute("aria-pressed", "true");
      document.getElementById("overlay").style.display = "block";
    });
  </script>
</body></html>`);
      return;
    }

    if (url.pathname === "/phase8/controlled-mismatch") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Phase8 Controlled Mismatch</title></head>
<body>
  <button type="button" id="toggle" aria-expanded="false" aria-controls="panel">Toggle</button>
  <div id="panel" hidden>Panel stays hidden</div>
  <script>
    document.getElementById("toggle").addEventListener("click", function () {
      var open = this.getAttribute("aria-expanded") === "true";
      this.setAttribute("aria-expanded", open ? "false" : "true");
    });
  </script>
</body></html>`);
      return;
    }

    if (url.pathname === "/phase8/second-network") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Phase8 Second Network</title></head>
<body>
  <button type="button" id="net" aria-pressed="false">Toggle</button>
  <script>
    var clicks = 0;
    document.getElementById("net").addEventListener("click", function () {
      clicks += 1;
      if (clicks === 1) {
        this.setAttribute("aria-pressed", "true");
      } else {
        // Defer so the click action can finish before the gated request is observed.
        setTimeout(function () {
          fetch("/interaction-mutation", { method: "POST", body: "x" }).catch(function () {});
        }, 0);
      }
    });
  </script>
</body></html>`);
      return;
    }

    if (url.pathname === "/phase8/second-navigation") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Phase8 Second Navigation</title></head>
<body>
  <button type="button" id="nav" aria-pressed="false">Toggle</button>
  <script>
    var clicks = 0;
    document.getElementById("nav").addEventListener("click", function () {
      clicks += 1;
      if (clicks === 1) {
        this.setAttribute("aria-pressed", "true");
      } else {
        setTimeout(function () {
          location.href = "/ok";
        }, 0);
      }
    });
  </script>
</body></html>`);
      return;
    }

    if (url.pathname === "/phase8/workflow-flood") {
      const boxes = Array.from(
        { length: 8 },
        (_, i) => `<label><input type="checkbox" /> Opt ${i}</label>`,
      ).join("");
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Phase8 Workflow Flood</title></head>
<body>${boxes}</body></html>`);
      return;
    }

    if (url.pathname === "/phase8/dead-click") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Phase8 Dead Click</title></head>
<body><button type="button">No handler</button></body></html>`);
      return;
    }

    if (url.pathname === "/phase8/obstructed") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Phase8 Obstructed</title>
<style>
  .wrap{position:relative;width:200px;height:60px}
  button{width:200px;height:60px}
  .overlay{position:absolute;inset:0;background:rgba(0,0,0,.4)}
</style></head>
<body><div class="wrap"><button type="button">Covered</button><div class="overlay"></div></div></body></html>`);
      return;
    }

    if (url.pathname === "/phase8/broken-image") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Phase8 Broken Image</title></head>
<body><img src="/missing-image-phase8.png" alt="broken" width="80" height="80" /></body></html>`);
      return;
    }

    if (url.pathname === "/phase8/secret-privacy") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Phase8 Secret Privacy</title></head>
<body>
  <button type="button" id="secret-btn">PHASE8_SECRET_BUTTON_TEXT</button>
  <input type="text" value="PHASE8_SECRET_FORM_VALUE" />
  <input type="password" value="PHASE8_PASSWORD_SECRET" />
  <p>query=${url.searchParams.get("secret") ?? ""}</p>
  <script>
    document.getElementById("secret-btn").addEventListener("click", function () {
      this.setAttribute("aria-pressed", this.getAttribute("aria-pressed") === "true" ? "false" : "true");
    });
  </script>
</body></html>`);
      return;
    }

    if (url.pathname === "/phase9/secret-privacy") {
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        Authorization: "PHASE9_SECRET_AUTH",
      });
      response.end(`<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Phase9 Secret Privacy</title></head>
<body>
  <button type="button" id="secret-btn">PHASE9_SECRET_BUTTON</button>
  <form>
    <input type="text" name="note" value="PHASE9_SECRET_FORM" />
    <input type="password" name="password" value="PHASE9_SECRET_PASSWORD" />
  </form>
  <p>query=${url.searchParams.get("secret") ?? ""}</p>
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
    counters,
    close: async () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve(undefined)));
      }),
  };
}
