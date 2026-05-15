import type { FastifyInstance } from "fastify";
import type {
  ScoutMarketplaceRecord,
  ScoutPayoutsResponse,
  ScoutRegistrationChallengeResponse,
  ScoutRegistrationConfirmResponse,
  ScoutRegistrationTxDataResponse,
  ScoutsResponse,
} from "@orca/shared";
import { z } from "zod";
import { config } from "../config.js";
import { listScoutPayouts, listScouts } from "../repositories/orca.js";
import {
  attestPendingMarketplace,
  confirmMarketplaceRegistration,
  createScoutRegisterChallenge,
  getRegisterPermissionlessCalldata,
  scoutRegistrationTypesForChallenge,
} from "../repositories/scouts.js";

const attestSchema = z.object({
  domainName: z.string().min(1).optional(),
  chainId: z.number().int().positive().optional(),
  registryAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  stakeDecimals: z.number().int().min(0).max(36).optional(),
  did: z.string().min(3),
  vault: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  bondAmountWei: z.string().regex(/^[1-9]\d*$/),
  ownerAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  nonce: z.string().min(1),
  deadline: z.string().regex(/^[1-9]\d*$/),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
  messageDidHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
});

const confirmSchema = z.object({
  marketplaceId: z.string().min(1),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
});

export async function registerScoutRoutes(app: FastifyInstance): Promise<void> {
  app.get("/scouts", async (): Promise<ScoutsResponse> => {
    return { scouts: await listScouts() };
  });

  app.get<{ Querystring: { did?: string } }>(
    "/scouts/register/challenge",
    async (request): Promise<ScoutRegistrationChallengeResponse> => {
      if (!config.orcaRegistryAddress.trim()) {
        throw new Error("ORCA_REGISTRY_ADDRESS is not configured on the API.");
      }
      if (!config.scoutStakeTokenAddress.trim()) {
        throw new Error("SCOUT_STAKE_TOKEN_ADDRESS is not configured on the API.");
      }
      const did = typeof request.query.did === "string" ? request.query.did : undefined;
      const { nonce, deadlineUnix, didHashHex } = await createScoutRegisterChallenge(did);

      return {
        nonce,
        deadline: deadlineUnix,
        domain: {
          name: config.scoutEip712DomainName,
          version: "1",
          chainId: config.kiteChainId,
        },
        types: scoutRegistrationTypesForChallenge(),
        primaryType: "ScoutRegistration",
        registryAddress: config.orcaRegistryAddress,
        stakeTokenAddress: config.scoutStakeTokenAddress,
        stakeDecimals: config.scoutStakeDecimals,
        didHashHex,
      };
    },
  );

  app.post("/scouts/register", async (request): Promise<{ scout: ScoutMarketplaceRecord }> => {
    const parsed = attestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new Error(`Invalid registration attest payload: ${parsed.error.message}`);
    }
    const body = parsed.data;
    const scout = await attestPendingMarketplace({
      domainName: body.domainName ?? config.scoutEip712DomainName,
      chainId: body.chainId ?? config.kiteChainId,
      registryAddress: body.registryAddress,
      stakeDecimals: body.stakeDecimals ?? config.scoutStakeDecimals,
      did: body.did,
      vault: body.vault,
      bondAmountWei: body.bondAmountWei,
      ownerAddress: body.ownerAddress,
      nonce: body.nonce,
      deadline: body.deadline,
      signature: body.signature,
      messageDidHash: body.messageDidHash,
    });
    return { scout };
  });

  app.get<{ Params: { marketplaceId: string } }>(
    "/scouts/register/tx/:marketplaceId",
    async (request): Promise<ScoutRegistrationTxDataResponse> => {
      const { to, data } = await getRegisterPermissionlessCalldata(request.params.marketplaceId);
      return { to, data, marketplaceId: request.params.marketplaceId };
    },
  );

  app.post("/scouts/register/confirm", async (request): Promise<ScoutRegistrationConfirmResponse> => {
    const parsed = confirmSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new Error(`Invalid confirm payload: ${parsed.error.message}`);
    }
    const scout = await confirmMarketplaceRegistration(parsed.data.marketplaceId, parsed.data.txHash);
    return { scout };
  });

  app.get<{ Querystring: { did?: string } }>("/scouts/payouts", async (request): Promise<ScoutPayoutsResponse> => {
    const did = typeof request.query.did === "string" ? request.query.did : undefined;
    return { payouts: await listScoutPayouts(did) };
  });
}
