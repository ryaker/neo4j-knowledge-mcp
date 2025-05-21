// index.js
// Import the MCP SDK using ES modules
// Import the MCP SDK using the correct pattern
import { Server } from '@modelcontextprotocol/sdk/server/index';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio';
import neo4j from 'neo4j-driver';
import config from './config.js';

// Import knowledge management modules
import KnowledgeStorage from './knowledge/storage.js';
import KnowledgeRetrieval from './knowledge/retrieval.js';
import McpExtractor from './extractors/mcp-extractor.js';
import { setupSchema } from './schemas/schema-setup.js';

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

// Initialize knowledge management services
const knowledgeStorage = new KnowledgeStorage(driver);
const knowledgeRetrieval = new KnowledgeRetrieval(driver);
const mcpExtractor = new McpExtractor(driver);

// Define available tools
const TOOLS = [
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
    name: "explore-knowledge-graph",
    description: "Interactively explore the knowledge graph from a starting concept",
    inputSchema: {
      type: "object",
      properties: {
        startConcept: {
          type: "string",
          description: "Starting concept for graph exploration"
        },
        relationshipTypes: {
          type: "array",
          items: { type: "string" },
          description: "Types of relationships to follow"
        },
        maxDepth: {
          type: "integer",
          description: "Maximum traversal depth",
          default: 3
        },
        visualize: {
          type: "boolean", 
          description: "Whether to generate visualization data",
          default: false
        }
      },
      required: ["startConcept"]
    }
  },
  {
    name: "find-knowledge-paths",
    description: "Find connection paths between concepts in the knowledge graph",
    inputSchema: {
      type: "object", 
      properties: {
        conceptA: {
          type: "string",
          description: "First concept node"
        },
        conceptB: {
          type: "string",
          description: "Second concept node"
        },
        maxPathLength: {
          type: "integer",
          description: "Maximum path length to search",
          default: 5
        },
        relationshipConstraints: {
          type: "array",
          items: { type: "string" },
          description: "Relationship types to include/exclude"
        }
      },
      required: ["conceptA", "conceptB"]
    }
  },
  {
    name: "process-mcp-output",
    description: "Process outputs from other MCP servers into the knowledge graph",
    inputSchema: {
      type: "object",
      properties: {
        mcpSource: {
          type: "string",
          description: "Source MCP server identifier"
        },
        rawOutput: {
          type: "string",
          description: "Raw output from the MCP server"
        },
        processingInstructions: {
          type: "string",
          description: "Instructions for knowledge extraction"
        },
        linkingStrategy: {
          type: "string",
          enum: ["automatic", "manual", "hybrid"],
          description: "Strategy for linking to existing knowledge"
        }
      },
      required: ["mcpSource", "rawOutput"]
    }
  },
  {
    name: "analyze-knowledge-gaps",
    description: "Identify gaps in the knowledge graph for targeted research",
    inputSchema: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          description: "Knowledge domain to analyze"
        },
        analysisType: {
          type: "string",
          enum: ["missing-connections", "weak-areas", "outdated-content"],
          description: "Type of gap analysis to perform"
        },
        threshold: {
          type: "number",
          description: "Confidence or connection strength threshold",
          default: 0.7
        }
      },
      required: ["domain", "analysisType"]
    }
  },
  {
    name: "store-document-knowledge", 
    description: "Extract and store knowledge from documents processed by other MCP servers",
    inputSchema: {
      type: "object",
      properties: {
        documentId: {
          type: "string",
          description: "Unique identifier for the document"
        },
        extractedContent: {
          type: "string",
          description: "Knowledge extracted by AI analysis"
        },
        sourceMetadata: {
          type: "object",
          description: "Information about the source document"
        },
        processingChain: {
          type: "array",
          description: "Record of which AI models processed the content",
          items: {
            type: "string"
          }
        }
      },
      required: ["documentId", "extractedContent"]
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
];

// Initialize server
const server = new Server(
  { name: "neo4j-knowledge-graph", version: "1.0.0" },
  { 
    capabilities: { 
      tools: TOOLS.reduce((acc, tool) => {
        acc[tool.name] = {};
        return acc;
      }, {})
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
          tools: TOOLS.reduce((acc, tool) => {
            acc[tool.name] = {};
            return acc;
          }, {})
        },
        serverInfo: { name: "neo4j-knowledge-graph", version: "1.0.0" }
      };
    }
    
    if (method === "tools/list") {
      return {
        tools: TOOLS.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
        }))
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
        case "explore-knowledge-graph":
          return await handleExploreGraph(args);
        case "process-mcp-output":
          return await handleProcessMcpOutput(args);
        case "find-knowledge-paths":
          return await handleFindPaths(args);
        case "analyze-knowledge-gaps":
          return await handleAnalyzeGaps(args);
        case "store-document-knowledge":
          return await handleStoreDocumentKnowledge(args);
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
   ${result.relatedConcepts && result.relatedConcepts.length > 0 ? `Related: ${result.relatedConcepts.slice(0, 3).map(c => c.content).join(', ')}` : ''}
