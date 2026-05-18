"use client";

import type { ScoutMarketplaceRecord } from "@orca/shared";
import type { ReactNode } from "react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useCurrentWallet } from "@/components/auth/current-wallet";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TxLink } from "@/components/ui/tx-link";
import { useOrcaResource } from "./use-orca-resource";
import { orcaApi } from "@/lib/api";
import { formatPieUsdPaymentAmountRaw } from "@/lib/format-chain";
import {
  bondWeiFromUsdc,
  computeDidHashHex,
  encodeErc20Approve,
  encodeErc20Transfer,
  readErc20Allowance,
  sendEvmTransaction,
  signScoutRegistrationTypedData,
  waitForTxReceipt,
} from "@/lib/scout-registration";
import { ensureWalletOnChain, resolveEthereumProvider } from "@/lib/wallet-provider";
import { getAddress } from "ethers";

export function MarketplacePage() {
  const { authenticated, isDemoMode, walletAddress, wallets } = useCurrentWallet();

  const scouts = useOrcaResource(() => orcaApi.scouts(), []);
  const [did, setDid] = useState("did:kite:orca/scout-1");
  const [vault, setVault] = useState("0x1bcdcf2acc93d01F7F66010BE7B5a647A7cfC40f");
  const [stakeUsdc, setStakeUsdc] = useState(100);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [lastPurchase, setLastPurchase] = useState<{
    marketplaceId: string;
    scoutDid: string;
    purchaseId: string;
    bindingSecret: string;
  } | null>(null);
  const [bindPurchaseId, setBindPurchaseId] = useState("");
  const [bindSecret, setBindSecret] = useState("");
  const [bindRedisUrl, setBindRedisUrl] = useState("");
  const [bindStreamKey, setBindStreamKey] = useState("");
  const [bindBusy, setBindBusy] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [selectedScout, setSelectedScout] = useState<ScoutMarketplaceRecord | null>(null);
  const [bindingOpen, setBindingOpen] = useState(false);

  const loading = scouts.loading;
  const ownerAddress = walletAddress ? getAddress(walletAddress) : null;

  async function requireWalletContext() {
    if (!authenticated || !ownerAddress) {
      throw new Error("Sign in with Privy to use your embedded wallet for marketplace transactions.");
    }
    if (isDemoMode) {
      throw new Error("Demo mode can browse marketplace data, but on-chain marketplace transactions require a connected wallet.");
    }
    const eth = await resolveEthereumProvider(wallets, ownerAddress);
    return { eth, ownerAddress };
  }

  async function registerOnChain() {
    setError(null);
    setNotice(null);
    if (!vault.trim()) {
      setError("Enter a vault contract address.");
      return;
    }
    setBusy(true);
    try {
      const { eth, ownerAddress: owner } = await requireWalletContext();
      const challenge = await orcaApi.scoutRegisterChallenge(did.trim());
      await ensureWalletOnChain(eth, challenge.domain.chainId);
      const didHashHex = challenge.didHashHex ?? computeDidHashHex(did);
      const bondWei = bondWeiFromUsdc(stakeUsdc, challenge.stakeDecimals);

      const signature = await signScoutRegistrationTypedData(eth, owner, challenge, {
        did: did.trim(),
        didHashHex,
        vault: vault.trim(),
        bondAmountWei: bondWei,
      });

      const attestBody = {
        domainName: challenge.domain.name,
        chainId: challenge.domain.chainId,
        registryAddress: challenge.registryAddress,
        stakeDecimals: challenge.stakeDecimals,
        did: did.trim(),
        vault: vault.trim(),
        bondAmountWei: bondWei.toString(),
        ownerAddress: owner,
        nonce: challenge.nonce,
        deadline: String(challenge.deadline),
        signature,
        messageDidHash: didHashHex,
      };

      const { scout } = await orcaApi.scoutRegisterAttest(attestBody);

      const allowance = await readErc20Allowance(eth, challenge.stakeTokenAddress, owner, challenge.registryAddress);
      if (allowance < bondWei) {
        setNotice("Approving stake token spend for ORCARegistry...");
        const approveData = encodeErc20Approve(challenge.registryAddress, bondWei);
        const approveHash = await sendEvmTransaction(eth, {
          from: owner,
          to: challenge.stakeTokenAddress,
          data: approveData,
        });
        const approveRc = await waitForTxReceipt(eth, approveHash);
        if (approveRc.status !== "0x1") {
          throw new Error("Stake token approval transaction failed.");
        }
      }

      setNotice("Submitting registerPermissionlessScout on-chain...");
      const txPayload = await orcaApi.scoutRegisterTxData(scout.id);
      const regHash = await sendEvmTransaction(eth, {
        from: owner,
        to: txPayload.to,
        data: txPayload.data,
      });
      const regRc = await waitForTxReceipt(eth, regHash);
      if (regRc.status !== "0x1") {
        throw new Error("Registry registration transaction failed.");
      }

      await orcaApi.scoutRegisterConfirm({ marketplaceId: scout.id, txHash: regHash });
      setNotice(`Registered. Confirm recorded for tx ${regHash}`);
      await scouts.reload();
      setRegisterOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function buyScoutAccess(marketplaceId: string, scoutDid: string) {
    setError(null);
    setNotice(null);
    setBuyingId(marketplaceId);
    try {
      const { eth, ownerAddress: owner } = await requireWalletContext();
      const quote = await orcaApi.scoutPurchaseQuote(marketplaceId);
      await ensureWalletOnChain(eth, quote.chainId);
      const amount = BigInt(quote.amountWei);
      const transferData = encodeErc20Transfer(quote.recipient, amount);
      setNotice(`Sending ${formatPieUsdPaymentAmountRaw(quote.amountWei)} PIEUSD to listing owner...`);
      const txHash = await sendEvmTransaction(eth, {
        from: owner,
        to: quote.token,
        data: transferData,
      });
      const rc = await waitForTxReceipt(eth, txHash);
      if (rc.status !== "0x1") {
        throw new Error("PIEUSD transfer failed.");
      }
      const { purchaseId, bindingSecret } = await orcaApi.scoutPurchaseConfirm(marketplaceId, {
        buyerWallet: owner,
        txHash,
      });
      setLastPurchase({ marketplaceId, scoutDid, purchaseId, bindingSecret });
      setBindPurchaseId(purchaseId);
      setBindSecret(bindingSecret);
      setBindingOpen(false);
      setNotice(
        `Purchase confirmed. Share the binding secret only with the scout creator. Set RISK_SCOUT_DID_ALLOWLIST=${scoutDid} on your Risk agent.`,
      );
      await scouts.reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setBuyingId(null);
    }
  }

  async function submitBinding() {
    setError(null);
    setNotice(null);
    if (!bindPurchaseId.trim() || !bindSecret.trim() || !bindRedisUrl.trim()) {
      setError("purchaseId, binding secret, and redisUrl are required.");
      return;
    }
    setBindBusy(true);
    try {
      const { ownerAddress: owner } = await requireWalletContext();
      await orcaApi.scoutPurchaseBinding(bindPurchaseId.trim(), {
        buyerWallet: owner,
        redisUrl: bindRedisUrl.trim(),
        scoutSignalStreamKey: bindStreamKey.trim() || undefined,
        bindingSecret: bindSecret.trim(),
      });
      setNotice("Binding saved. The creator's Scout can now read this Redis URL from the API.");
      setBindingOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setBindBusy(false);
    }
  }

  function openScout(scout: ScoutMarketplaceRecord) {
    setSelectedScout(scout);
    setBindingOpen(false);
    setError(null);
    setNotice(null);
    if (lastPurchase?.marketplaceId === scout.id) {
      setBindPurchaseId(lastPurchase.purchaseId);
      setBindSecret(lastPurchase.bindingSecret);
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-black">Agent Marketplace</h2>
          <p className="mt-1 text-sm text-[#5c564c]">Available scout agents ready for delegated signal discovery.</p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setError(null);
            setNotice(null);
            setRegisterOpen(true);
          }}
        >
          Register your scout
        </Button>
      </header>

      {loading ? <p className="text-sm text-[#5c564c]">Loading scouts...</p> : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(scouts.data?.scouts ?? []).map((scout) => (
          <button
            key={scout.id}
            type="button"
            className="flex min-h-40 flex-col justify-between rounded border border-black/10 bg-[#fffaf0] p-4 text-left transition-colors hover:bg-[#fffdf8]"
            onClick={() => openScout(scout)}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-black">{scout.did}</p>
            </div>
            <div className="mt-4 text-xs">
              <div>
                <p className="text-[#5c564c]">Stake</p>
                <p className="mt-1 font-semibold text-black">{scout.stakeUsdc} USDC</p>
              </div>
            </div>
          </button>
        ))}
      </section>

      {!loading && (scouts.data?.scouts.length ?? 0) === 0 ? (
        <Card>
          <CardContent>
            <p className="text-sm text-[#5c564c]">No scouts are listed in the marketplace yet.</p>
          </CardContent>
        </Card>
      ) : null}

      {registerOpen ? (
        <MarketplaceModal title="Register Your Scout" onClose={() => setRegisterOpen(false)}>
          <div className="space-y-3">
            {error ? <p className="rounded border border-[rgb(var(--danger-6))] bg-[rgb(var(--danger-2))] px-3 py-2 text-sm text-[rgb(var(--danger-12))]">{error}</p> : null}
            {notice ? <p className="rounded border border-black/10 bg-[#fffdf8] px-3 py-2 text-sm text-[#5c564c]">{notice}</p> : null}
            {isDemoMode ? (
              <p className="text-sm text-[rgb(var(--warning-11))]">Demo mode is read-only for on-chain scout registration.</p>
            ) : !authenticated || !ownerAddress ? (
              <p className="text-sm text-[rgb(var(--warning-11))]">Sign in to register a scout with your Privy wallet.</p>
            ) : (
              <p className="font-mono text-xs text-[#5c564c]">Privy wallet: {ownerAddress}</p>
            )}
            <input className="w-full rounded border border-black/15 bg-[#fffaf0] px-2 py-1" value={did} onChange={(e) => setDid(e.target.value)} placeholder="Scout DID" />
            <input className="w-full rounded border border-black/15 bg-[#fffaf0] px-2 py-1 font-mono text-sm" value={vault} onChange={(e) => setVault(e.target.value)} placeholder="Vault address (0x...)" />
            <input
              className="w-full rounded border border-black/15 bg-[#fffaf0] px-2 py-1"
              type="number"
              value={stakeUsdc}
              onChange={(e) => setStakeUsdc(Number(e.target.value))}
              placeholder="Stake (USDC units)"
            />
            <Button type="button" onClick={registerOnChain} disabled={busy || isDemoMode || !ownerAddress}>
              {busy ? "Working..." : "Register on-chain"}
            </Button>
          </div>
        </MarketplaceModal>
      ) : null}

      {selectedScout ? (
        <MarketplaceModal title="Scout Agent" onClose={() => setSelectedScout(null)}>
          <div className="space-y-4">
            {error ? <p className="rounded border border-[rgb(var(--danger-6))] bg-[rgb(var(--danger-2))] px-3 py-2 text-sm text-[rgb(var(--danger-12))]">{error}</p> : null}
            {notice ? <p className="rounded border border-black/10 bg-[#fffdf8] px-3 py-2 text-sm text-[#5c564c]">{notice}</p> : null}
            <div className="rounded border border-black/10 bg-[#fffdf8] p-3">
              <p className="break-all font-mono text-sm font-semibold text-black">{selectedScout.did}</p>
              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-[#5c564c]">Stake</p>
                  <p className="mt-1 font-semibold text-black">{selectedScout.stakeUsdc} USDC</p>
                </div>
              </div>
              {selectedScout.registrationTxHash ? (
                <div className="mt-3 text-xs">
                  <TxLink txHash={selectedScout.registrationTxHash} chainId={selectedScout.chainId ?? 2368} />
                </div>
              ) : null}
            </div>

            {lastPurchase?.marketplaceId === selectedScout.id ? (
              <div className="space-y-3 rounded border border-black/10 bg-[#fffdf8] p-3">
                <p className="text-sm font-semibold text-black">Purchase complete</p>
                <p className="break-all font-mono text-xs text-[#5c564c]">purchaseId: {lastPurchase.purchaseId}</p>
                <p className="break-all font-mono text-xs text-[#5c564c]">bindingSecret: {lastPurchase.bindingSecret}</p>
                <Button type="button" variant="secondary" onClick={() => setBindingOpen(true)}>
                  Complete binding
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                disabled={busy || isDemoMode || buyingId !== null || !ownerAddress}
                onClick={() => buyScoutAccess(selectedScout.id, selectedScout.did)}
              >
                {buyingId === selectedScout.id ? "Buying..." : "Buy for 1 pieUSD"}
              </Button>
            )}

            {bindingOpen ? (
              <div className="space-y-3 rounded border border-black/10 bg-[#fffdf8] p-3">
                <p className="text-sm font-semibold text-black">Complete binding</p>
                <input
                  className="w-full rounded border border-black/15 bg-[#fffaf0] px-2 py-1 font-mono text-sm"
                  value={bindPurchaseId}
                  onChange={(e) => setBindPurchaseId(e.target.value)}
                  placeholder="purchaseId"
                />
                <input
                  className="w-full rounded border border-black/15 bg-[#fffaf0] px-2 py-1 font-mono text-sm"
                  value={bindSecret}
                  onChange={(e) => setBindSecret(e.target.value)}
                  placeholder="binding secret"
                  type="password"
                  autoComplete="off"
                />
                <input
                  className="w-full rounded border border-black/15 bg-[#fffaf0] px-2 py-1 font-mono text-sm"
                  value={bindRedisUrl}
                  onChange={(e) => setBindRedisUrl(e.target.value)}
                  placeholder="redis://... or rediss://..."
                />
                <input
                  className="w-full rounded border border-black/15 bg-[#fffaf0] px-2 py-1 font-mono text-sm"
                  value={bindStreamKey}
                  onChange={(e) => setBindStreamKey(e.target.value)}
                  placeholder="scout signal stream key (optional)"
                />
                <Button type="button" onClick={submitBinding} disabled={bindBusy || busy || isDemoMode || !ownerAddress}>
                  {bindBusy ? "Saving..." : "Save binding"}
                </Button>
              </div>
            ) : null}
          </div>
        </MarketplaceModal>
      ) : null}
    </div>
  );
}

function MarketplaceModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close modal" onClick={onClose} />
      <section className="relative z-10 max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded border border-black/15 bg-[#fffaf0] text-black shadow-2xl">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-black/10 bg-[#fffaf0] p-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          <Button type="button" size="sm" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </header>
        <div className="p-4">{children}</div>
      </section>
    </div>,
    document.body,
  );
}
