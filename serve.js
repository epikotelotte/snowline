// Tiny static file server for local preview: node serve.js  →  http://localhost:5173
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = process.env.PORT || 5173;
const types = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".json": "application/json",
  ".mp4": "video/mp4", ".webm": "video/webm", ".woff2": "font/woff2"
};

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  const file = path.normalize(path.join(root, urlPath === "/" ? "index.html" : urlPath));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end("Not found"); }
    const headers = { "Content-Type": types[path.extname(file).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store", "Accept-Ranges": "bytes" };
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
    if (range) {
      const start = range[1] ? +range[1] : 0;
      const end = range[2] ? Math.min(+range[2], st.size - 1) : st.size - 1;
      res.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${st.size}`, "Content-Length": end - start + 1 });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...headers, "Content-Length": st.size });
    fs.createReadStream(file).pipe(res);
  });
}).listen(port, () => console.log(`Trail Atlas → http://localhost:${port}`));