`).join('\n')}

${result.includeContext && searchResults.length > 0 ? `\nTo explore relationships, use: explore-knowledge-graph with startConcept="${searchResults[0].id}"` : ''}`
      }
    ]
  };
}

/**
 * Handle the explore-knowledge-graph tool
 * @param {Object} args - Tool arguments
 * @returns {Promise<Object>} - Tool response
 */
async function handleExploreGraph(args) {
  const result = await knowledgeRetrieval.exploreKnowledgeGraph(args);
  
  if (!result.success) {
    return {
      error: { 
        code: -32603, 
        message: "Failed to explore knowledge graph", 
        data: { details: result.error } 
      }
    };
  }
  
  const data = result.explorationData;
  
  // Generate text response
  let responseText = `Knowledge Graph Exploration

Starting Concept: ${data.startNode.name || data.startNode.content}
Max Depth: ${args.maxDepth || 3}
Found ${data.connectedNodes.length} connected concepts

Exploration Results:`;

  // Add connected nodes (limit to 20 to avoid too long responses)
  responseText += data.connectedNodes
    .slice(0, 20)
    .map((node, index) => `
${index + 1}. [Depth ${node.depth}] ${node.content.substring(0, 150)}${node.content.length > 150 ? '...' : ''}
   Type: ${node.type}
   Source: ${node.source || 'Unknown'}
   ${node.relationships && node.relationships.length > 0 ? `Relationships: ${node.relationships.join(', ')}` : ''}`)
    .join('\n');
  
  // Add relationship summary
  responseText += '\n\nRelationship Summary:';
  const relationshipSummary = data.relationshipSummary;
  responseText += Object.entries(relationshipSummary)
    .map(([type, count]) => `\n• ${type}: ${count} connections`)
    .join('');
  
  // Add visualization if requested
  if (args.visualize && data.visualization) {
    responseText += `\n\nDOT Graph Representation:\n\`\`\`\n${data.visualization}\n\`\`\``;
  }
  
  responseText += `\n\nUse find-knowledge-paths to explore specific connections between concepts.`;
  
  return {
    content: [
      {
        type: "text",
        text: responseText
      }
    ]
  };
}

/**
 * Handle the process-mcp-output tool
 * @param {Object} args - Tool arguments
 * @returns {Promise<Object>} - Tool response
 */
