import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-4" role="status" aria-label="Chargement">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-40 w-full rounded-2xl" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
      <span className="sr-only">Chargement…</span>
    </div>
  );
}
