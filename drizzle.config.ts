import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// `vercel env pull` schreibt nach .env.local, von Hand angelegt ist es oft .env
config({ path: [".env.local", ".env"], quiet: true });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL! },
});
