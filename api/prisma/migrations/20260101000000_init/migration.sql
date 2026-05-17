-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AgentType" AS ENUM ('scout', 'risk', 'executor', 'audit');

-- CreateEnum
CREATE TYPE "SignalStatus" AS ENUM ('pending', 'approved', 'rejected', 'executing', 'executed', 'failed');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('pending', 'active', 'expired', 'rejected');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('info', 'warning', 'critical');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deposit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "txHash" TEXT,
    "token" TEXT NOT NULL,
    "amountUsdc" DECIMAL(20,6) NOT NULL,
    "destination" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Deposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "did" TEXT NOT NULL,
    "type" "AgentType" NOT NULL,
    "vaultAddress" TEXT NOT NULL,
    "passportSessionId" TEXT,
    "online" BOOLEAN NOT NULL DEFAULT false,
    "spendingUsedUsdc" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "spendingCapUsdc" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "poaiScore" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "lastActionAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Signal" (
    "id" TEXT NOT NULL,
    "scoutDid" TEXT NOT NULL,
    "srcChain" INTEGER NOT NULL,
    "dstChain" INTEGER NOT NULL,
    "srcProtocol" TEXT NOT NULL,
    "dstProtocol" TEXT NOT NULL,
    "netDeltaApy" DECIMAL(12,6) NOT NULL,
    "suggestedAmountUsdc" DECIMAL(20,6) NOT NULL,
    "status" "SignalStatus" NOT NULL DEFAULT 'pending',
    "riskDecisionReason" TEXT,
    "txHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskInstruction" (
    "id" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "riskDid" TEXT NOT NULL,
    "executorDid" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL,
    "sourceSignalHash" TEXT,
    "paymentTxHash" TEXT,
    "signature" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskInstruction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Execution" (
    "id" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "instructionId" TEXT,
    "executorDid" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "lzMessageId" TEXT,
    "status" TEXT NOT NULL,
    "slippageBps" INTEGER,
    "paymentTxHash" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Execution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowEvent" (
    "id" TEXT NOT NULL,
    "signalId" TEXT,
    "stream" TEXT NOT NULL,
    "streamEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "agentDid" TEXT,
    "agentType" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "txHash" TEXT,
    "paymentTxHash" TEXT,
    "chainId" INTEGER,
    "chainOfThought" JSONB,
    "verdict" JSONB,
    "verdictSummary" TEXT,
    "llmModel" TEXT,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentDeliberation" (
    "id" TEXT NOT NULL,
    "signalId" TEXT,
    "agentType" "AgentType" NOT NULL,
    "agentDid" TEXT,
    "step" TEXT NOT NULL,
    "llmModel" TEXT NOT NULL,
    "chainOfThought" JSONB NOT NULL,
    "verdict" JSONB NOT NULL,
    "verdictSummary" TEXT NOT NULL,
    "rawContent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentDeliberation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "X402Payment" (
    "id" TEXT NOT NULL,
    "signalId" TEXT,
    "instructionId" TEXT,
    "fromDid" TEXT,
    "toDid" TEXT NOT NULL,
    "amountWei" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "memo" TEXT,
    "txHash" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "X402Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RelayerMessage" (
    "id" TEXT NOT NULL,
    "signalId" TEXT,
    "messageId" TEXT NOT NULL,
    "originDomain" INTEGER NOT NULL,
    "destinationDomain" INTEGER NOT NULL,
    "recipient" TEXT NOT NULL,
    "dispatchTxHash" TEXT,
    "deliveryTxHash" TEXT,
    "status" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RelayerMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "chainId" INTEGER NOT NULL,
    "chainName" TEXT NOT NULL,
    "protocol" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "amountUsdc" DECIMAL(20,6) NOT NULL,
    "apy" DECIMAL(8,4) NOT NULL,
    "healthFactor" DECIMAL(8,4) NOT NULL,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaultHolding" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "ownerWallet" TEXT,
    "vaultAddress" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "chainName" TEXT NOT NULL,
    "protocol" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "balanceRaw" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL,
    "amountUsdc" DECIMAL(20,6) NOT NULL,
    "sourceTxHash" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VaultHolding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "externalSessionId" TEXT,
    "agentDid" TEXT NOT NULL,
    "maxAmountPerTxUsdc" DECIMAL(20,6) NOT NULL,
    "maxTotalAmountUsdc" DECIMAL(20,6) NOT NULL,
    "usedAmountUsdc" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "ttlSeconds" INTEGER NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttributionRecord" (
    "id" TEXT NOT NULL,
    "agentDid" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "outcomeHash" TEXT NOT NULL,
    "valueDelta" DECIMAL(20,6) NOT NULL,
    "epochId" INTEGER NOT NULL,
    "blockNumber" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttributionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Epoch" (
    "id" INTEGER NOT NULL,
    "startBlock" BIGINT,
    "endBlock" BIGINT,
    "totalRewardsKite" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Epoch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpendingWindow" (
    "id" TEXT NOT NULL,
    "agentDid" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "totalSpentUsdc" DECIMAL(20,6) NOT NULL,
    "capUsdc" DECIMAL(20,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpendingWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoutMarketplace" (
    "id" TEXT NOT NULL,
    "did" TEXT NOT NULL,
    "didHashHex" TEXT NOT NULL DEFAULT '',
    "ownerAddress" TEXT NOT NULL,
    "vaultAddress" TEXT NOT NULL DEFAULT '',
    "bondAmountWei" TEXT NOT NULL DEFAULT '0',
    "chainId" INTEGER NOT NULL DEFAULT 2368,
    "registrationTxHash" TEXT,
    "status" TEXT NOT NULL,
    "stakeUsdc" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "reputationScore" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoutMarketplace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoutPurchase" (
    "id" TEXT NOT NULL,
    "scoutMarketplaceId" TEXT NOT NULL,
    "buyerWallet" TEXT NOT NULL,
    "amountWei" TEXT NOT NULL,
    "paymentTxHash" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL DEFAULT 2368,
    "bindingSecretHash" TEXT NOT NULL,
    "bindingSecretLast4" TEXT NOT NULL DEFAULT '',
    "redisUrl" TEXT,
    "scoutSignalStreamKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoutPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoutRegisterNonce" (
    "nonce" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "deadlineUnix" INTEGER NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ScoutRegisterNonce_pkey" PRIMARY KEY ("nonce")
);

-- CreateTable
CREATE TABLE "ScoutPayout" (
    "id" TEXT NOT NULL,
    "scoutDid" TEXT NOT NULL,
    "epochId" INTEGER NOT NULL,
    "amountUsdc" DECIMAL(20,6) NOT NULL,
    "status" TEXT NOT NULL,
    "txHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoutPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "message" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_walletAddress_key" ON "User"("walletAddress");

-- CreateIndex
CREATE INDEX "Deposit_userId_idx" ON "Deposit"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_did_key" ON "Agent"("did");

-- CreateIndex
CREATE UNIQUE INDEX "RiskInstruction_signalId_key" ON "RiskInstruction"("signalId");

-- CreateIndex
CREATE INDEX "RiskInstruction_riskDid_idx" ON "RiskInstruction"("riskDid");

-- CreateIndex
CREATE INDEX "RiskInstruction_executorDid_idx" ON "RiskInstruction"("executorDid");

-- CreateIndex
CREATE UNIQUE INDEX "Execution_signalId_key" ON "Execution"("signalId");

-- CreateIndex
CREATE INDEX "WorkflowEvent_signalId_occurredAt_idx" ON "WorkflowEvent"("signalId", "occurredAt");

-- CreateIndex
CREATE INDEX "WorkflowEvent_agentDid_idx" ON "WorkflowEvent"("agentDid");

-- CreateIndex
CREATE INDEX "WorkflowEvent_txHash_idx" ON "WorkflowEvent"("txHash");

-- CreateIndex
CREATE INDEX "WorkflowEvent_paymentTxHash_idx" ON "WorkflowEvent"("paymentTxHash");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowEvent_stream_streamEventId_key" ON "WorkflowEvent"("stream", "streamEventId");

-- CreateIndex
CREATE INDEX "AgentDeliberation_signalId_agentType_idx" ON "AgentDeliberation"("signalId", "agentType");

-- CreateIndex
CREATE UNIQUE INDEX "X402Payment_txHash_key" ON "X402Payment"("txHash");

-- CreateIndex
CREATE INDEX "X402Payment_signalId_idx" ON "X402Payment"("signalId");

-- CreateIndex
CREATE INDEX "X402Payment_fromDid_idx" ON "X402Payment"("fromDid");

-- CreateIndex
CREATE INDEX "X402Payment_toDid_idx" ON "X402Payment"("toDid");

-- CreateIndex
CREATE UNIQUE INDEX "RelayerMessage_messageId_key" ON "RelayerMessage"("messageId");

-- CreateIndex
CREATE INDEX "RelayerMessage_signalId_idx" ON "RelayerMessage"("signalId");

-- CreateIndex
CREATE INDEX "RelayerMessage_dispatchTxHash_idx" ON "RelayerMessage"("dispatchTxHash");

-- CreateIndex
CREATE INDEX "RelayerMessage_deliveryTxHash_idx" ON "RelayerMessage"("deliveryTxHash");

-- CreateIndex
CREATE INDEX "Position_userId_idx" ON "Position"("userId");

-- CreateIndex
CREATE INDEX "VaultHolding_ownerWallet_idx" ON "VaultHolding"("ownerWallet");

-- CreateIndex
CREATE INDEX "VaultHolding_userId_idx" ON "VaultHolding"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VaultHolding_ownerWallet_vaultAddress_chainId_protocol_toke_key" ON "VaultHolding"("ownerWallet", "vaultAddress", "chainId", "protocol", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Session_externalSessionId_key" ON "Session"("externalSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "ScoutMarketplace_did_key" ON "ScoutMarketplace"("did");

-- CreateIndex
CREATE INDEX "ScoutMarketplace_ownerAddress_idx" ON "ScoutMarketplace"("ownerAddress");

-- CreateIndex
CREATE UNIQUE INDEX "ScoutPurchase_paymentTxHash_key" ON "ScoutPurchase"("paymentTxHash");

-- CreateIndex
CREATE INDEX "ScoutPurchase_scoutMarketplaceId_idx" ON "ScoutPurchase"("scoutMarketplaceId");

-- CreateIndex
CREATE INDEX "ScoutPurchase_buyerWallet_idx" ON "ScoutPurchase"("buyerWallet");

-- CreateIndex
CREATE UNIQUE INDEX "ScoutPurchase_scoutMarketplaceId_buyerWallet_key" ON "ScoutPurchase"("scoutMarketplaceId", "buyerWallet");

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signal" ADD CONSTRAINT "Signal_scoutDid_fkey" FOREIGN KEY ("scoutDid") REFERENCES "Agent"("did") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskInstruction" ADD CONSTRAINT "RiskInstruction_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "Signal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Execution" ADD CONSTRAINT "Execution_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "Signal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowEvent" ADD CONSTRAINT "WorkflowEvent_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "Signal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "X402Payment" ADD CONSTRAINT "X402Payment_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "Signal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelayerMessage" ADD CONSTRAINT "RelayerMessage_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "Signal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoutPurchase" ADD CONSTRAINT "ScoutPurchase_scoutMarketplaceId_fkey" FOREIGN KEY ("scoutMarketplaceId") REFERENCES "ScoutMarketplace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
