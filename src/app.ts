import express from "express";
import cors from "cors";
import path from "path";
import { apiRouter } from "./routes/api.js";
import { seedDemoCatalog } from "./store/memory.js";

const app = express();
app.use(cors());
app.use(express.json());

seedDemoCatalog();

app.use("/api", apiRouter);
app.use(express.static(path.join(process.cwd(), "public")));

app.get("/.well-known/agent.json", (_req, res) => {
  res.json({
    name: "Agent Deal",
    description: "Agent-to-agent negotiation marketplace on Stellar 8004",
    version: "0.1.0",
  });
});

export default app;
