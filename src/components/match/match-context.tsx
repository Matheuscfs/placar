import type { FormGame, MatchDetail, MeetingGame, Team, TeamForm } from "@/lib/domain/types";
import { formatShortDate } from "@/lib/ui/format";
import { formSummary, headToHeadRecord, RESULT_LETTER, RESULT_WORD } from "@/lib/ui/match-text";
import { Crest } from "../crest";

/**
 * Letra do resultado. Vitória = preenchido; empate = fundo suave; derrota = só contorno: a diferença não depende
 * só de cor (e a palavra por extenso vai no `title` e no resumo falado).
 */
function Chip({ result }: { result: FormGame["result"] }) {
  const style = result === "win" ? "bg-ink text-bg" : result === "draw" ? "bg-surface text-ink" : "border border-faint text-muted";
  return (
    <span title={RESULT_WORD[result]} className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-xs font-bold ${style}`}>
      {RESULT_LETTER[result]}
    </span>
  );
}

function FormBlock({ form, team }: { form: TeamForm; team: Team }) {
  return (
    <div className="mt-5 first:mt-3">
      <div className="flex items-center gap-3">
        <Crest team={team} size={24} />
        <h3 className="min-w-0 flex-1 truncate text-[1.02rem] font-bold">{team.name}</h3>
        <p className="flex shrink-0 items-center gap-1" role="img" aria-label={`Últimos ${form.games.length} jogos, do mais recente para o mais antigo: ${formSummary(form.games)}`}>
          {form.games.map((g) => (
            <Chip key={g.id} result={g.result} />
          ))}
        </p>
      </div>
      <ul className="mt-2">
        {form.games.map((g) => (
          <li key={g.id} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto_4.5rem] items-center gap-x-3 py-1.5 text-[0.95rem]">
            <span aria-hidden className="text-center text-xs text-muted">
              {g.home ? "vs" : "@"}
            </span>
            <span className="truncate">
              <span className="sr-only">{g.home ? "Em casa contra " : "Fora, contra "}</span>
              {g.opponent.name}
            </span>
            <span className="num font-semibold">
              <span className="sr-only">{RESULT_WORD[g.result]}, </span>
              {g.goalsFor} – {g.goalsAgainst}
            </span>
            <span className="num text-right text-sm text-muted">{formatShortDate(g.date)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Meetings({ games, home, away }: { games: MeetingGame[]; home: Team; away: Team }) {
  const r = headToHeadRecord(games, home.id, away.id);
  return (
    <section aria-labelledby="confrontos" className="mt-9">
      <h2 id="confrontos" className="text-[1.15rem] font-bold">
        Últimos confrontos
      </h2>
      <p className="num mt-2 text-[0.95rem]">
        <span className="font-semibold">{home.name}</span> {r.homeWins} <span className="text-muted">· empates</span> {r.draws} <span className="text-muted">·</span> <span className="font-semibold">{away.name}</span> {r.awayWins}
      </p>
      <ul className="mt-1">
        {games.map((g) => {
          const homeWon = g.home.score > g.away.score;
          const awayWon = g.away.score > g.home.score;
          return (
            <li key={g.id} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_4.5rem] items-center gap-x-2 py-1.5 text-[0.95rem]">
              <span className={`truncate text-right ${homeWon ? "font-semibold" : awayWon ? "text-muted" : ""}`}>{g.home.name}</span>
              <span className="num px-1 font-semibold">
                {g.home.score} – {g.away.score}
              </span>
              <span className={`truncate ${awayWon ? "font-semibold" : homeWon ? "text-muted" : ""}`}>{g.away.name}</span>
              <span className="num text-right text-sm text-muted">{formatShortDate(g.date)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * "Como cada um chega": forma recente dos dois times e os últimos confrontos entre eles. Só com o que a fonte
 * informou: se não veio nada, não desenha nada (nunca uma lista vazia que pareça "sem jogos").
 */
export function MatchContext({ m }: { m: MatchDetail }) {
  const forms = (["home", "away"] as const).flatMap((side) => {
    const f = m.form?.find((x) => x.side === side);
    return f ? [{ form: f, team: side === "home" ? m.home.team : m.away.team }] : [];
  });
  const meetings = m.headToHead ?? [];
  if (forms.length === 0 && meetings.length === 0) return null;

  return (
    <div className="mt-9">
      {forms.length > 0 ? (
        <section aria-labelledby="como-chegam">
          <h2 id="como-chegam" className="text-[1.15rem] font-bold">
            Como cada um chega
          </h2>
          {forms.map(({ form, team }) => (
            <FormBlock key={form.side} form={form} team={team} />
          ))}
        </section>
      ) : null}
      {meetings.length > 0 ? <Meetings games={meetings} home={m.home.team} away={m.away.team} /> : null}
    </div>
  );
}
