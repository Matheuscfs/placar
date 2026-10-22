import { BlockSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="pt-14">
      <div className="flex items-center gap-4">
        <div className="skeleton h-16 w-16 rounded-full" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-7 w-3/5" />
          <div className="skeleton h-4 w-2/5" />
        </div>
      </div>
      <BlockSkeleton lines={7} />
    </div>
  );
}
