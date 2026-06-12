import { prisma } from "../db/prisma.js";
import { AppError } from "../middleware/errorHandler.js";

export interface CreateContactInput {
  name: string;
  email: string;
  message: string;
}

export interface ContactMessageRecord {
  id: number;
  name: string;
  email: string;
  message: string;
  createdAt: Date;
}

export async function createContact(input: CreateContactInput): Promise<ContactMessageRecord> {
  const name = input.name.trim();
  const email = input.email.trim();
  const message = input.message.trim();

  if (!name) {
    throw new AppError(400, "请填写姓名");
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError(400, "请填写有效的邮箱");
  }
  if (!message) {
    throw new AppError(400, "请填写留言内容");
  }

  return prisma.contactMessage.create({
    data: { name, email, message },
  });
}
