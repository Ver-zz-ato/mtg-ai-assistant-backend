// Ensure this file exists at: frontend/lib/currency.ts
// and that your tsconfig has "baseUrl": "frontend" (or correct alias for "@/")

export type Currency = "USD" | "EUR" | "GBP";

export const currencyPrefix = (c: Currency): string => {
  switch (c) {
    case "EUR":
      return "€";
    case "GBP":
      return "£";
    case "USD":
    default:
      return "$";
  }
};

// (Optional helpers if you ever need them)
export const currencyCode = (c: Currency) => c;
export const isCurrency = (v: string): v is Currency =>
  v === "USD" || v === "EUR" || v === "GBP";
