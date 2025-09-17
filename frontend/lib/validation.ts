import { z } from "zod";
export const CurrencyEnum = z.enum(["USD", "EUR", "GBP"]).default("USD");
export type Currency = z.infer<typeof CurrencyEnum>;
export const PriceBody = z.object({ names: z.array(z.string().min(1)).min(1), currency: CurrencyEnum.optional() });
export const CostBody = z.object({ deckId: z.string().uuid().optional(), deckText: z.string().max(30000).optional(), collectionId: z.string().uuid().optional(), useOwned: z.boolean().optional(), currency: CurrencyEnum.optional(), }).refine((v)=>!!(v.deckId || (v.deckText && v.deckText.trim())), { message: "Provide deckId or deckText", path: ["deckId"], });
export const SearchQuery = z.object({ q: z.string().trim().min(1) });
