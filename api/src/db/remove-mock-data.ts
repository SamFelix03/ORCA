import "../load-env.js";
import { prisma } from "./prisma.js";

const placeholderTx = "0x1111111111111111111111111111111111111111111111111111111111111111";
const fakeVaults = [
  "0x1111111111111111111111111111111111111111",
  "0x2222222222222222222222222222222222222222",
  "0x3333333333333333333333333333333333333333",
  "0x4444444444444444444444444444444444444444",
];

async function main(): Promise<void> {
  const seededSignals = await prisma.signal.findMany({
    where: {
      OR: [
        { txHash: placeholderTx },
        { txHash: "0xaaaa...bbbb" },
        { scoutDid: "did:kite:orca/scout-1", riskDecisionReason: "Healthy HF after simulation" },
      ],
    },
    select: { id: true },
  });
  const seededSignalIds = seededSignals.map((item) => item.id);

  await prisma.$transaction([
    prisma.workflowEvent.deleteMany({ where: { signalId: { in: seededSignalIds } } }),
    prisma.x402Payment.deleteMany({ where: { signalId: { in: seededSignalIds } } }),
    prisma.relayerMessage.deleteMany({ where: { signalId: { in: seededSignalIds } } }),
    prisma.riskInstruction.deleteMany({ where: { signalId: { in: seededSignalIds } } }),
    prisma.execution.deleteMany({
      where: {
        OR: [
          { signalId: { in: seededSignalIds } },
          { txHash: "0xexecutedseed" },
        ],
      },
    }),
    prisma.signal.deleteMany({ where: { id: { in: seededSignalIds } } }),
    prisma.session.deleteMany({
      where: {
        OR: [
          { externalSessionId: { startsWith: "sess-" } },
          { agentDid: { in: ["did:kite:orca/scout-1", "did:kite:orca/executor-1"] }, usedAmountUsdc: { gt: 0 } },
        ],
      },
    }),
    prisma.alert.deleteMany({
      where: {
        OR: [
          { message: { contains: "Initial ORCA seed" } },
          { message: { contains: "Position pos-2" } },
          { message: { contains: "Epoch 42" } },
        ],
      },
    }),
    prisma.deposit.deleteMany({ where: { txHash: "0xseeddeposit1" } }),
    prisma.position.deleteMany(),
    prisma.user.deleteMany({ where: { walletAddress: "0x5555555555555555555555555555555555555555" } }),
    prisma.attributionRecord.deleteMany({
      where: {
        OR: [
          { inputHash: { startsWith: "0xinputhash" } },
          { outcomeHash: { startsWith: "0xoutcomehash" } },
          { epochId: 42 },
        ],
      },
    }),
    prisma.scoutPayout.deleteMany({ where: { scoutDid: "did:kite:orca/scout-external-1" } }),
    prisma.scoutMarketplace.deleteMany({ where: { did: "did:kite:orca/scout-external-1" } }),
    prisma.agent.updateMany({
      where: { vaultAddress: { in: fakeVaults } },
      data: {
        online: false,
        spendingUsedUsdc: 0,
        spendingCapUsdc: 0,
        poaiScore: 0,
      },
    }),
  ]);

  console.log(JSON.stringify({ removedMockSignalCount: seededSignalIds.length }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
