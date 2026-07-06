import "dotenv/config";
import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ZodError } from "zod";
import { ArmError } from "./armClient.js";
import { createAuthRouter } from "./authRoutes.js";
import { createApiRouter } from "./routes.js";

const app = express();
const port = Number(process.env.PORT ?? process.env.WEBSITES_PORT ?? 3000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, "../client");

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "healthy", timestamp: new Date().toISOString() });
});

app.get("/config.js", (_req, res) => {
  const config = {
    authMode: "azure-cli"
  };

  res.type("application/javascript").send(`window.__APP_CONFIG__ = ${JSON.stringify(config)};`);
});

app.use("/api/auth", createAuthRouter());
app.use("/api", createApiRouter());
app.use(express.static(clientDist));
app.get("*", (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "ValidationError",
        message: "Request validation failed.",
        details: error.flatten()
      }
    });
    return;
  }

  if (error instanceof ArmError) {
    res.status(error.status).json({
      error: {
        code: "ArmRequestFailed",
        message: error.message,
        details: error.details
      }
    });
    return;
  }

  console.error(error);
  res.status(500).json({
    error: {
      code: "InternalServerError",
      message: "Unexpected server error."
    }
  });
};

app.use(errorHandler);

app.listen(port, "0.0.0.0", () => {
  console.log(`MCA SaaS Hub portal listening on ${port}`);
});
