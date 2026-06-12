import cors from "cors";
import express, { type Express } from "express";
import { createCorsOptions } from "./config/cors.js";
import type { Env } from "./config/env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { createRoutes } from "./routes/index.js";

export function createApp(env: Env): Express {
  const app = express();

  app.use(cors(createCorsOptions(env)));
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api", createRoutes(env));

  app.use(errorHandler);

  return app;
}
