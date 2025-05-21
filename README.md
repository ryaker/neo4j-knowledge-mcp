# Neo4j Knowledge Graph MCP Server

A sophisticated Model Context Protocol (MCP) server that provides advanced knowledge management capabilities using Neo4j as the graph database backend. This implementation extends the official Neo4j MCP Server with specialized features for knowledge organization, gap analysis, and multi-source integration.

## Overview

This implementation creates a comprehensive knowledge management system designed to work seamlessly with MCP-enabled AI assistants (Claude, Grok, Gemini, OpenAI, etc.). The system stores, organizes, and retrieves knowledge in a structured graph format, enabling powerful knowledge discovery and relationship analysis.

## Architecture Components

### 1. Neo4j Knowledge Graph MCP Server

The core server interfaces with Neo4j to provide knowledge storage and retrieval capabilities to MCP clients like Claude Desktop.

### 2. Knowledge Integration Pipeline

A system that processes outputs from other MCP servers and structures them for storage in the Neo4j graph.

### 3. Semantic Search Capabilities

Advanced querying capabilities that combine Cypher queries with text matching and (future) vector similarity search.

## Features

- **Rich Knowledge Schema**: Store concepts, facts, sources, and their relationships in a structured graph
- **Multi-source Integration**: Combine knowledge from different AI assistants and sources
- **Knowledge Gap Analysis**: Identify missing connections and areas for research
- **Path Finding**: Discover relationships between concepts
- **Interactive Exploration**: Explore the knowledge graph from specific starting points
- **Document Knowledge Integration**: Extract and store knowledge from processed documents

## Getting Started

### Prerequisites

- Node.js (v14+)
- Neo4j (v4.4+) or Neo4j AuraDB account

### Installation

1. Clone the repository:
```bash
git clone https://github.com/your-username/neo4j-knowledge-mcp.git
cd neo4j-knowledge-mcp
```

2. Install dependencies:
```bash
npm install
```

3. Configure the server by creating a `.env` file:
```
NEO4J_URI=neo4j+s://your-instance.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your-password
```

4. Set up the database schema:
```bash
npm run setup-db
```

5. Start the server:
```bash
npm start
```

### Claude Desktop Configuration

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "neo4j-knowledge": {
      "command": "node",
      "args": [
        "/path/to/neo4j-knowledge-mcp/index.js"
      ],
      "env": {
        "NEO4J_URI": "neo4j+s://your-auradb-instance.databases.neo4j.io",
        "NEO4J_USERNAME": "neo4j", 
        "NEO4J_PASSWORD": "your-auradb-password"
      }
    }
  }
}
```

## Usage Examples

### Basic Knowledge Storage

```
store-knowledge with source="manual-entry", content="Cash value life insurance can be used as collateral for loans without triggering taxable events", contentType="fact", metadata={"confidence": 0.9, "domain": "financial-planning"}
```

### Processing MCP Outputs

```
process-mcp-output with mcpSource="grok-assistant", rawOutput="[Grok search results about infinite banking concept]", processingInstructions="Extract key concepts about infinite banking and cash flow strategies"
```

### Semantic Knowledge Search

```
search-knowledge with query="tax advantages of permanent life insurance", searchType="hybrid", maxResults=10
```

### Exploring Knowledge Relationships

```
explore-knowledge-graph with startConcept="Cash Value Life Insurance", maxDepth=3, visualize=true
```

### Finding Knowledge Connections

```
find-knowledge-paths with conceptA="Infinite Banking", conceptB="Tax Planning", maxPathLength=4
```

### Analyzing Knowledge Gaps

```
analyze-knowledge-gaps with domain="Financial Planning", analysisType="missing-connections", threshold=0.8
```

## Knowledge Graph Schema

### Core Node Types

- **Concept**: Fundamental ideas or entities
- **Fact**: Specific factual statements
- **Source**: Origin of knowledge
- **Person**: Individuals mentioned in knowledge
- **Domain**: Knowledge domains
- **AIProcessing**: Tracking which AI systems processed content

### Relationship Types

- **IS_A**, **RELATED_TO**, **PART_OF**, **ENABLES**, **REQUIRES** (Concept relationships)
- **ABOUT**, **CONTRADICTS**, **SUPPORTS** (Fact relationships)
- **DERIVED_FROM**, **CITED_FROM**, **PROCESSED_BY** (Source relationships)
- **BELONGS_TO**, **SUBDOMAIN_OF** (Domain relationships)
- **PRECEDED_BY**, **SUPERSEDED_BY** (Temporal relationships)

## Integration with Official Neo4j MCP Server

This implementation extends the official Neo4j MCP Server with additional capabilities:

1. **Enhanced Schema**: More sophisticated node and relationship types
2. **Advanced Analysis Tools**: Gap analysis, path finding, etc.
3. **Multi-source Integration**: Process and integrate outputs from various MCP servers

## Future Enhancements

1. **Vector Embeddings**: Add semantic similarity search using OpenAI embeddings or similar
2. **Knowledge Versioning**: Track how knowledge evolves over time
3. **Expert Validation**: Add systems for expert review and validation of knowledge claims
4. **Visual Interface**: Build a web interface for interactive knowledge exploration
5. **Advanced Analytics**: Add graph algorithms for centrality analysis, community detection, etc.
6. **Real-time Sync**: Automatically process and store knowledge as it's generated by other MCP servers

## License

MIT

## Acknowledgements

- Based on and extends the [official Neo4j MCP server](https://github.com/neo4j-contrib/mcp-neo4j)
- Utilizes the [MCP SDK](https://modelcontextprotocol.io/) for communication with AI assistants