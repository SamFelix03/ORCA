"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTd, DataTh, DataThead } from "@/components/ui/data-table";
import { StatusPill } from "@/components/ui/status-pill";
import { orcaApi } from "@/lib/api";
import { useOrcaResource } from "./use-orca-resource";

export function SessionsPage() {
  const { data, loading, error, reload } = useOrcaResource(() => orcaApi.sessions(), []);
  const [busySession, setBusySession] = useState<string | null>(null);

  async function approve(id: string) {
    setBusySession(id);
    try {
      await orcaApi.approveSession(id);
      await reload();
    } finally {
      setBusySession(null);
    }
  }

  async function expire(id: string) {
    setBusySession(id);
    try {
      await orcaApi.expireSession(id);
      await reload();
    } finally {
      setBusySession(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Passport Sessions</CardTitle>
        <p className="text-sm text-[rgb(var(--primary-11))]">Approve and revoke delegated spending windows.</p>
      </CardHeader>
      <CardContent>
        {loading ? <p className="text-sm text-[rgb(var(--primary-11))]">Loading sessions...</p> : null}
        {error ? <p className="text-sm text-[rgb(var(--danger-11))]">{error}</p> : null}

        {!loading && !error ? (
          <DataTable>
            <DataThead>
              <tr>
                <DataTh>Session ID</DataTh>
                <DataTh>Agent DID</DataTh>
                <DataTh>Budget</DataTh>
                <DataTh>Used</DataTh>
                <DataTh>Status</DataTh>
                <DataTh>Action</DataTh>
              </tr>
            </DataThead>
            <tbody>
              {(data?.sessions ?? []).map((session) => (
                <tr key={session.id}>
                  <DataTd className="font-mono text-xs">{session.id}</DataTd>
                  <DataTd className="font-mono text-xs">{session.agentDid}</DataTd>
                  <DataTd>{session.maxTotalAmountUsdc}</DataTd>
                  <DataTd>{session.usedAmountUsdc}</DataTd>
                  <DataTd>
                    <StatusPill
                      tone={
                        session.status === "active"
                          ? "healthy"
                          : session.status === "pending"
                          ? "warning"
                          : session.status === "expired"
                          ? "muted"
                          : "critical"
                      }
                    >
                      {session.status}
                    </StatusPill>
                  </DataTd>
                  <DataTd>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => approve(session.id)}
                        disabled={busySession === session.id || session.status === "active"}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => expire(session.id)}
                        disabled={busySession === session.id || session.status === "expired"}
                      >
                        Expire
                      </Button>
                    </div>
                  </DataTd>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ) : null}
      </CardContent>
    </Card>
  );
}
