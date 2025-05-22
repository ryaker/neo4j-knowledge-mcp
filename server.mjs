// server.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Import the SDK using require
const sdk = require('@modelcontextprotocol/sdk');

// Re-export as ESM
export const Server = sdk.Server;
export const StdioServerTransport = sdk.StdioServerTransport;
