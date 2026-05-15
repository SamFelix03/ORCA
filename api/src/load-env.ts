import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

/** Load `api/.env` when running via `tsx`/`node` (Prisma CLI loads `.env` itself; the API process does not). */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });
