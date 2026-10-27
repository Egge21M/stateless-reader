import type { Token } from '@cashu/cashu-ts';

/** External Cashu boundary. Only a finalized receive has retained the funds. */
export interface Settlement {
  readonly databasePath?: string;
  receive(token: Token): Promise<{ state: string }>;
  close?(): Promise<void>;
}
