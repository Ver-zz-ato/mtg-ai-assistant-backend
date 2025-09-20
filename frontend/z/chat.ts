import { z } from "zod";

export const ChatPostBody = z.object({
  message: z.string().min(1, "message cannot be empty"),
  threadId: z.string().uuid().optional().nullable(),
});

export type ChatPostBody = z.infer<typeof ChatPostBody>;
