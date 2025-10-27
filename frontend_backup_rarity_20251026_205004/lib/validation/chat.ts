// Zod schemas for chat endpoints (server and client can share)
import { z } from "zod";

export const ChatPostSchema = z.object({
  text: z.string().trim().min(1, "Message cannot be empty"),
  threadId: z.string().uuid().optional().nullable(),
  stream: z.boolean().optional(),
  deckId: z.string().uuid().optional().nullable(), // future-friendly
});

export type ChatPost = z.infer<typeof ChatPostSchema>;
