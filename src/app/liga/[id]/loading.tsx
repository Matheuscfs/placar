import { BlockSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="pt-14">
      <div className="skeleton h-9 w-3/4" />
      <div className="skeleton mt-3 h-5 w-32" />
      <BlockSkeleton lines={10} />
    </div>
  );
}
