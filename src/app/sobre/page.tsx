import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sobre",
  description: "De onde vêm os dados do Placar, quais são os limites e como tratamos escudos e nomes de competições.",
  alternates: { canonical: "/sobre" },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-9">
      <h2 className="text-[1.25rem] font-bold">{title}</h2>
      <div className="mt-2 max-w-[62ch] space-y-3 text-[1.02rem] leading-relaxed text-muted [&_strong]:font-semibold [&_strong]:text-ink">{children}</div>
    </section>
  );
}

export default function AboutPage() {
  return (
    <div className="pt-3">
      <h1 className="text-[2rem] font-bold leading-tight">Sobre o Placar</h1>
      <p className="mt-2 max-w-[44ch] text-[1.05rem] text-muted">Placares de futebol ao vivo, jogos do dia e classificação, sem ruído.</p>

      <Section title="De onde vêm os dados">
        <p>
          O Placar junta três fontes gratuitas. A <strong>ESPN</strong> é a principal: placares ao vivo, lances, escalações e estatísticas. O <strong>openfootball</strong> (domínio público) traz calendário e resultados
          em lote. O <strong>football-data.org</strong> é a reserva para Brasileirão Série A e as principais ligas europeias.
        </p>
        <p>
          Quando a seção de <strong>e-sports</strong> está ativa (CS2, League of Legends e Valorant), os dados vêm do <strong>PandaScore</strong>, no plano gratuito: calendário e resultados, sem garantia de placar ao
          vivo.
        </p>
        <p>Quando a fonte principal falha, o app usa a reserva e avisa na tela. Placar de fonte reserva pode demorar mais para atualizar.</p>
      </Section>

      <Section title="Limites que você deve conhecer">
        <p>
          A API da ESPN usada aqui é pública, mas <strong>não é oficial</strong> e não tem garantia: pode mudar ou parar sem aviso. Os dados do openfootball são atualizados em lote e podem estar
          dias atrasados; a classificação vinda dele é calculada pelo Placar e não considera confronto direto nem punições.
        </p>
        <p>
          O <strong>&quot;Onde passa&quot;</strong> mostra onde cada competição costuma ser transmitida, a partir de uma lista que o Placar mantém e revisa à mão. Os direitos são divididos entre emissoras e
          streamings e o canal muda de jogo para jogo, então confirme o do seu jogo.
        </p>
        <p>O Placar não é uma fonte oficial de resultados. Para qualquer decisão que dependa do placar exato, confira na fonte oficial da competição.</p>
      </Section>

      <Section title="Escudos, nomes e marcas">
        <p>
          Escudos, nomes de clubes e de competições são marcas de seus respectivos titulares. O Placar os exibe apenas para identificar times e campeonatos e não tem vínculo com clubes, ligas, federações ou
          com os provedores de dados.
        </p>
      </Section>

      <Section title="Privacidade">
        <p>
          O Placar não tem conta, não pede nome nem e-mail e não usa rastreadores. Seus favoritos ficam salvos neste aparelho. Para a tela inicial já abrir na ordem certa, o Placar grava um cookie com a
          lista de times e ligas favoritos; ele serve só para isso.
        </p>
        <p>
          Se você ligar os <strong>avisos de jogo</strong>, o servidor passa a guardar também o endereço de entrega de avisos deste aparelho (gerado pelo seu navegador) e as chaves dos seus times
          favoritos, para saber a quem avisar. Desligar os avisos apaga esse cadastro.
        </p>
      </Section>
    </div>
  );
}
