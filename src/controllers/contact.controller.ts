import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import * as contactService from "../services/contact.service.js";

const createContactSchema = z.object({
  name: z.string(),
  email: z.string(),
  message: z.string(),
});

export const contactController = {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = createContactSchema.parse(req.body);
      const record = await contactService.createContact(body);
      res.status(201).json({ data: record });
    }
    catch (err) {
      next(err);
    }
  },
};
