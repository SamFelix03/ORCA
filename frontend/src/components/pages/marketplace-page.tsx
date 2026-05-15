"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTd, DataTh, DataThead } from "@/components/ui/data-table";
import { useOrcaResource } from "./use-orca-resource";
import { orcaApi } from "@/lib/api";
import {
  bondWeiFromUsdc,
  computeDidHashHex,
  encodeErc20Approve,
  getInjectedEthereum,
  readErc20Allowance,
  sendEvmTransaction,
  signScoutRegistrationTypedData,
  waitForTxReceipt,
} from "@/lib/scout-registration";
import { getAddress } from "ethers";

export function MarketplacePage() {
  const scouts = useOrcaResource(() => orcaApi.scouts(), []);
  const payouts = useOrcaResource(() => orcaApi.scoutPayouts(), []);
  const [did, setDid] = useState("did:kite:orca/scout-external-demo");
  const [vault, setVault] = useState("");
  const [stakeUsdc, setStakeUsdc] = useState(100);
  const [account, setAccount] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loading = scouts.loading || payouts.loading;

  async function connectWallet() {
    setError(null);
    setNotice(null);
    const eth = getInjectedEthereum();
    if (!eth) {
      setError("No injected wallet found (install MetaMask or similar).");
      return;
    }
    const accounts = (await eth.request({ method: "eth_requestAccounts", params: [] })) as string[];
    const addr = accounts[0];
    setAccount(addr ? getAddress(addr) : null);
    setNotice(addr ? `Connected ${getAddress(addr)}` : null);
  }

  async function registerOnChain() {
    setError(null);
    setNotice(null);
    const eth = getInjectedEthereum();
    if (!eth) {
      setError("No injected wallet found.");
      return;
    }
    if (!account) {
      setError("Connect a wallet first.");
      return;
    }
    if (!vault.trim()) {
      setError("Enter a vault contract address.");
      return;
    }
    setBusy(true);
    try {
      const challenge = await orcaApi.scoutRegisterChallenge(did.trim());
      const didHashHex = challenge.didHashHex ?? computeDidHashHex(did);
      const bondWei = bondWeiFromUsdc(stakeUsdc, challenge.stakeDecimals);

      const signature = await signScoutRegistrationTypedData(eth, account, challenge, {
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
        ownerAddress: account,
        nonce: challenge.nonce,
        deadline: String(challenge.deadline),
        signature,
        messageDidHash: didHashHex,
      };

      const { scout } = await orcaApi.scoutRegisterAttest(attestBody);

      const allowance = await readErc20Allowance(eth, challenge.stakeTokenAddress, account, challenge.registryAddress);
      if (allowance < bondWei) {
        setNotice("Approving stake token spend for ORCARegistry…");
        const approveData = encodeErc20Approve(challenge.registryAddress, bondWei);
        const approveHash = await sendEvmTransaction(eth, {
          from: account,
          to: challenge.stakeTokenAddress,
          data: approveData,
        });
        const approveRc = await waitForTxReceipt(eth, approveHash);
        if (approveRc.status !== "0x1") {
          throw new Error("Stake token approval transaction failed.");
        }
      }

      setNotice("Submitting registerPermissionlessScout on-chain…");
      const txPayload = await orcaApi.scoutRegisterTxData(scout.id);
      const regHash = await sendEvmTransaction(eth, {
        from: account,
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

  const totalPending = useMemo(
    () => (payouts.data?.payouts ?? []).filter((item) => item.status === "pending").reduce((acc, item) => acc + item.amountUsdc, 0),
    [payouts.data],
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Bring Your Own Scout</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-[rgb(var(--primary-11))]">
            EIP-712 attest → approve stake token → call registry → API confirms the receipt. Use the Kite testnet account that matches your DID owner.
          </p>
          <input className="w-full rounded border px-2 py-1" value={did} onChange={(e) => setDid(e.target.value)} placeholder="Scout DID" />
          <input className="w-full rounded border px-2 py-1 font-mono text-sm" value={vault} onChange={(e) => setVault(e.target.value)} placeholder="Vault address (0x…)" />
          <input
            className="w-full rounded border px-2 py-1"
            type="number"
            value={stakeUsdc}
            onChange={(e) => setStakeUsdc(Number(e.target.value))}
            placeholder="Stake (USDC units)"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={connectWallet} disabled={busy}>
              Connect wallet
            </Button>
            <Button type="button" onClick={registerOnChain} disabled={busy}>
              {busy ? "Working…" : "Register on-chain"}
            </Button>
          </div>
          {account ? <p className="font-mono text-xs text-[rgb(var(--primary-11))]">Connected: {account}</p> : null}
          {notice ? <p className="text-sm text-[rgb(var(--primary-11))]">{notice}</p> : null}
          {error ? <p className="text-sm text-[rgb(var(--danger-11))]">{error}</p> : null}
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
              </tr>
            </DataThead>
            <tbody>
              {(scouts.data?.scouts ?? []).map((scout) => (
                <tr key={scout.id}>
                  <DataTd className="font-mono text-xs">{scout.did}</DataTd>
                  <DataTd>{scout.status}</DataTd>
                  <DataTd>{scout.stakeUsdc}</DataTd>
                  <DataTd>{scout.reputationScore}</DataTd>
                  <DataTd className="max-w-[140px] truncate font-mono text-xs">{scout.registrationTxHash ?? "—"}</DataTd>
                </tr>
              ))}
            </tbody>
          </DataTable>
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
                  <DataTd>{payout.amountUsdc}</DataTd>
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
