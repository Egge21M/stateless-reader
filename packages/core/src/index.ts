export const appName = "Stateless Reader";
export * from "./reader-crypto";

/** Public 402 body. Contains no private reader material or premium content. */
export interface PaymentRequiredResponse {
  articleId: string;
  publicKey: string;
  protocolVersion: 1;
  offer: { amount: number; unit: string; mint: string };
  paymentRequest: string;
}
