export const appName = "Stateless Reader";
export * from "./reader-crypto";
export * from "./passkey-reader";

/** Publisher payment terms for access to an article. */
export interface ArticleOffer {
  amount: number;
  unit: string;
  mint: string;
}

/** Public 402 body. Contains no private reader material or premium content. */
export interface PaymentRequiredResponse {
  articleId: string;
  publicKey: string;
  protocolVersion: 1;
  offer: ArticleOffer;
  paymentRequest: string;
}

/** Public 200 body, returned only after signed authorization and a durable grant. */
export interface ArticleContentResponse {
  articleId: string;
  publicKey: string;
  protocolVersion: 1;
  title: string;
  body: string;
}
