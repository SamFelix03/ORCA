"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTd, DataTh, DataThead } from "@/components/ui/data-table";
import { TxLink } from "@/components/ui/tx-link";
import { useOrcaResource } from "./use-orca-resource";
import { orcaApi } from "@/lib/api";
import { formatTokenAmountRaw, formatTokenNumber } from "@/lib/format-chain";
import { primaryPrivyWalletAddress } from "@/lib/privy-user";
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
  const { authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const walletAddress = primaryPrivyWalletAddress(user, wallets);

  const scouts = useOrcaResource(() => orcaApi.scouts(), []);
  const payouts = useOrcaResource(() => orcaApi.scoutPayouts(), []);
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

  const loading = scouts.loading || payouts.loading;
  const ownerAddress = walletAddress ? getAddress(walletAddress) : null;

  async function requireWalletContext() {
    if (!authenticated || !ownerAddress) {
      throw new Error("Sign in with Privy to use your embedded wallet for marketplace transactions.");
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
      setNotice(`Sending ${formatTokenAmountRaw(quote.amountWei, 18)} PIEUSD to listing owner...`);
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setBindBusy(false);
    }
  }

  const totalPending = useMemo(
    () => (payouts.data?.payouts ?? []).filter((item) => item.status === "pending").reduce((acc, item) => acc + item.amountUsdc, 0),
    [payouts.data],
  );

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-[rgb(var(--danger-11))]">{error}</p> : null}
      {notice ? <p className="rounded border border-black/10 bg-[#fffdf8] px-3 py-2 text-sm text-[#5c564c]">{notice}</p> : null}
      <Card>
        <CardHeader>
          <CardTitle>Bring Your Own Scout</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-[#5c564c]">
            EIP-712 attest → approve stake token → call registry → API confirms the receipt. Uses your Privy wallet (same
            as the header) for signing and on-chain transactions.
          </p>
          {!authenticated || !ownerAddress ? (
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
          <Button type="button" onClick={registerOnChain} disabled={busy || !ownerAddress}>
            {busy ? "Working..." : "Register on-chain"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bind purchase to your deployment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-[#5c564c]">
            After you buy, paste the purchase id and binding secret, then the Redis URL your Risk agent uses (same instance as <span className="font-mono">REDIS_URL</span>
            ). Optionally override the scout stream key (default <span className="font-mono">orca:signals:scout</span>).
          </p>
          <input
            className="w-full rounded border border-black/15 bg-[#fffaf0] px-2 py-1 font-mono text-sm"
            value={bindPurchaseId}
            onChange={(e) => setBindPurchaseId(e.target.value)}
            placeholder="purchaseId (cid)"
          />
          <input
            className="w-full rounded border border-black/15 bg-[#fffaf0] px-2 py-1 font-mono text-sm"
            value={bindSecret}
            onChange={(e) => setBindSecret(e.target.value)}
            placeholder="binding secret (hex)"
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
          <Button type="button" onClick={submitBinding} disabled={bindBusy || busy || !ownerAddress}>
            {bindBusy ? "Saving..." : "Save binding"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Registered Scouts</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <p>Loading...</p> : null}
          <DataTable>
            <DataThead>
              <tr>
                <DataTh>DID</DataTh>
                <DataTh>Status</DataTh>
                <DataTh>Stake (USDC)</DataTh>
                <DataTh>Reputation</DataTh>
                <DataTh>Registration tx</DataTh>
                <DataTh>Buy</DataTh>
              </tr>
            </DataThead>
            <tbody>
              {(scouts.data?.scouts ?? []).map((scout) => (
                <tr key={scout.id}>
                  <DataTd className="font-mono text-xs">{scout.did}</DataTd>
                  <DataTd>{scout.status}</DataTd>
                  <DataTd>{scout.stakeUsdc}</DataTd>
                  <DataTd>{scout.reputationScore}</DataTd>
                  <DataTd className="max-w-[140px] truncate font-mono text-xs">
                    {scout.registrationTxHash ? <TxLink txHash={scout.registrationTxHash} chainId={scout.chainId ?? 2368} /> : "-"}
                  </DataTd>
                  <DataTd>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy || buyingId !== null || !ownerAddress}
                      onClick={() => buyScoutAccess(scout.id, scout.did)}
                    >
                      {buyingId === scout.id ? "Buying..." : "Buy (1 PIEUSD)"}
                    </Button>
                  </DataTd>
                </tr>
              ))}
            </tbody>
          </DataTable>
          {lastPurchase ? (
            <div className="mt-4 space-y-1 rounded border border-black/10 bg-[#fffaf0] p-3 text-sm">
              <p className="font-medium">Latest purchase</p>
              <p className="break-all font-mono text-xs">purchaseId: {lastPurchase.purchaseId}</p>
              <p className="break-all font-mono text-xs">bindingSecret: {lastPurchase.bindingSecret}</p>
              <p className="text-xs text-[#5c564c]">Copy these now; the API will not show the secret again.</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payout Ledger (Pending Total: {totalPending.toFixed(2)} USDC)</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable>
            <DataThead>
              <tr>
                <DataTh>Scout DID</DataTh>
                <DataTh>Epoch</DataTh>
                <DataTh>Amount</DataTh>
                <DataTh>Status</DataTh>
              </tr>
            </DataThead>
            <tbody>
              {(payouts.data?.payouts ?? []).map((payout) => (
                <tr key={payout.id}>
                  <DataTd className="font-mono text-xs">{payout.scoutDid}</DataTd>
                  <DataTd>{payout.epochId}</DataTd>
                  <DataTd>{formatTokenNumber(payout.amountUsdc, 6)} USDC</DataTd>
                  <DataTd>{payout.status}</DataTd>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </CardContent>
      </Card>
    </div>
  );
}
