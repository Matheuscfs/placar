/** Esqueletos com o mesmo tamanho do conteúdo real, para a página não "pular" quando os dados chegam. */

export function MatchRowSkeleton() {
  return (
    <div className="-mx-3 grid grid-cols-[minmax(0,1fr)_auto_4.5rem] grid-rows-[1.75rem_1.75rem] items-center gap-x-3 gap-y-2.5 px-3 py-3">
      <span className="flex items-center gap-3">
        <span className="skeleton h-7 w-7 rounded-full" />
        <span className="skeleton h-4 w-32" />
      </span>
      <span className="skeleton h-5 w-5" />
      <span className="skeleton row-span-2 row-start-1 col-start-3 h-4 w-12 justify-self-end" />
      <span className="flex items-center gap-3">
        <span className="skeleton h-7 w-7 rounded-full" />
        <span className="skeleton h-4 w-28" />
      </span>
      <span className="skeleton h-5 w-5" />
    </div>
  );
}

export function MatchListSkeleton({ sections = 2, rows = 3 }: { sections?: number; rows?: number }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando jogos…</span>
      {Array.from({ length: sections }, (_, s) => (
        <div key={s} className="mt-9 first:mt-3" aria-hidden>
          <div className="skeleton mb-3 h-5 w-44" />
          {Array.from({ length: rows }, (_, r) => (
            <MatchRowSkeleton key={r} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function BlockSkeleton({ lines = 6 }: { lines?: number }) {
  return (
    <div aria-busy="true" className="mt-6 space-y-3">
      <span className="sr-only">Carregando…</span>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} aria-hidden className="skeleton h-9 w-full" style={{ opacity: 1 - i * 0.1 }} />
      ))}
    </div>
  );
}
