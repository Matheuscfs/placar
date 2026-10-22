/**
 * Chaves VAPID: identificam ESTE servidor perante o serviço de push do navegador. A pública vai para o
 * navegador (por isso o prefixo NEXT_PUBLIC_); a privada só existe no servidor. Gere o par com
 * `npm run push:keys`. Sem as três variáveis, os avisos ficam desligados e o resto do app segue igual.
 */
export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  /** `mailto:` ou `https:`: o serviço de push usa para falar com você se o servidor se comportar mal. */
  subject: string;
}

// Lê a cada chamada (não na carga do módulo): os testes e o `next dev` mudam o ambiente depois.
export function getVapidConfig(): VapidConfig | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() ?? "";
  const subject = process.env.VAPID_SUBJECT?.trim() ?? "";
  if (!publicKey || !privateKey) return null;
  if (!/^(mailto:[^\s@]+@[^\s@]+|https:\/\/\S+)$/.test(subject)) return null;
  return { publicKey, privateKey, subject };
}

export const isPushConfigured = () => getVapidConfig() !== null;
