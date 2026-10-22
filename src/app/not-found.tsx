import { StateMessage } from "@/components/state-message";

export default function NotFound() {
  return (
    <StateMessage title="Não encontramos essa página" action={{ label: "Ver os jogos de hoje", href: "/" }}>
      O jogo, o time ou a liga que você procura não existe nas fontes de dados, ou o endereço está incorreto.
    </StateMessage>
  );
}
