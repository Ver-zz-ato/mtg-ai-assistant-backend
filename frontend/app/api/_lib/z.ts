// app/api/_lib/z.ts
import { z } from "zod";

export const MessageSchema = z.object({
  role: z.enum(["user","assistant","system"]).default("user"),
  content: z.string().min(1),
});

export const PostMessageSchema = z.object({
  threadId: z.string().uuid().optional(),
  message: MessageSchema,
  deckId: z.string().uuid().optional(),
});

export const RenameThreadSchema = z.object({
  threadId: z.string().uuid(),
  title: z.string().min(1).max(200),
});

export const DeleteThreadSchema = z.object({
  threadId: z.string().uuid(),
});

export const LinkThreadSchema = z.object({
  threadId: z.string().uuid(),
  deckId: z.string().uuid(),
});
