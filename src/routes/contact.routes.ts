import { Router } from "express";
import { contactController } from "../controllers/contact.controller.js";

export function createContactRoutes(): Router {
  const router = Router();

  router.post("/", contactController.create);

  return router;
}
