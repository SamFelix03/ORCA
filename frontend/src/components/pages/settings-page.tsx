"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function SettingsPage() {
  const [collateralFloor, setCollateralFloor] = useState("1.15");
  const [maxRebalancePercent, setMaxRebalancePercent] = useState("25");
  const [dailyCap, setDailyCap] = useState("5000");
  const [notice, setNotice] = useState<string | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("Settings staged. Next step: submit as multisig-governed configuration proposal.");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Risk Settings</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 max-w-2xl" onSubmit={onSubmit}>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[rgb(var(--primary-11))]">Collateral Floor</span>
            <input
              className="rounded-xl border border-[rgb(var(--neutral-6))] bg-[rgb(var(--neutral-1))] px-3 py-2"
              value={collateralFloor}
              onChange={(event) => setCollateralFloor(event.target.value)}
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[rgb(var(--primary-11))]">Max Single Rebalance (%)</span>
            <input
              className="rounded-xl border border-[rgb(var(--neutral-6))] bg-[rgb(var(--neutral-1))] px-3 py-2"
              value={maxRebalancePercent}
              onChange={(event) => setMaxRebalancePercent(event.target.value)}
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[rgb(var(--primary-11))]">Daily Budget Cap (USDC)</span>
            <input
              className="rounded-xl border border-[rgb(var(--neutral-6))] bg-[rgb(var(--neutral-1))] px-3 py-2"
              value={dailyCap}
              onChange={(event) => setDailyCap(event.target.value)}
            />
          </label>

          <div>
            <Button type="submit">Stage Governance Update</Button>
          </div>

          {notice ? (
            <p className="rounded-xl border border-[rgb(var(--success-6))] bg-[rgb(var(--success-2))] px-3 py-2 text-sm text-[rgb(var(--success-12))]">
              {notice}
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
