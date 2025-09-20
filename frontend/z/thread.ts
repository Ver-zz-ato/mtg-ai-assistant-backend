import { z } from "zod";

export const RenameThreadBody = z.object({
  threadId: z.string().uuid(),
  title: z.string().min(1).max(120),
});

export const DeleteThreadBody = z.object({
  threadId: z.string().uuid(),
});
