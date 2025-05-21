// knowledge/retrieval.js
import neo4j from "neo4j-driver";
import * as cypherBuilder from "../utils/cypher-builder.js";

/**
 * Knowledge retrieval and search operations
 */
class KnowledgeRetrieval {
  /**
   * @param {neo4j.Driver} driver - Neo4j driver instance
   */
  constructor(driver) {
    this.driver = driver;
  }

  /**
   * Searches the knowledge graph
   * @param {Object} params - Search parameters
   * @returns {Promise<Object>} - Search results
   */
  async searchKnowledge(params) {
    const { 
      query, 
      searchType = "hybrid", 
      contextFilters = {}, 
      maxResults = 10, 
      includeContext = true 
    } = params;
    
    const session = this.driver.session();
    
    try {
      let cypherQuery = "";
      let queryParams = { query, maxResults };
      
      switch (searchType) {
        case "exact":
          cypherQuery = `
            MATCH (n:Knowledge)
            WHERE toLower(n.content) CONTAINS toLower($query) OR 
                  toLower(n.name) CONTAINS toLower($query) OR 
                  toLower(n.statement) CONTAINS toLower($query)
            RETURN n, 
                  CASE 
                    WHEN n.confidence IS NOT NULL THEN n.confidence 
                    ELSE 0.5 
                  END as relevance
            ORDER BY relevance DESC
            LIMIT $maxResults
          `;
          break;
          
        case "semantic":
          // This would integrate with vector similarity in the future
          // For now, use a text-based approach with some heuristics
          cypherQuery = `
            MATCH (n:Knowledge)
            WHERE n.content =~ "(?i).*" + $query + ".*" OR 
                  n.name =~ "(?i).*" + $query + ".*" OR 
                  n.statement =~ "(?i).*" + $query + ".*"
            WITH n, 
                 CASE 
                   WHEN n.content IS NOT NULL THEN apoc.text.levenshteinSimilarity(toLower(n.content), toLower($query))
                   WHEN n.name IS NOT NULL THEN apoc.text.levenshteinSimilarity(toLower(n.name), toLower($query))
                   WHEN n.statement IS NOT NULL THEN apoc.text.levenshteinSimilarity(toLower(n.statement), toLower($query))
                   ELSE 0.5
                 END as textSimilarity,
                 CASE 
                   WHEN n.confidence IS NOT NULL THEN n.confidence 
                   ELSE 0.5 
                 END as confidence
            RETURN n, (textSimilarity * 0.7 + confidence * 0.3) as relevance
            ORDER BY relevance DESC
            LIMIT $maxResults
          `;
          break;
          
        case "graph":
          cypherQuery = `
            MATCH (n:Knowledge)
            WHERE toLower(n.content) CONTAINS toLower($query) OR 
                  toLower(n.name) CONTAINS toLower($query) OR 
                  toLower(n.statement) CONTAINS toLower($query)
            WITH n, 
                 CASE 
                   WHEN n.confidence IS NOT NULL THEN n.confidence 
                   ELSE 0.5 
                 END as confidence
            MATCH (n)-[r*1..2]-(connected:Knowledge)
            RETURN DISTINCT n, collect(DISTINCT connected) as connections, confidence as relevance
            ORDER BY relevance DESC
            LIMIT $maxResults
          `;
          break;
          
        case "hybrid":
        default:
          cypherQuery = `
            MATCH (n:Knowledge)
            WHERE toLower(n.content) CONTAINS toLower($query) OR 
                  toLower(n.name) CONTAINS toLower($query) OR 
                  toLower(n.statement) CONTAINS toLower($query)
            WITH n, 
                 CASE 
                   WHEN n.content IS NOT NULL THEN apoc.text.levenshteinSimilarity(toLower(n.content), toLower($query))
                   WHEN n.name IS NOT NULL THEN apoc.text.levenshteinSimilarity(toLower(n.name), toLower($query))
                   WHEN n.statement IS NOT NULL THEN apoc.text.levenshteinSimilarity(toLower(n.statement), toLower($query))
                   ELSE 0.5
                 END as textSimilarity,
                 CASE 
                   WHEN n.confidence IS NOT NULL THEN n.confidence 
                   ELSE 0.5 
                 END as confidence
            OPTIONAL MATCH (n)-[r]-(connected:Knowledge)
            WITH n, collect(DISTINCT connected) as related, (textSimilarity * 0.7 + confidence * 0.3) as relevance
            RETURN n, related, relevance
            ORDER BY relevance DESC
            LIMIT $maxResults
          `;
          break;
      }
      
      // Apply context filters
      if (contextFilters.domain) {
        cypherQuery = cypherQuery.replace(
          "MATCH (n:Knowledge)",
          "MATCH (n:Knowledge)-[:BELONGS_TO]->(d:Domain {name: $domain})"
        );
        queryParams.domain = contextFilters.domain;
      }
      
      if (contextFilters.minConfidence) {
        const confidenceCheck = "AND n.confidence >= $minConfidence";
        if (cypherQuery.includes("WHERE")) {
          cypherQuery = cypherQuery.replace(
            "WHERE",
            "WHERE n.confidence >= $minConfidence AND"
          );
        } else {
          cypherQuery = cypherQuery.replace(
            "MATCH (n:Knowledge)",
            "MATCH (n:Knowledge) WHERE n.confidence >= $minConfidence"
          );
        }
        queryParams.minConfidence = contextFilters.minConfidence;
      }
      
      if (contextFilters.contentType) {
        // Handle multiple content types
        if (Array.isArray(contextFilters.contentType)) {
          const labels = contextFilters.contentType
            .map(type => type.charAt(0).toUpperCase() + type.slice(1))
            .join('|');
          
          cypherQuery = cypherQuery.replace(
            "MATCH (n:Knowledge)",
            `MATCH (n:Knowledge) WHERE ANY(label IN labels(n) WHERE label IN ['${labels}'])`
          );
        } else {
          // Single content type
          const label = contextFilters.contentType.charAt(0).toUpperCase() + 
                        contextFilters.contentType.slice(1);
          
          cypherQuery = cypherQuery.replace(
            "MATCH (n:Knowledge)",
            `MATCH (n:Knowledge:${label})`
          );
        }
      }
      
      if (contextFilters.source) {
        const sourceCheck = "AND n.source = $source";
        if (cypherQuery.includes("WHERE")) {
          cypherQuery = cypherQuery.replace(
            "WHERE",
            "WHERE n.source = $source AND"
          );
        } else {
          cypherQuery = cypherQuery.replace(
            "MATCH (n:Knowledge)",
            "MATCH (n:Knowledge) WHERE n.source = $source"
          );
        }
        queryParams.source = contextFilters.source;
      }
      
      const result = await session.run(cypherQuery, queryParams);
      
      const results = result.records.map(record => {
        const node = record.get('n').properties;
        const related = record.has('related') ? record.get('related') : [];
        const nodeLabels = record.get('n').labels || [];
        
        // Determine node type from labels, excluding 'Knowledge'
        const nodeType = nodeLabels.find(label => label !== 'Knowledge') || 'Unknown';
        
        // Determine content based on node type
        let content;
        if (node.content) {
          content = node.content;
        } else if (node.name) {
          content = node.name;
        } else if (node.statement) {
          content = node.statement;
        } else {
          content = JSON.stringify(node);
        }
        
        return {
          id: node.id,
          content: content,
          contentType: nodeType,
          source: node.source,
          confidence: node.confidence || 0.5,
          relevance: record.get('relevance'),
          relatedConcepts: related.map(r => {
            if (!r) return null;
            const props = r.properties;
            return {
              id: props.id,
              content: props.content || props.name || props.statement || JSON.stringify(props)
            };
          }).filter(Boolean)
        };
      });
      
      return {
        success: true,
        results,
        totalCount: results.length,
        searchType,
        includeContext
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Explores the knowledge graph from a starting concept
   * @param {Object} params - Exploration parameters
   * @returns {Promise<Object>} - Exploration results
   */
  async exploreKnowledgeGraph(params) {
    const { 
      startConcept, 
      relationshipTypes = [], 
      maxDepth = 3, 
      visualize = false 
    } = params;
    
    const session = this.driver.session();
    
    try {
      // Build relationship type filter
      const relFilter = relationshipTypes.length > 0 
        ? `[r:${relationshipTypes.join('|')}*1..${maxDepth}]`
        : `[r*1..${maxDepth}]`;
      
      // Determine how to match the start node
      const isUuid = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
      
      let matchCondition;
      if (isUuid(startConcept)) {
        matchCondition = '(start:Knowledge {id: $startConcept})';
      } else {
        matchCondition = `(start:Knowledge) WHERE start.name = $startConcept OR 
                                                  start.content = $startConcept OR 
                                                  start.statement = $startConcept OR
                                                  start.name CONTAINS $startConcept OR 
                                                  start.content CONTAINS $startConcept OR 
                                                  start.statement CONTAINS $startConcept`;
      }
      
      const cypherQuery = `
        MATCH ${matchCondition}
        MATCH path = (start)-${relFilter}-(connected:Knowledge)
        WITH start, connected, relationships(path) as rels, length(path) as depth
        RETURN 
          start, 
          collect(DISTINCT {
            node: connected, 
            depth: depth, 
            relationships: [rel in rels WHERE startNode(rel) = start | type(rel)]
          }) as connections
        LIMIT 1
      `;
      
      const result = await session.run(cypherQuery, { startConcept });
      
      if (result.records.length === 0) {
        return {
          success: false,
          error: `No concept found matching: ${startConcept}`
        };
      }
      
      const record = result.records[0];
      const startNode = record.get('start').properties;
      const connections = record.get('connections');
      
      // Format the results
      const startNodeType = record.get('start').labels.find(label => label !== 'Knowledge') || 'Unknown';
      
      const explorationData = {
        startNode: {
          id: startNode.id,
          name: startNode.name || startNode.content || startNode.statement,
          type: startNodeType,
          content: startNode.content || startNode.name || startNode.statement,
          source: startNode.source,
          confidence: startNode.confidence
        },
        connectedNodes: connections.map(conn => {
          const node = conn.node.properties;
          const nodeType = conn.node.labels.find(label => label !== 'Knowledge') || 'Unknown';
          
          return {
            id: node.id,
            name: node.name || node.content || node.statement,
            type: nodeType,
            content: node.content || node.name || node.statement,
            source: node.source,
            confidence: node.confidence,
            depth: conn.depth,
            relationships: conn.relationships
          };
        }),
        relationshipSummary: {}
      };
      
      // Build relationship summary
      explorationData.connectedNodes.forEach(node => {
        node.relationships.forEach(rel => {
          explorationData.relationshipSummary[rel] = (explorationData.relationshipSummary[rel] || 0) + 1;
        });
      });
      
      // Generate visualization data if requested
      if (visualize) {
        // Create DOT graph format
        const nodes = [explorationData.startNode, ...explorationData.connectedNodes.slice(0, 20)]
          .map(node => {
            // Escape quotes and special characters
            const label = (node.name || node.content || '')
              .replace(/"/g, '\\"')
              .substring(0, 30);
              
            return `"${node.id}" [label="${label}${label.length >= 30 ? '...' : ''}" shape=box style=filled fillcolor=${node.depth ? 'lightblue' : 'lightgreen'}]`;
          })
          .join('\n');
        
        const edges = [];
        explorationData.connectedNodes.forEach(node => {
          node.relationships.forEach(rel => {
            edges.push(`"${explorationData.startNode.id}" -> "${node.id}" [label="${rel}"]`);
          });
        });
        
        explorationData.visualization = `digraph G {\n${nodes}\n${edges.join('\n')}\n}`;
      }
      
      return {
        success: true,
        explorationData
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Finds paths between concepts in the knowledge graph
   * @param {Object} params - Path finding parameters
   * @returns {Promise<Object>} - Path results
   */
  async findKnowledgePaths(params) {
    const { conceptA, conceptB, maxPathLength = 5, relationshipConstraints = [] } = params;
    
    const session = this.driver.session();
    
    try {
      const { query, params: queryParams } = cypherBuilder.findPathsQuery({
        conceptA,
        conceptB,
        maxPathLength,
        relationshipTypes: relationshipConstraints,
        includePathNodes: true
      });
      
      const result = await session.run(query, queryParams);
      
      if (result.records.length === 0) {
        return {
          success: true,
          found: false,
          message: `No paths found between "${conceptA}" and "${conceptB}" within ${maxPathLength} steps.`
        };
      }
      
      const paths = result.records.map((record, index) => {
        const pathNodes = record.get('pathNodes');
        const rels = record.get('rels');
        const pathLength = record.get('pathLength');
        
        const pathSegments = [];
        
        // Build path description
        for (let i = 0; i < pathNodes.length - 1; i++) {
          const sourceNode = pathNodes[i];
          const targetNode = pathNodes[i + 1];
          const relationship = rels[i]?.type || 'RELATED_TO';
          
          pathSegments.push({
            source: {
              id: sourceNode.id,
              name: sourceNode.name,
              type: sourceNode.type
            },
            relationship: relationship,
            target: {
              id: targetNode.id,
              name: targetNode.name,
              type: targetNode.type
            }
          });
        }
        
        return {
          index: index + 1,
          length: pathLength,
          nodes: pathNodes,
          segments: pathSegments
        };
      });
      
      return {
        success: true,
        found: true,
        paths,
        count: paths.length,
        shortestPathLength: Math.min(...paths.map(p => p.length))
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Analyzes gaps in the knowledge graph
   * @param {Object} params - Gap analysis parameters
   * @returns {Promise<Object>} - Analysis results
   */
  async analyzeKnowledgeGaps(params) {
    const { domain, analysisType, threshold = 0.7 } = params;
    
    const session = this.driver.session();
    
    try {
      const { query, params: queryParams } = cypherBuilder.analyzeGapsQuery({
        domain,
        analysisType,
        threshold
      });
      
      const result = await session.run(query, queryParams);
      
      let analysisResults = [];
      
      switch (analysisType) {
        case "missing-connections":
          analysisResults = result.records.map(record => ({
            concept1: record.get('concept1'),
            concept2: record.get('concept2'),
            similarity: record.get('similarity')
          }));
          break;
          
        case "weak-areas":
          analysisResults = result.records.map(record => ({
            concept: record.get('concept'),
            connectionCount: record.get('connectionCount'),
            confidence: record.get('confidence'),
            reason: record.get('reason')
          }));
          break;
          
        case "outdated-content":
          analysisResults = result.records.map(record => ({
            concept: record.get('concept'),
            source: record.get('source'),
            daysSinceUpdate: record.get('daysSinceUpdate'),
            confidence: record.get('confidence')
          }));
          break;
      }
      
      return {
        success: true,
        domain,
        analysisType,
        threshold,
        results: analysisResults,
        count: analysisResults.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    } finally {
      await session.close();
    }
  }
}

export default KnowledgeRetrieval;