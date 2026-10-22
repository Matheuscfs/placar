import { MatchListSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="pt-3">
      <div className="skeleton h-9 w-3/4" />
      <div className="skeleton mt-3 h-5 w-24" />
      <div className="skeleton mt-5 h-14 w-full rounded-2xl" />
      <MatchListSkeleton />
    </div>
  );
}
