/** Skeleton that mirrors the Overview layout so the page does not jump when data arrives. */
export default function Loading() {
  const block = "animate-pulse rounded-lg border border-line bg-surface";
  return (
    <div aria-busy="true" aria-label="Loading overview">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div className="space-y-2">
          <div className="h-5 w-56 rounded bg-sunken" />
          <div className="h-3 w-80 rounded bg-sunken" />
        </div>
        <div className="h-8 w-24 rounded-md bg-sunken" />
      </div>
      <div className={`${block} h-[84px]`} />
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div className={`${block} h-[420px] xl:col-span-2`} />
        <div className={`${block} h-[420px]`} />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div className={`${block} h-[360px] xl:col-span-2`} />
        <div className="grid content-start gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <div className={`${block} h-[190px]`} />
          <div className={`${block} h-[160px]`} />
        </div>
      </div>
    </div>
  );
}
