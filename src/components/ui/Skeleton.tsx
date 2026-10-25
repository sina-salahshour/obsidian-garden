import { cn } from "~/lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("skeleton", className)} />;
}

export function PostCardSkeleton() {
  return (
    <div className="rounded-2xl border border-line p-5 sm:p-6" aria-hidden="true">
      <Skeleton className="h-3 w-32" />
      <Skeleton className="mt-4 h-6 w-4/5" />
      <Skeleton className="mt-3 h-4 w-full" />
      <Skeleton className="mt-2 h-4 w-2/3" />
      <div className="mt-5 flex gap-2">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
    </div>
  );
}

export function PostListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4" role="status" aria-label="Loading posts">
      {Array.from({ length: count }, (_, i) => (
        <PostCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function TagCloudSkeleton({ count = 14 }: { count?: number }) {
  const widths = ["w-14", "w-20", "w-16", "w-24", "w-12", "w-[4.5rem]", "w-28"];
  return (
    <div className="flex flex-wrap gap-2" role="status" aria-label="Loading tags">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className={cn("h-8 rounded-full", widths[i % widths.length])} />
      ))}
    </div>
  );
}

export function CardRowSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-3" role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-xl border border-line p-4">
          <Skeleton className="size-9 shrink-0 rounded-lg" />
          <div className="flex-1">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="mt-2 h-3 w-2/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Generic page-level pending state: a heading bar and a few lines. */
export function PageSkeleton() {
  return (
    <div className="container-prose py-14" role="status" aria-label="Loading page">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="mt-5 h-10 w-4/5" />
      <Skeleton className="mt-3 h-10 w-3/5" />
      <div className="mt-10 grid gap-3">
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className={cn("h-4", i % 3 === 2 ? "w-3/4" : "w-full")} />
        ))}
      </div>
    </div>
  );
}
