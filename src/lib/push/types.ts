import type { IsoDateTime, MatchStatus } from "@/lib/domain/types";

/** O que o navegador entrega em `PushSubscription.toJSON()`. */
export interface PushSubscriptionJson {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * Um aparelho que pediu avisos. A identidade é o `endpoint` (URL única que o serviço de push do
 * navegador gera para este aparelho); não há conta, e-mail nem nome. Guardamos só as CHAVES dos times
 * favoritos (as mesmas de `Team.key`), o suficiente para decidir a quem avisar.
 */
export interface PushSubscriber {
  /** SHA-256 do endpoint (hex): serve de chave sem expor a URL em logs. */
  id: string;
  subscription: PushSubscriptionJson;
  teams: string[];
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** O que sabíamos de um jogo na última checagem. Comparar com o estado de agora revela o que aconteceu. */
export interface MatchSnapshot {
  status: MatchStatus;
  home: number | null;
  away: number | null;
  seenAt: IsoDateTime;
}

export type PushEventKind = "start" | "goal" | "end";

export interface PushEvent {
  kind: PushEventKind;
  matchId: string;
  /** Chaves (`Team.key`) dos times que jogam: define o público. */
  teamKeys: [home: string, away: string];
}

/** Corpo do aviso, já pronto para o service worker mostrar. */
export interface NotificationPayload {
  title: string;
  body: string;
  /** Avisos do mesmo jogo se substituem em vez de empilhar. */
  tag: string;
  /** Caminho dentro do app aberto ao tocar. Sempre começa com `/`. */
  url: string;
  /** Um gol toca/vibra de novo mesmo substituindo o aviso anterior do jogo. */
  renotify: boolean;
}

export type SendResult = "sent" | "gone" | "failed";

/** Quem de fato entrega o aviso. Trocável nos testes; em produção é o `web-push`. */
export interface PushSender {
  send(subscription: PushSubscriptionJson, payload: NotificationPayload): Promise<SendResult>;
}
