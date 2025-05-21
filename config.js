// config.js
export default {
  // Neo4j AuraDB connection settings
  NEO4J_URI: process.env.NEO4J_URI || 'neo4j+s://41425db4.databases.neo4j.io',
  NEO4J_USERNAME: process.env.NEO4J_USERNAME || 'neo4j',
  NEO4J_PASSWORD: process.env.NEO4J_PASSWORD || 'r6W5H2uXUB1chLC_lZ9rv4UAdCEVmbSnTsPGxb1hqzI',
  
  // Knowledge processing settings
  DEFAULT_CONFIDENCE: 0.8,
  MAX_SEARCH_RESULTS: 100,
  MAX_EXPLORATION_DEPTH: 5,
  
  // Integration settings
  SUPPORTED_MCP_SOURCES: [
    'grok-assistant',
    'gemini-assistant', 
    'openai-assistant',
    'anthropic-assistant',
    'youtube-analysis',
    'outlook-assistant',
    'mongodb-custom'
  ],
  
  // Vector embedding settings (for future implementation)
  EMBEDDING_DIMENSION: 1536,
  SIMILARITY_THRESHOLD: 0.7
};