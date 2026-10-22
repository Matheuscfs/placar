import { BlockSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="pt-14">
      <div className="mx-auto skeleton h-5 w-40" />
      <div className="mt-6 grid grid-cols-3 items-center gap-4">
        <div className="skeleton mx-auto h-16 w-16 rounded-full" />
        <div className="skeleton mx-auto h-12 w-24" />
        <div className="skeleton mx-auto h-16 w-16 rounded-full" />
      </div>
      <BlockSkeleton lines={6} />
    </div>
  );
}
