import { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import * as oauthRepository from "./oauth.repository";

/**
 * Backs the MCP SDK's dynamic client registration (RFC 7591) with Postgres.
 * The SDK's registration handler already generates client_id/client_secret
 * before calling registerClient — this store just persists/reads whatever
 * it's given.
 */
export const clientsStore: OAuthRegisteredClientsStore = {
  async getClient(clientId: string) {
    return oauthRepository.getClient(clientId);
  },

  async registerClient(client: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">) {
    const full = client as OAuthClientInformationFull;
    await oauthRepository.insertClient(full);
    return full;
  },
};
