import { startServer } from "./src/server/mcp";

startServer().catch((error) => {
  console.error("intent-scheduler MCP failed:", error);
  process.exit(1);
});
