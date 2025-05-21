#!/usr/bin/env python3
from mcp import Server, StdioServerTransport
from neo4j import GraphDatabase
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Neo4j configuration
NEO4J_URI = os.getenv('NEO4J_URI', 'neo4j://localhost:7687')
NEO4J_USERNAME = os.getenv('NEO4J_USERNAME', 'neo4j')
NEO4J_PASSWORD = os.getenv('NEO4J_PASSWORD', '')

# Initialize Neo4j driver
driver = GraphDatabase.driver(
    NEO4J_URI,
    auth=(NEO4J_USERNAME, NEO4J_PASSWORD),
    max_connection_pool_size=50,
    connection_acquisition_timeout=10000
)

# Create Server instance
server = Server(
    name="neo4j-knowledge-graph",
    version="1.0.0",
    capabilities={
        "tools": {
            "store-knowledge": {},
            "search-knowledge": {},
            "explore-knowledge-graph": {},
            "process-mcp-output": {},
            "find-knowledge-paths": {},
            "analyze-knowledge-gaps": {},
            "about": {}
        }
    }
)

@server.tool("store-knowledge")
async def store_knowledge(source: str, content: str, content_type: str, metadata: dict = None, relationships: list = None):
    """Store knowledge in the Neo4j graph database."""
    with driver.session() as session:
        # Create the knowledge node
        result = session.run(
            """
            CREATE (k:Knowledge {
                source: $source,
                content: $content,
                contentType: $content_type,
                metadata: $metadata,
                timestamp: datetime()
            })
            RETURN k
            """,
            source=source,
            content=content,
            content_type=content_type,
            metadata=metadata or {}
        )
        knowledge = result.single()["k"]

        # Create relationships if provided
        if relationships:
            for rel in relationships:
                session.run(
                    """
                    MATCH (k:Knowledge) WHERE id(k) = $kid
                    MATCH (t:Knowledge) WHERE id(t) = $tid
                    CREATE (k)-[r:RELATES_TO {type: $type}]->(t)
                    """,
                    kid=knowledge.id,
                    tid=rel["targetNode"],
                    type=rel["relationshipType"]
                )

        return {
            "success": True,
            "id": knowledge.id,
            "message": "Knowledge stored successfully"
        }

@server.tool("search-knowledge")
async def search_knowledge(query: str, search_type: str = "hybrid"):
    """Search the knowledge graph using various search strategies."""
    with driver.session() as session:
        if search_type == "exact":
            result = session.run(
                """
                MATCH (k:Knowledge)
                WHERE k.content CONTAINS $query
                RETURN k
                ORDER BY k.timestamp DESC
                LIMIT 10
                """,
                query=query
            )
        else:  # hybrid search
            result = session.run(
                """
                MATCH (k:Knowledge)
                WHERE apoc.text.fuzzyMatch(k.content, $query) > 0.5
                RETURN k, apoc.text.fuzzyMatch(k.content, $query) as score
                ORDER BY score DESC
                LIMIT 10
                """,
                query=query
            )

        knowledge_items = []
        for record in result:
            k = record["k"]
            knowledge_items.append({
                "id": k.id,
                "content": k.get("content"),
                "contentType": k.get("contentType"),
                "source": k.get("source"),
                "score": record.get("score", 1.0) if "score" in record else 1.0
            })

        return {
            "success": True,
            "results": knowledge_items
        }

@server.tool("about")
async def about():
    """Get information about the Neo4j Knowledge Graph MCP server."""
    return {
        "name": "Neo4j Knowledge Graph MCP",
        "description": """
This MCP server provides a knowledge management system built on Neo4j.
Key features:
• Store and organize knowledge from multiple AI systems
• Perform semantic and graph-based knowledge search
• Explore knowledge relationships interactively
• Process outputs from other MCP servers
• Identify knowledge gaps for targeted research
• Find connection paths between concepts

The system maintains a rich graph of concepts, facts, sources, and their relationships,
enabling powerful knowledge discovery and analysis capabilities.
        """,
        "neo4j_connection": NEO4J_URI
    }

if __name__ == "__main__":
    # Connect and start server
    print(f"[INFO] Connecting to Neo4j at {NEO4J_URI}")
    
    try:
        # Test Neo4j connection
        with driver.session() as session:
            session.run("RETURN 1")
        print("[INFO] Successfully connected to Neo4j")
        
        # Start the server
        transport = StdioServerTransport()
        server.connect(transport)
        print("[INFO] Neo4j Knowledge Graph MCP Server running")
        
    except Exception as e:
        print(f"[ERROR] Failed to start server: {str(e)}")
        driver.close()
        exit(1)
