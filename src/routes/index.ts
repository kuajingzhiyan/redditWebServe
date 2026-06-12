import { Router } from "express";
import type { Env } from "../config/env.js";
import { createAuthRoutes } from "./auth.routes.js";
import { createContactRoutes } from "./contact.routes.js";
import { createUserRoutes } from "./user.routes.js";

export function createRoutes(env: Env): Router {
  const router = Router();

  router.use("/auth", createAuthRoutes(env));
  router.use("/users", createUserRoutes(env));
  router.use("/contact", createContactRoutes());

  return router;
}
