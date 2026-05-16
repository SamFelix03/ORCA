/**
 * Update orca-collateral.manifest.json + agents/config/orca-stub-protocols.json from deployments/*.spoke.json
 *
 *   pnpm sync:spoke-config
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const REPO = path.resolve(ROOT, "..");

type Spoke = {
  chainId: number;
  contracts: {
    RemoteAdapter: string;
    OrcaAaveV3StubVault: string;
    OrcaCompoundV3StubVault: string;
    OrcaMorphoBlueStubVault: string;
    OrcaUniswapV3StubVault: string;
  };
};

function main(): void {
  const manifestPath = path.join(ROOT, "config", "orca-collateral.manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
    remoteAdapterByChainId: Record<string, string>;
    orcaOAppKite2368: string;
  };

  const stubsPath = path.join(REPO, "agents", "config", "orca-stub-protocols.json");
  const stubs = JSON.parse(fs.readFileSync(stubsPath, "utf8")) as {
    description: string;
    stubsByChainId: Record<string, Record<string, string>>;
  };

  const remotes: string[] = [];
  const dir = path.join(ROOT, "deployments");
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".spoke.json")) continue;
    const spoke = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) as Spoke;
    const cid = String(spoke.chainId);
    manifest.remoteAdapterByChainId[cid] = spoke.contracts.RemoteAdapter;
    remotes.push(`${cid}:${spoke.contracts.RemoteAdapter}`);
    stubs.stubsByChainId[cid] = {
      "aave-v3": spoke.contracts.OrcaAaveV3StubVault,
      "compound-v3": spoke.contracts.OrcaCompoundV3StubVault,
      morpho: spoke.contracts.OrcaMorphoBlueStubVault,
      "uniswap-v3": spoke.contracts.OrcaUniswapV3StubVault,
    };
  }

  stubs.description = `ORCAOApp: ${manifest.orcaOAppKite2368}. HYP_TRUSTED_REMOTES=${remotes.join(",")}`;

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  fs.writeFileSync(stubsPath, JSON.stringify(stubs, null, 2) + "\n");
  // eslint-disable-next-line no-console -- CLI
  console.log("Updated", manifestPath, "and", stubsPath);
  // eslint-disable-next-line no-console -- CLI
  console.log("HYP_TRUSTED_REMOTES=" + remotes.join(","));
}

main();
