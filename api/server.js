require("dotenv").config();

const express = require("express");
const { Pool } = require("pg");
const client = require("prom-client");

// Collect default Node.js metrics (CPU, memory, event loop, etc.)
client.collectDefaultMetrics();

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
  port: 5432,
});

// Main route
app.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.send(`Hello from API 🚀 Time: ${result.rows[0].now}`);
  } catch (err) {
    console.error("Database query failed:", err.message);
    res.status(500).send("Database error");
  }
});

// Prometheus metrics endpoint
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

// Healthcheck endpoint (lightweight, no DB call)
app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`API is running on port ${PORT}`);
});

// Graceful shutdown: close connections properly on SIGTERM/SIGINT
const shutdown = async (signal) => {
  console.log(`${signal} received. Shutting down gracefully...`);
  server.close(async () => {
    await pool.end();
    console.log("Database pool closed. Exiting.");
    process.exit(0);
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
