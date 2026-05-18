import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { applyApiConfigDefaults } from "./api-config.js";

/** Load `api/.env` when running via `tsx`/`node` (Prisma CLI loads `.env` itself; the API process does not). */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(apiRoot, ".env") });
applyApiConfigDefaults(apiRoot);
