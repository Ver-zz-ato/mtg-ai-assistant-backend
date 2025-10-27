'use client';

/**
 * WishlistSkeleton - Loading skeleton for wishlist items
 * Shows animated placeholder while wishlist data is being fetched
 */
export default function WishlistSkeleton() {
  return (
    <div className="space-y-4">
      {/* Header Skeleton */}
      <div className="flex items-center justify-between gap-3">
        <div className="h-8 w-48 bg-neutral-900 animate-pulse rounded" />
        <div className="flex gap-2">
          <div className="h-10 w-32 bg-neutral-900 animate-pulse rounded" />
          <div className="h-10 w-24 bg-neutral-900 animate-pulse rounded" />
        </div>
      </div>

      {/* Stats Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="border border-neutral-800 rounded-lg p-4 bg-neutral-950 animate-pulse"
          >
            <div className="h-4 w-20 bg-neutral-900 rounded mb-2" />
            <div className="h-8 w-32 bg-neutral-800 rounded" />
          </div>
        ))}
      </div>

      {/* Table Skeleton */}
      <div className="border border-neutral-800 rounded-lg overflow-hidden bg-neutral-950">
        {/* Table Header */}
        <div className="border-b border-neutral-800 bg-neutral-900/50 p-3">
          <div className="grid grid-cols-5 gap-4">
            <div className="h-4 w-20 bg-neutral-800 animate-pulse rounded col-span-2" />
            <div className="h-4 w-12 bg-neutral-800 animate-pulse rounded" />
            <div className="h-4 w-16 bg-neutral-800 animate-pulse rounded" />
            <div className="h-4 w-16 bg-neutral-800 animate-pulse rounded" />
          </div>
        </div>

        {/* Table Rows */}
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div
            key={i}
            className="border-b border-neutral-800/50 p-3 animate-pulse"
          >
            <div className="grid grid-cols-5 gap-4 items-center">
              {/* Card Name + Image */}
              <div className="col-span-2 flex items-center gap-3">
                <div className="w-12 h-16 bg-neutral-900 rounded flex-shrink-0" />
                <div className="h-4 w-32 bg-neutral-900 rounded" />
              </div>

              {/* Quantity */}
              <div className="h-4 w-8 bg-neutral-900 rounded" />

              {/* Unit Price */}
              <div className="h-4 w-16 bg-neutral-900 rounded" />

              {/* Total Price */}
              <div className="h-4 w-16 bg-neutral-900 rounded" />
            </div>
          </div>
        ))}
      </div>

      {/* Total Skeleton */}
      <div className="flex justify-end">
        <div className="border border-neutral-800 rounded-lg px-6 py-3 bg-neutral-950 animate-pulse">
          <div className="h-6 w-32 bg-neutral-900 rounded" />
        </div>
      </div>
    </div>
  );
}


