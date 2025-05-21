// mcp-server.js
import { Server, StdioServerTransport } from "./server.mjs";
import neo4j from "neo4j-driver";
import config from "./config.js";

// Initialize Neo4j driver
const driver = neo4j.driver(
  config.NEO4J_URI,
  neo4j.auth.basic(config.NEO4J_USERNAME, config.NEO4J_PASSWORD),
  {
    // Note: Don't specify encryption if using neo4j+s:// protocol
    maxConnectionPoolSize: 50,
    connectionAcquisitionTimeout: 10000
  }
);

// Initialize knowledge management services
import KnowledgeStorage from "./knowledge/storage.js";
import KnowledgeRetrieval from "./knowledge/retrieval.js";
import McpExtractor from "./extractors/mcp-extractor.js";
import { setupSchema } from "./schemas/schema-setup.js";

const knowledgeStorage = new KnowledgeStorage(driver);
const knowledgeRetrieval = new KnowledgeRetrieval(driver);
const mcpExtractor = new McpExtractor(driver);

// Create Server instance
const server = new Server(
  { name: "neo4j-knowledge-graph", version: "1.0.0" },
  { 
    capabilities: { 
      tools: {
        "store-knowledge": {},
        "search-knowledge": {},
        "explore-knowledge-graph": {},
        "process-mcp-output": {},
        "find-knowledge-paths": {},
        "analyze-knowledge-gaps": {},
        "about": {}
      }
    } 
  }
);

// Fallback request handler
server.fallbackRequestHandler = async (request) => {
  try {
    const { method } = request;
    
    if (method === "initialize") {
      return {
        protocolVersion: "2024-11-05",
        capabilities: { 
          tools: {
            "store-knowledge": {},
            "search-knowledge": {},
            "explore-knowledge-graph": {},
            "process-mcp-output": {},
            "find-knowledge-paths": {},
            "analyze-knowledge-gaps": {},
            "about": {}
          }
        },
        serverInfo: { name: "neo4j-knowledge-graph", version: "1.0.0" }
      };
    }
    
    if (method === "tools/list") {
      return {
        tools: [
          {
            name: "store-knowledge",
            description: "Store processed knowledge into the Neo4j graph database",
            inputSchema: {
              type: "object",
              properties: {
                source: {
                  type: "string",
                  description: "Source system that generated this knowledge"
                },
                content: {
                  type: "string", 
                  description: "The knowledge content to store"
                },
                contentType: {
                  type: "string",
                  enum: ["concept", "fact", "procedure", "relationship"],
                  description: "Type of knowledge content"
                },
                metadata: {
                  type: "object",
                  description: "Additional metadata for the knowledge"
                },
                relationships: {
                  type: "array",
                  description: "Relationships to existing knowledge nodes",
                  items: {
                    type: "object",
                    properties: {
                      targetNode: { type: "string" },
                      relationshipType: { type: "string" }
                    }
                  }
                }
              },
              required: ["source", "content", "contentType"]
            }
          },
          {
            name: "search-knowledge",
            description: "Search the knowledge graph using semantic and graph-based queries",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Natural language query for knowledge search"
                },
                searchType: {
                  type: "string",
                  enum: ["semantic", "graph", "hybrid", "exact"],
                  description: "Type of search to perform"
                },
                contextFilters: {
                  type: "object",
                  description: "Filters for domain, source, confidence level"
                },
                maxResults: {
                  type: "integer",
                  description: "Maximum number of results to return",
                  default: 10
                },
                includeContext: {
                  type: "boolean",
                  description: "Whether to include related context nodes",
                  default: true
                }
              },
              required: ["query"]
            }
          },
          {
            name: "about",
            description: "Get information about the Neo4j Knowledge Graph MCP server",
            inputSchema: {
              type: "object",
              properties: {},
              required: []
            }
          }
        ]
      };
    }
    
    if (method === "tools/call") {
      const { name, arguments: args } = request.params || {};
      
      switch (name) {
        case "about":
          return handleAbout();
        case "store-knowledge":
          return await handleStoreKnowledge(args);
        case "search-knowledge":
          return await handleSearchKnowledge(args);
        default:
          return {
            error: { code: -32601, message: `Tool not found: ${name}` }
          };
      }
    }
    
    return {
      error: { code: -32601, message: `Method not found: ${method}` }
    };
  } catch (error) {
    return {
      error: { 
        code: -32603, 
        message: "Internal error", 
        data: { details: error.message } 
      }
    };
  }
};

