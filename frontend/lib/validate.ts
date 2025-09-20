import { z } from "zod";

export const ThreadIdSchema = z.string().uuid({ message: "Invalid threadId" });
export const DeckIdSchema = z.string().uuid({ message: "Invalid deckId" });

export const CreateThreadSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  deckId: z.string().uuid().optional().nullable(),
});

export const RenameThreadSchema = z.object({
  threadId: ThreadIdSchema,
  title: z.string().trim().min(1).max(120),
});

export const LinkThreadSchema = z.object({
  threadId: ThreadIdSchema,
  deckId: z.string().uuid().nullable(),
});

export const DeleteThreadSchema = z.object({
  threadId: ThreadIdSchema,
});

export const ExportThreadSchema = z.object({
  threadId: ThreadIdSchema,
});

export const ImportThreadSchema = z.object({
  title: z.string().trim().min(1).max(120),
  messages: z.array(z.object({
    role: z.enum(["user", "assistant", "system"]),
    content: z.string().min(1),
    created_at: z.string().datetime().optional(),
  })).min(1),
  deckId: z.string().uuid().optional().nullable(),
});

export const ChatPostSchema = z.object({
  text: z.string().min(1).max(4000),
  threadId: z.string().uuid().optional().nullable(),
  stream: z.boolean().optional(), // unused for now
});
