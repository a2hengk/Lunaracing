import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { pgUrl } from "./url";

export const db = drizzle(pgUrl(process.env.DATABASE_URL)!, { schema });