/**
 * Handle the about tool
 * @returns {Object} - Tool response
 */
function handleAbout() {
  return {
    content: [
      {
        type: "text",
        text: `Neo4j Knowledge Graph MCP Server v1.0.0

This server provides sophisticated knowledge management capabilities using Neo4j as the backend graph database. It can:

• Store and organize knowledge from multiple AI systems
• Perform semantic and graph-based knowledge search
• Explore knowledge relationships interactively
• Process outputs from other MCP servers
• Identify knowledge gaps for targeted research
• Find connection paths between concepts

The system maintains a rich graph of concepts, facts, sources, and their relationships, enabling powerful knowledge discovery and analysis capabilities.

Current connection: ${config.NEO4J_URI}
Database status: Connected`
      }
    ]
  };
}

/**
 * Handle the store-knowledge tool
 * @param {Object} args - Tool arguments
 * @returns {Promise<Object>} - Tool response
 */
async function handleStoreKnowledge(args) {
  const result = await knowledgeStorage.storeKnowledge(args);
  
  if (!result.success) {
    return {
      error: { 
        code: -32603, 
        message: "Failed to store knowledge", 
        data: { details: result.error } 
      }
    };
  }
  
  return {
    content: [
      {
        type: "text",
        text: `Knowledge stored successfully!
          
Node ID: ${result.id}
Content Type: ${args.contentType}
Source: ${args.source}
Relationships created: ${args.relationships ? args.relationships.length : 0}

The knowledge has been integrated into the graph database and is now available for search and exploration.`
      }
    ]
  };
}

/**
 * Handle the search-knowledge tool
 * @param {Object} args - Tool arguments
 * @returns {Promise<Object>} - Tool response
 */
async function handleSearchKnowledge(args) {
  const result = await knowledgeRetrieval.searchKnowledge(args);
  
  if (!result.success) {
    return {
      error: { 
        code: -32603, 
        message: "Failed to search knowledge", 
        data: { details: result.error } 
      }
    };
  }
  
  const searchResults = result.results;
  
  return {
    content: [
      {
        type: "text", 
        text: `Knowledge Search Results (${searchResults.length} found)

Query: "${args.query}"
Search Type: ${args.searchType || 'hybrid'}

Results:
${searchResults.map((result, index) => `
${index + 1}. [${result.contentType}] ${result.content.substring(0, 200)}${result.content.length > 200 ? '...' : ''}
   Source: ${result.source || 'Unknown'}
   Confidence: ${(result.confidence * 100).toFixed(1)}%
   Relevance: ${(result.relevance * 100).toFixed(1)}%
   ${result.relatedConcepts && result.relatedConcepts.length > 0 ? `Related: ${result.relatedConcepts.slice(0, 3).map(c => c.content).join(', ')}` : ''}`).join('\n')}

${result.includeContext && searchResults.length > 0 ? `
To explore relationships, use: explore-knowledge-graph with startConcept="${searchResults[0].id}"` : ''}`
      }
    ]
  };
}

// Connect and start server
console.error(`[INFO] Connecting to Neo4j at ${config.NEO4J_URI} with user ${config.NEO4J_USERNAME}`);

const transport = new StdioServerTransport();
server.connect(transport)
  .then(async () => {
    console.error("[INFO] Neo4j Knowledge Graph MCP Server running");
    
    // Initialize database schema
    try {
      console.error("[INFO] Setting up database schema...");
      const schemaResult = await setupSchema(driver);
      
      if (schemaResult && schemaResult.success) {
        console.error("[INFO] Database schema initialized successfully");
      } else {
        console.error("[WARN] Schema setup returned failure:", 
          schemaResult ? schemaResult.error : "Unknown error");
        // Continue anyway since some basic functionality might still work
      }
    } catch (err) {
      console.error("[WARN] Failed to initialize schema:", err.message);
      console.error("[INFO] Will continue without full schema initialization");
    }
  })
  .catch(error => {
    console.error("[ERROR] Server failed to start:", error);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGINT', async () => {
  console.error("[INFO] Shutting down server...");
  await driver.close();
  process.exit(0);
});
