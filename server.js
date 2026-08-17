const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const port = Number(process.env.PORT || 3000);
const publicDirectory = path.join(__dirname, "public");

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

const server = http.createServer((request, response) => {
  const requestPath = request.url === "/" ? "/index.html" : request.url;
  const normalizedPath = path.normalize(decodeURIComponent(requestPath.split("?")[0]));
  const filePath = path.join(publicDirectory, normalizedPath);

  if (!filePath.startsWith(publicDirectory)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500, {
        "Content-Type": "text/plain; charset=utf-8"
      });
      response.end(error.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }

    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    response.end(content);
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`StockV2 dashboard: http://127.0.0.1:${port}`);
});

