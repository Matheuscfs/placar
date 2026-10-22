/** Marca: o nome em largura expandida e o ponto cobalto, o mesmo ponto que pulsa nos jogos ao vivo. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`wordmark inline-flex items-baseline text-[1.35rem] ${className}`}>
      placar
      <span aria-hidden className="ml-0.5 inline-block h-[0.42em] w-[0.42em] rounded-full bg-live" />
    </span>
  );
}
