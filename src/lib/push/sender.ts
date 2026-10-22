import webpush from "web-push";
import type { NotificationPayload, PushSender, PushSubscriptionJson, SendResult } from "./types";
import type { VapidConfig } from "./vapid";

/** Tempo de vida do aviso no serviço de push: um gol entregue 10 minutos depois já é velho, melhor descartar. */
const TTL_SECONDS = 120;
const TIMEOUT_MS = 8_000;

/** Entrega pelo protocolo Web Push (RFC 8030/8291/8292) usando a biblioteca `web-push`. */
export class WebPushSender implements PushSender {
  constructor(private readonly vapid: VapidConfig) {}

  async send(subscription: PushSubscriptionJson, payload: NotificationPayload): Promise<SendResult> {
    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload), {
        vapidDetails: { subject: this.vapid.subject, publicKey: this.vapid.publicKey, privateKey: this.vapid.privateKey },
        TTL: TTL_SECONDS,
        urgency: "high",
        timeout: TIMEOUT_MS,
      });
      return "sent";
    } catch (e) {
      // 404/410: o aparelho cancelou ou a inscrição expirou. Insistir não adianta; o job remove.
      if (e instanceof webpush.WebPushError && (e.statusCode === 404 || e.statusCode === 410)) return "gone";
      return "failed";
    }
  }
}
