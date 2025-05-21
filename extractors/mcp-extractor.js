// extractors/mcp-extractor.js
import KnowledgeStorage from "../knowledge/storage.js";

/**
 * Processes outputs from other MCP servers and extracts knowledge
 */
class McpExtractor {
  /**
   * @param {neo4j.Driver} driver - Neo4j driver instance
   */
  constructor(driver) {
    this.driver = driver;
    this.storage = new KnowledgeStorage(driver);
  }

  /**
   * Process raw output from an MCP server
   * @param {Object} params - Processing parameters
   * @returns {Promise<Object>} - Extraction results
   */
  async processOutput(params) {
    const { 
      mcpSource, 
      rawOutput, 
      processingInstructions = '', 
      linkingStrategy = 'automatic' 
    } = params;
    
    try {
      // This is a simplified extractor - in a real implementation, this would
      // use more sophisticated NLP techniques or even call an LLM
      
      // Track extracted entities
      const extractionResults = {
        concepts: [],
        facts: [],
        processingMethod: 'heuristic'
      };
      
      // 1. Extract potential concepts (capitalized multi-word terms)
      const conceptRegex = /\b[A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*)*\b/g;
      const rawConcepts = rawOutput.match(conceptRegex) || [];
      
      // Filter and clean concepts
      const stopwords = ['The', 'A', 'An', 'This', 'That', 'These', 'Those', 'I', 'You', 'We', 'They'];
      const uniqueConcepts = [...new Set(rawConcepts)]
        .filter(concept => !stopwords.includes(concept) && concept.length > 3)
        .slice(0, 10);
      
      // Store extracted concepts
      for (const conceptName of uniqueConcepts) {
        const conceptResult = await this.storage.storeConcept({
          name: conceptName,
          description: `Concept extracted from ${mcpSource}`,
          source: mcpSource,
          confidence: 0.7,
          metadata: {
            extraction_method: 'mcp_processing',
            processing_instructions: processingInstructions
          }
        });
        
        if (conceptResult.success) {
          extractionResults.concepts.push({
            id: conceptResult.id,
            name: conceptName
          });
        }
      }
      
      // 2. Extract potential factual statements (sentences with pattern indicators)
      const factIndicators = [
        'is a', 'are', 'was', 'were', 'will be', 'can be', 'should be',
        'has', 'have', 'had', 'contains', 'includes', 'consists of',
        'enables', 'requires', 'supports', 'contradicts'
      ];
      
      const sentences = rawOutput.split(/[.!?]/)
        .map(s => s.trim())
        .filter(s => s.length > 20 && s.length < 200);
      
      const potentialFacts = sentences.filter(sentence => 
        factIndicators.some(indicator => 
          sentence.toLowerCase().includes(indicator)
        )
      ).slice(0, 5);
      
      // Store extracted facts
      for (const factStatement of potentialFacts) {
        const factResult = await this.storage.storeFact({
          statement: factStatement,
          source: mcpSource,
          confidence: 0.6,
          factType: 'extracted',
          metadata: {
            extraction_method: 'mcp_processing',
            processing_instructions: processingInstructions
          },
          // Try to link facts to extracted concepts
          concepts: extractionResults.concepts
            .filter(concept => factStatement.includes(concept.name))
            .map(concept => concept.id)
        });
        
        if (factResult.success) {
          extractionResults.facts.push({
            id: factResult.id,
            statement: factStatement.substring(0, 100) + (factStatement.length > 100 ? '...' : '')
          });
        }
      }
      
      // 3. Create source record for the MCP output
      const sourceResult = await this.storage.storeSource({
        title: `${mcpSource} Output`,
        url: `mcp://${mcpSource.toLowerCase().replace(/\s+/g, '-')}/${Date.now()}`,
        sourceType: 'mcp_processing',
        author: mcpSource,
        publicationDate: new Date(),
        reliability: 0.7,
        metadata: {
          content_preview: rawOutput.substring(0, 200) + (rawOutput.length > 200 ? '...' : ''),
          processing_instructions: processingInstructions,
          linking_strategy: linkingStrategy
        }
      });
      
      // If linked, connect the source to all extracted entities
      if (sourceResult.success) {
        for (const concept of extractionResults.concepts) {
          await this.storage.createRelationship({
            sourceId: concept.id,
            targetId: sourceResult.id,
            type: 'DERIVED_FROM'
          });
        }
        
        for (const fact of extractionResults.facts) {
          await this.storage.createRelationship({
            sourceId: fact.id,
            targetId: sourceResult.id,
            type: 'CITED_FROM'
          });
        }
        
        extractionResults.source = {
          id: sourceResult.id,
          title: sourceResult.title
        };
      }
      
      return {
        success: true,
        extractionResults
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default McpExtractor;