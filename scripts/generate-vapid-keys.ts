/**
 * Gera um par de chaves VAPID para os avisos (Web Push) e imprime as linhas prontas para o .env.
 *
 *   npm run push:keys
 *
 * Não grava nada em disco: copie as linhas para o `.env.local` (e, na Vercel, para as variáveis de
 * ambiente do projeto). A chave PRIVADA é segredo: nunca no repositório, nunca em NEXT_PUBLIC_*.
 * Trocar o par depois invalida todas as inscrições existentes (cada aparelho precisa reativar os avisos).
 */
import webpush from "web-push";
import { randomBytes } from "node:crypto";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log(`
# Cole no .env.local (e nas variáveis de ambiente da Vercel)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}
VAPID_PRIVATE_KEY=${privateKey}
VAPID_SUBJECT=mailto:troque-por-um-e-mail-seu@exemplo.com
CRON_SECRET=${randomBytes(24).toString("base64url")}
`);
console.log("Troque o VAPID_SUBJECT por um e-mail (mailto:) ou site (https://) seu: é por ali que o serviço de push te contata se algo der errado.");
