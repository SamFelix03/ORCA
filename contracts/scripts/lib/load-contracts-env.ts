import path from "node:path";
import dotenv from "dotenv";
import { applyContractsConfigDefaults, contractsDir } from "./orca-contracts-config.js";

/** Load `contracts/.env`, then apply unset keys from `config/orca.contracts.json`. */
export function loadContractsEnv(): void {
  const root = contractsDir();
  dotenv.config({ path: path.join(root, ".env") });
  applyContractsConfigDefaults(root);
}
