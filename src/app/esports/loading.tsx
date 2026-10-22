import { MatchListSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="pt-3">
      <div className="skeleton h-5 w-40" />
      <div className="skeleton mt-2 h-9 w-56" />
      <div className="mt-16">
        <MatchListSkeleton />
      </div>
    </div>
  );
}
