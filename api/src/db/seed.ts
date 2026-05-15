import "../load-env.js";
import { prisma } from "./prisma.js";
import { keccak256, toUtf8Bytes } from "ethers";

async function main(): Promise<void> {
  const existingAgents = await prisma.agent.count();

  if (existingAgents > 0) {
    console.log("Seed skipped: data already exists.");
    return;
  }

  await prisma.agent.createMany({
    data: [
      {
        did: "did:kite:orca/scout-1",
        type: "scout",
        vaultAddress: "0x1111111111111111111111111111111111111111",
        online: true,
        spendingUsedUsdc: 22,
        spendingCapUsdc: 500,
        poaiScore: 88,
      },
      {
        did: "did:kite:orca/risk-1",
        type: "risk",
        vaultAddress: "0x2222222222222222222222222222222222222222",
        online: true,
        spendingUsedUsdc: 5,
        spendingCapUsdc: 100,
        poaiScore: 92,
      },
      {
        did: "did:kite:orca/executor-1",
        type: "executor",
        vaultAddress: "0x3333333333333333333333333333333333333333",
        online: true,
        spendingUsedUsdc: 310,
        spendingCapUsdc: 5000,
        poaiScore: 95,
      },
      {
        did: "did:kite:orca/audit-1",
        type: "audit",
        vaultAddress: "0x4444444444444444444444444444444444444444",
        online: true,
        spendingUsedUsdc: 1,
        spendingCapUsdc: 50,
        poaiScore: 90,
      },
    ],
  });

  await prisma.position.createMany({
    data: [
      {
        chainId: 1,
        chainName: "Ethereum",
        protocol: "aave-v3",
        asset: "PIEUSD",
        amountUsdc: 125000,
        apy: 4.2,
        healthFactor: 1.63,
      },
      {
        chainId: 42161,
        chainName: "Arbitrum",
        protocol: "morpho",
        asset: "PIEUSD",
        amountUsdc: 95000,
        apy: 6.8,
        healthFactor: 1.44,
      },
    ],
  });

  await prisma.signal.createMany({
    data: [
      {
        scoutDid: "did:kite:orca/scout-1",
        srcChain: 1,
        dstChain: 42161,
        srcProtocol: "aave-v3",
        dstProtocol: "morpho",
        netDeltaApy: 2.1,
        suggestedAmountUsdc: 20000,
        status: "approved",
        riskDecisionReason: "Healthy HF after simulation",
        txHash: "0xaaaa...bbbb",
      },
      {
        scoutDid: "did:kite:orca/scout-1",
        srcChain: 42161,
        dstChain: 10,
        srcProtocol: "morpho",
        dstProtocol: "compound-v3",
        netDeltaApy: 1.2,
        suggestedAmountUsdc: 8000,
        status: "pending",
      },
    ],
  });

  const seededSignals = await prisma.signal.findMany({ take: 1, orderBy: { createdAt: "asc" } });
  if (seededSignals.length > 0) {
    await prisma.execution.create({
      data: {
        signalId: seededSignals[0].id,
        instructionId: "inst-seed-1",
        executorDid: "did:kite:orca/executor-1",
        txHash: "0xexecutedseed",
        status: "executed",
      },
    });
  }

  await prisma.session.createMany({
    data: [
      {
        externalSessionId: "sess-exec-1",
        agentDid: "did:kite:orca/executor-1",
        maxAmountPerTxUsdc: 500,
        maxTotalAmountUsdc: 5000,
        usedAmountUsdc: 310,
        ttlSeconds: 86400,
        status: "active",
      },
      {
        externalSessionId: "sess-scout-1",
        agentDid: "did:kite:orca/scout-1",
        maxAmountPerTxUsdc: 2,
        maxTotalAmountUsdc: 500,
        usedAmountUsdc: 22,
        ttlSeconds: 86400,
        status: "active",
      },
    ],
  });

  await prisma.alert.createMany({
    data: [
      {
        type: "health_factor",
        severity: "warning",
        message: "Position health factor moved below 1.50",
      },
      {
        type: "system",
        severity: "info",
        message: "Initial ORCA seed completed",
      },
    ],
  });

  await prisma.attributionRecord.createMany({
    data: [
      {
        agentDid: "did:kite:orca/scout-1",
        actionType: "SIGNAL",
        inputHash: "0xinputhash1",
        outcomeHash: "0xoutcomehash1",
        valueDelta: 124.3,
        epochId: 42,
      },
      {
        agentDid: "did:kite:orca/executor-1",
        actionType: "EXECUTION",
        inputHash: "0xinputhash2",
        outcomeHash: "0xoutcomehash2",
        valueDelta: 244.1,
        epochId: 42,
      },
    ],
  });

  const demoScoutDid = "did:kite:orca/scout-external-1";
  const demoDidHashHex = keccak256(toUtf8Bytes(demoScoutDid));

  await prisma.scoutMarketplace.create({
    data: {
      did: demoScoutDid,
      didHashHex: demoDidHashHex,
      ownerAddress: "0x5555555555555555555555555555555555555555",
      vaultAddress: "0x6666666666666666666666666666666666666666",
      bondAmountWei: "1000000000000",
      chainId: 2368,
      registrationTxHash: null,
      status: "active",
      stakeUsdc: 1000,
      reputationScore: 87.5,
    },
  });

  await prisma.scoutPayout.create({
    data: {
      scoutDid: demoScoutDid,
      epochId: 42,
      amountUsdc: 54.75,
      status: "pending",
      txHash: null,
    },
  });

  console.log("Seed complete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
