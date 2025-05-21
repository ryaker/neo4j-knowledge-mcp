// inspector-compatible.js
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import cors from "cors";
import neo4j from "neo4j-driver";
import config from "./config.js";

// Initialize Neo4j driver
const driver = neo4j.driver(
  config.NEO4J_URI,
  neo4j.auth.basic(config.NEO4J_USERNAME, config.NEO4J_PASSWORD),
  {
    encrypted: true,
    trust: 'TRUST_SYSTEM_CA_SIGNED_CERTIFICATES',
    maxConnectionPoolSize: 50,
    connectionAcquisitionTimeout: 10000
  }
);

// Import your server logic
import serverLogic from "./server-logic.js";

// Set up Express app
const app = express();
app.use(cors());
app.use(express.json());

// Create transports map for session management
const transports = {};

// Set up SSE route for server-to-client communication
app.get('/events', async (req, res) => {
  console.log('SSE connection request received');
  
  // Get or create session ID
  const sessionId = req.query.sessionId || require('crypto').randomUUID();
  
  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  
  res.write(`data: ${JSON.stringify({ type: 'connected', sessionId })}\n\n`);
  
  // Create a new SSE transport for this session
  const transport = new SSEServerTransport(sessionId, res);
  transports[sessionId] = transport;
  
  // Set up a new server for this connection
  const server = new Server(
    { name: "neo4j-knowledge-graph", version: "1.0.0" },
    { capabilities: serverLogic.getCapabilities() }
  );
  
  // Set up request handlers
  serverLogic.setupRequestHandlers(server, driver);
  
  // Connect the server to this transport
  await server.connect(transport);
  console.log(`Server connected to transport for session ${sessionId}`);
  
  // Handle client disconnect
  req.on('close', () => {
    console.log(`Client disconnected for session ${sessionId}`);
    delete transports[sessionId];
  });
});

// Handle client-to-server messages
app.post('/message', async (req, res) => {
  const sessionId = req.query.sessionId;
  console.log(`Received message for sessionId ${sessionId}`);
  
  if (!sessionId || !transports[sessionId]) {
    console.error(`No transport found for session ${sessionId}`);
    return res.status(400).json({ error: 'Invalid or missing session ID' });
  }
  
  try {
    const transport = transports[sessionId];
    await transport.handlePostMessage(req, res);
  } catch (error) {
    console.error(`Error in /message route:`, error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
          data: { details: error.message }
        },
        id: null
      });
    }
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[INFO] Neo4j Knowledge Graph MCP Server running on port ${PORT}`);
  console.log(`[INFO] SSE endpoint available at http://localhost:${PORT}/events`);
  console.log(`[INFO] Message endpoint available at http://localhost:${PORT}/message`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log("[INFO] Shutting down server...");
  await driver.close();
  process.exit(0);
});
