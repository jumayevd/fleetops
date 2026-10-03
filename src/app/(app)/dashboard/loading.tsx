/** Skeleton that mirrors the Overview layout so the page does not jump when data arrives. */
export default function Loading() {
  const block = "animate-pulse rounded-lg border border-line bg-surface";
  return (
    <div aria-busy="true" aria-label="Loading overview">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div className="space-y-2">
          <div className="h-3 w-40 rounded bg-sunken" />
          <div className="h-5 w-64 rounded bg-sunken" />
          <div className="h-3 w-80 rounded bg-sunken" />
        </div>
        <div className="h-8 w-24 rounded-md bg-sunken" />
      </div>
      <div className="mb-2 flex items-center justify-between">
        <div className="h-3 w-36 rounded bg-sunken" />
        <div className="h-3 w-20 rounded bg-sunken" />
      </div>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(230px,1fr))]">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className={`${block} h-[118px]`} />)}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => <div key={i} className={`${block} h-[84px]`} />)}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className={`${block} h-[118px]`} />)}
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div className={`${block} h-[412px] xl:col-span-2`} />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <div className={`${block} h-[190px]`} />
          <div className={`${block} h-[190px]`} />
        </div>
      </div>
    </div>
  );
}
