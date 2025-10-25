import { z } from 'zod';

export const CreateThreadBody = z.object({
  title: z.string().min(1).max(200).optional(),
  deckId: z.string().uuid().optional().nullable(),
});

export const RenameThreadBody = z.object({
  threadId: z.string().uuid(),
  title: z.string().min(1).max(200),
});

export const DeleteThreadBody = z.object({
  threadId: z.string().uuid(),
});

export const LinkThreadBody = z.object({
  threadId: z.string().uuid(),
  deckId: z.string().uuid().nullable(), // allow unlink via null
});