async function handleProcessMcpOutput(args) {
  const result = await mcpExtractor.processOutput(args);
  
  if (!result.success) {
    return {
      error: { 
        code: -32603, 
        message: "Failed to process MCP output", 
        data: { details: result.error } 
      }
    };
  }
  
  const extractionResults = result.extractionResults;
  
  return {
    content: [
      {
        type: "text",
        text: `MCP Output Processing Complete

Source: ${args.mcpSource}
Processing Strategy: ${args.linkingStrategy || 'automatic'}

Extracted Knowledge:
• Concepts: ${extractionResults.concepts.length} (${extractionResults.concepts.slice(0, 5).map(c => c.name).join(', ')}${extractionResults.concepts.length > 5 ? '...' : ''})
• Facts: ${extractionResults.facts.length} statements
• Processing Method: ${extractionResults.processingMethod || 'heuristic extraction'}

The processed knowledge has been integrated into the graph database and is now searchable and explorable.

Next Steps:
• Use search-knowledge to query the newly processed information
• Use explore-knowledge-graph to discover relationships
• Process additional MCP outputs to build knowledge density`
      }
    ]
  };
}

/**
 * Handle the find-knowledge-paths tool
 * @param {Object} args - Tool arguments
 * @returns {Promise<Object>} - Tool response
 */
async function handleFindPaths(args) {
  const result = await knowledgeRetrieval.findKnowledgePaths(args);
  
  if (!result.success) {
    return {
      error: { 
        code: -32603, 
        message: "Failed to find knowledge paths", 
        data: { details: result.error } 
      }
    };
  }
  
  if (!result.found) {
    return {
      content: [
        {
          type: "text",
          text: `No paths found between "${args.conceptA}" and "${args.conceptB}" within ${args.maxPathLength || 5} steps.

Try:
• Increasing maxPathLength
• Using broader concept terms
• Checking if both concepts exist in the knowledge graph`
        }
      ]
    };
  }
  
  const paths = result.paths;
  
  // Generate text response
  let responseText = `Knowledge Paths Found

From: ${args.conceptA}
To: ${args.conceptB}
Max Path Length: ${args.maxPathLength || 5}

Found ${paths.length} path(s):`;

  // Format each path
  for (const path of paths) {
    responseText += `\n\nPath ${path.index} (${path.length} steps, ${path.nodes.length} nodes):`;
    
    // Format path segments
    for (const segment of path.segments) {
      responseText += `\n  ${segment.source.name || segment.source.id} --[${segment.relationship}]--> ${segment.target.name || segment.target.id}`;
    }
  }
  
  responseText += `\n\nShortest path has ${result.shortestPathLength} steps.

Use explore-knowledge-graph to examine nodes along these paths in detail.`;
  
  return {
    content: [
      {
        type: "text",
        text: responseText
      }
    ]
  };
}

/**
 * Handle the analyze-knowledge-gaps tool
 * @param {Object} args - Tool arguments
 * @returns {Promise<Object>} - Tool response
 */
async function handleAnalyzeGaps(args) {
  const result = await knowledgeRetrieval.analyzeKnowledgeGaps(args);
  
  if (!result.success) {
    return {
      error: { 
        code: -32603, 
        message: "Failed to analyze knowledge gaps", 
        data: { details: result.error } 
      }
    };
  }
  
  let analysisText = '';
  
  switch (args.analysisType) {
    case "missing-connections":
      analysisText = `Missing Connections Analysis for "${args.domain}"

Found ${result.results.length} potential connections:

${result.results.map((item, index) => {
  return `${index + 1}. Similarity: ${(item.similarity * 100).toFixed(1)}%
   A: ${item.concept1}
   B: ${item.concept2}`;
}).join('\n\n')}

These concepts appear related but lack explicit connections in the knowledge graph.`;
      break;
      
    case "weak-areas":
      analysisText = `Weak Areas Analysis for "${args.domain}"

Found ${result.results.length} weakly connected concepts:

${result.results.map((item, index) => {
  return `${index + 1}. ${item.concept}
   Connections: ${item.connectionCount}
   Confidence: ${(item.confidence * 100).toFixed(1)}%`;
}).join('\n\n')}

These concepts need more connections or validation to strengthen the knowledge graph.`;
      break;
      
    case "outdated-content":
      analysisText = `Outdated Content Analysis for "${args.domain}"

Found ${result.results.length} potentially outdated concepts:

${result.results.map((item, index) => {
  return `${index + 1}. ${item.concept}
   Source: ${item.source || 'Unknown'}
   Days since update: ${item.daysSinceUpdate}
   Confidence: ${(item.confidence * 100).toFixed(1)}%`;
}).join('\n\n')}

These concepts haven't been updated recently and may need verification.`;
      break;
  }
  
  return {
    content: [
      {
        type: "text",
        text: `Knowledge Gap Analysis

Domain: ${args.domain}
Analysis Type: ${args.analysisType}
Threshold: ${args.threshold || 0.7}

${analysisText}

Recommendations:
• Research the identified gaps with targeted queries
• Use other MCP servers to gather current information  
• Update outdated content with fresh sources
• Create explicit relationships between related concepts`
      }
    ]
  };
}

