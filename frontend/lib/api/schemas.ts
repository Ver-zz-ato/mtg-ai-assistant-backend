import { z } from 'zod';

export const uuidSchema = z.string().uuid();

export const collectionCreateBodySchema = z.object({
  name: z.string().min(1).max(120),
});

export const deckForkSwapsBodySchema = z.object({
  sourceDeckId: uuidSchema.optional(),
  deckText: z.string().max(50000).optional(),
  commander: z.string().max(200).optional(),
  format: z.string().max(64).optional(),
  title: z.string().min(1).max(120).optional(),
  swaps: z.array(z.object({
    from: z.string().min(1).max(200),
    to: z.string().min(1).max(200),
  })).min(1).max(100),
});

export const priceSnapshotBodySchema = z.object({
  names: z.array(z.string().min(1)).max(200),
  currency: z.string().max(8).optional(),
});

export const fuzzyMatchBodySchema = z.object({
  names: z.array(z.string().min(1)).max(100),
});
