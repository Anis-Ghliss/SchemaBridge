import http from "node:http";

const port = Number(process.env.PORT ?? 8080);
const mode = process.env.MODE ?? "source";
const name = process.env.SERVICE_NAME ?? "demo-service";

const sourceCustomer = {
  customerId: "c-1001",
  customerName: "Ada Lovelace",
  customerEmail: "ada@example.com",
  customerSignupDate: "2024-04-12"
};

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: name, mode }));
    return;
  }

  if (mode === "source" && req.method === "GET" && req.url?.startsWith("/customer")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(sourceCustomer));
    return;
  }

  if (mode === "target" && req.method === "POST" && req.url === "/customers") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      let parsed;
      try { parsed = JSON.parse(body); } catch { parsed = body; }
      console.log(`[${name}] received`, JSON.stringify(parsed));
      res.writeHead(201, { "content-type": "application/json" });
      res.end(JSON.stringify({ customer: { id: "srv-b-7", name: parsed?.customer?.name ?? null, email: parsed?.customer?.email ?? null }, persistedAt: new Date().toISOString() }));
    });
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: `no handler for ${req.method} ${req.url} in mode=${mode}` }));
});

server.listen(port, "0.0.0.0", () => {
  console.log(`[${name}] listening on ${port} (mode=${mode})`);
});