/**
 * Handle the store-document-knowledge tool
 * @param {Object} args - Tool arguments
 * @returns {Promise<Object>} - Tool response
 */
async function handleStoreDocumentKnowledge(args) {
  const { documentId, extractedContent, sourceMetadata = {}, processingChain = [] } = args;
  
  try {
    // 1. Create source record for the document
    const sourceResult = await knowledgeStorage.storeSource({
      title: sourceMetadata.title || `Document ${documentId}`,
      url: sourceMetadata.url || `doc://${documentId}`,
      sourceType: sourceMetadata.type || 'document',
      author: sourceMetadata.author,
      publicationDate: sourceMetadata.date,
      reliability: sourceMetadata.reliability || 0.8,
      metadata: {
        document_id: documentId,
        content_type: sourceMetadata.contentType,
        processing_chain: processingChain,
        content_preview: extractedContent.substring(0, 200) + (extractedContent.length > 200 ? '...' : ''),
        ...sourceMetadata
      }
    });
    
    if (!sourceResult.success) {
      throw new Error(`Failed to create source record: ${sourceResult.error}`);
    }
    
    // 2. Process the extracted content (similar to MCP output processing)
    const processingResult = await mcpExtractor.processOutput({
      mcpSource: processingChain[0] || 'document-processor',
      rawOutput: extractedContent,
      processingInstructions: 'Extract knowledge from document content',
      linkingStrategy: 'automatic'
    });
    
    if (!processingResult.success) {
      throw new Error(`Failed to process document content: ${processingResult.error}`);
    }
    
    const extractionResults = processingResult.extractionResults;
    
    // 3. Link all extracted entities to the document source
    for (const concept of extractionResults.concepts) {
      await knowledgeStorage.createRelationship({
        sourceId: concept.id,
        targetId: sourceResult.id,
        type: 'DERIVED_FROM'
      });
    }
    
    for (const fact of extractionResults.facts) {
      await knowledgeStorage.createRelationship({
        sourceId: fact.id,
        targetId: sourceResult.id,
        type: 'CITED_FROM'
      });
    }
    
    return {
      content: [
        {
          type: "text",
          text: `Document Knowledge Processing Complete

Document ID: ${documentId}
Source: ${sourceResult.title}
Processing Chain: ${processingChain.join(' → ') || 'Direct processing'}

Extracted Knowledge:
• Concepts: ${extractionResults.concepts.length} (${extractionResults.concepts.slice(0, 5).map(c => c.name).join(', ')}${extractionResults.concepts.length > 5 ? '...' : ''})
• Facts: ${extractionResults.facts.length} statements

The document knowledge has been integrated into the graph database and is now searchable and explorable.

Next Steps:
• Use search-knowledge to query document information
• Use explore-knowledge-graph to discover relationships
• Process additional documents to build knowledge density`
        }
      ]
    };
  } catch (error) {
    return {
      error: { 
        code: -32603, 
        message: "Failed to store document knowledge", 
        data: { details: error.message } 
      }
    };
  }
}

// Connect and start server
const transport = new StdioServerTransport();
// Log connection parameters (with sanitized password)
console.error(`[INFO] Connecting to Neo4j at ${config.NEO4J_URI} with user ${config.NEO4J_USERNAME}`);

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