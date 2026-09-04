import "dotenv/config";
import path from "node:path";
import express from "express";
import { createServer as createViteServer } from "vite";
import { createApp } from "./src/server/app";

async function startServer() {
  const app = await createApp();
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const dist = path.resolve("dist");
    app.use(express.static(dist));
    app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
  }
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || "127.0.0.1";
  app.listen(port, host, () => console.log(`[FinTrust] http://${host}:${port}`));
}

startServer().catch((error) => {
  console.error("FinTrust 启动失败:", error);
  process.exitCode = 1;
});
