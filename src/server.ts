import dns from "node:dns";
import app from "./app";
import { connectDB } from "./config/db";
import { env } from "./config/env";

dns.setDefaultResultOrder("ipv4first");

async function main(): Promise<void> {
  await connectDB();

  app.listen(env.port, () => {
    console.log(`Server running at http://localhost:${env.port}`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
