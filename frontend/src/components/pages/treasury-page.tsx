"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { orcaApi } from "@/lib/api";
import { formatTokenAmountRaw, formatTokenNumber } from "@/lib/format-chain";
import { useOrcaResource } from "./use-orca-resource";

export function TreasuryPage() {
  const { data, loading, error } = useOrcaResource(() => orcaApi.treasury(), []);

  return (
    <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>On-chain Treasury</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {loading ? <p className="text-[#5c564c]">Loading treasury...</p> : null}
          {error ? <p className="text-[rgb(var(--danger-11))]">{error}</p> : null}

          {!loading && !error && data ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[#5c564c]">Address</span>
                <span className="font-mono text-xs">{data.treasury.address ? `${data.treasury.address.slice(0, 8)}...${data.treasury.address.slice(-6)}` : "--"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#5c564c]">Threshold</span>
                <Badge tone="info">{data.treasury.threshold}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#5c564c]">Native KITE</span>
                <span className="font-semibold">{formatTokenNumber(data.treasury.nativeBalance, 6)}</span>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Token Balances</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {!loading && !error && data?.treasury.tokenBalances.map((item) => (
            <div key={item.address} className="rounded border border-black/10 bg-[#fffaf0] p-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-black">{item.symbol}</span>
                <span>{formatTokenAmountRaw(item.raw, item.decimals)} {item.symbol}</span>
              </div>
              <p className="mt-2 break-all font-mono text-xs text-[#5c564c]">{item.address}</p>
            </div>
          ))}
          {!loading && !error && (data?.treasury.tokenBalances.length ?? 0) === 0 ? <p className="text-[#5c564c]">No configured token balances found.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
