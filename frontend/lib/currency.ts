// lib/currency.ts
export type Currency = "USD" | "EUR" | "GBP";

export function currencySymbol(c: Currency): string {
  switch (c) {
    case "GBP":
      return "£";
    case "EUR":
      return "€";
    default:
      return "$";
  }
}
