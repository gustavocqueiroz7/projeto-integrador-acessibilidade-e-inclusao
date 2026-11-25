const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

// Inicializa o banco de dados SQLite
const db = new DatabaseSync("banco_escola.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS app_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    payload TEXT NOT NULL
  )
`);

// Tipos de arquivos suportados para o site
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml"
};

const server = http.createServer((req, res) => {
  // ROTA GET: Carrega os dados do SQLite para o site
  if (req.method === "GET" && req.url.startsWith("/api/data")) {
    const stmt = db.prepare("SELECT payload FROM app_state WHERE id = 1");
    const row = stmt.get();

    const data = row
      ? row.payload
      : JSON.stringify({
          reports: [],
          supports: [],
          voted: [],
          user: null
        });

    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(data);
    return;
  }

  // ROTA PUT: Salva as alterações do site no SQLite
  if (req.method === "PUT" && req.url === "/api/data") {
    let body = "";

    req.on("data", chunk => {
      body += chunk.toString();
    });

    req.on("end", () => {
      try {
        const stmt = db.prepare(`
          INSERT INTO app_state (id, payload)
          VALUES (1, ?)
          ON CONFLICT(id) DO UPDATE SET payload = excluded.payload
        `);
        stmt.run(body);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
      } catch (err) {
        console.error("Erro ao salvar no banco:", err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Erro ao salvar no SQLite" }));
      }
    });
    return;
  }

  // SERVIR OS ARQUIVOS DO SITE (HTML, CSS, JS)
  let filePath = req.url === "/" ? "/inex.html" : req.url.split("?")[0];
  const fullPath = path.join(__dirname, filePath);
  const ext = path.extname(fullPath);

  fs.readFile(fullPath, (err, content) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Arquivo não encontrado");
    } else {
      res.writeHead(200, {
        "Content-Type": mimeTypes[ext] || "application/octet-stream"
      });
      res.end(content);
    }
  });
});

const PORT = 8000;
server.listen(PORT, () => {
  console.log(`Servidor Node.js rodando! Acesse: http://localhost:${PORT}`);
});