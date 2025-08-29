import Image from "next/image";

export type PriceItem = {
  name: string;
  image?: string | null;
  usd?: number | null;
  eur?: number | null;
  gbp?: number | null;
  risk: "No reprint" | "Normal" | "Elevated";
};

export default function PriceCard({
  item,
  highlight,
}: {
  item: PriceItem;
  highlight?: "USD" | "EUR" | "GBP";
}) {
  const pill = (txt: string, active: boolean) =>
    `px-2 py-1 rounded-md text-xs border ${
      active
        ? "bg-yellow-500 text-gray-900 border-yellow-400"
        : "bg-gray-800 text-gray-200 border-gray-700"
    }`;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex items-center gap-3">
      {item.image ? (
        <Image
          src={item.image}
          alt={item.name}
          width={72}
          height={100}
          className="w-12 h-16 object-cover rounded-md border border-gray-800"
        />
      ) : (
        <div className="w-12 h-16 rounded-md bg-gray-800 grid place-content-center text-xs text-gray-400">
          No art
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <div className="font-medium truncate">{item.name}</div>
          <span className={pill(item.risk, false)}>{item.risk}</span>
        </div>
        <div className="mt-1 flex gap-3 text-sm">
          <div className={pill("USD", highlight === "USD")}>
            USD {item.usd != null ? item.usd.toFixed(2) : "—"}
          </div>
          <div className={pill("EUR", highlight === "EUR")}>
            EUR {item.eur != null ? item.eur.toFixed(2) : "—"}
          </div>
          <div className={pill("GBP", highlight === "GBP")}>
            GBP {item.gbp != null ? item.gbp.toFixed(2) : "—"}
          </div>
        </div>
      </div>
    </div>
  );
}
