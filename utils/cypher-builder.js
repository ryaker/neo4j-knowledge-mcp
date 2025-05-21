// utils/cypher-builder.js

/**
 * Utility functions for dynamically building Cypher queries
 */

/**
 * Creates a query for storing a concept node
 * @param {Object} params - Parameters for the concept
 * @returns {Object} - Cypher query and parameters
 */
function createConceptQuery(params) {
  const { name, description, source, confidence, metadata = {} } = params;
  
  const query = `
    MERGE (c:Concept {name: $name})
    ON CREATE SET 
      c.id = randomUUID(),
      c.description = $description,
      c.source = $source,
      c.confidence = $confidence,
      c.created_date = datetime(),
      c.last_updated = datetime(),
      c.metadata = $metadata
    ON MATCH SET
      c.description = CASE WHEN $description IS NOT NULL AND $description <> '' THEN $description ELSE c.description END,
      c.last_updated = datetime(),
      c.confidence = CASE WHEN $confidence > c.confidence THEN $confidence ELSE c.confidence END
    RETURN c.id as id, c.name as name, labels(c) as labels
  `;
  
  return {
    query,
    params: {
      name,
      description: description || name,
      source,
      confidence: confidence || 0.8,
      metadata: JSON.stringify(metadata)
    }
  };
}

/**
 * Creates a query for storing a fact node
 * @param {Object} params - Parameters for the fact
 * @returns {Object} - Cypher query and parameters
 */
function createFactQuery(params) {
  const { statement, source, confidence, factType = 'general', metadata = {} } = params;
  
  const query = `
    CREATE (f:Fact {
      id: randomUUID(),
      statement: $statement,
      source: $source,
      confidence: $confidence,
      fact_type: $factType,
      created_date: datetime(),
      verified_date: null,
      metadata: $metadata
    })
    RETURN f.id as id, f.statement as statement, labels(f) as labels
  `;
  
  return {
    query,
    params: {
      statement,
      source,
      confidence: confidence || 0.8,
      factType,
      metadata: JSON.stringify(metadata)
    }
  };
}

/**
 * Creates a query for connecting a fact to a concept
 * @param {Object} params - Parameters for the relationship
 * @returns {Object} - Cypher query and parameters
 */
function createFactConceptRelationQuery(params) {
  const { factId, conceptId, relationshipType = 'ABOUT' } = params;
  
  const query = `
    MATCH (f:Fact {id: $factId})
    MATCH (c:Concept {id: $conceptId})
    MERGE (f)-[r:${relationshipType}]->(c)
    RETURN f.id as factId, c.id as conceptId, type(r) as relationship
  `;
  
  return {
    query,
    params: {
      factId,
      conceptId
    }
  };
}

/**
 * Creates a query for finding paths between concepts
 * @param {Object} params - Parameters for the path finding
 * @returns {Object} - Cypher query and parameters
 */
function findPathsQuery(params) {
  const { 
    conceptA, 
    conceptB, 
    maxPathLength = 5, 
    relationshipTypes = [],
    includePathNodes = true
  } = params;
  
  // Build relationship filter
  const relFilter = relationshipTypes.length > 0 
    ? `[r:${relationshipTypes.join('|')}*1..${maxPathLength}]`
    : `[r*1..${maxPathLength}]`;
  
  // Determine how to match the concept nodes
  const isUuid = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
  
  const matchA = isUuid(conceptA) 
    ? '(a:Concept {id: $conceptA})'
    : '(a:Concept) WHERE a.name = $conceptA OR a.name CONTAINS $conceptA';
    
  const matchB = isUuid(conceptB)
    ? '(b:Concept {id: $conceptB})'
    : '(b:Concept) WHERE b.name = $conceptB OR b.name CONTAINS $conceptB';
  
  let query = `
    MATCH ${matchA}, ${matchB}
    MATCH path = (a)-${relFilter}-(b)
    WITH path, relationships(path) as rels, length(path) as pathLength
  `;
  
  // Add return statement based on includePathNodes
  if (includePathNodes) {
    query += `
      RETURN path, rels, pathLength,
             [node in nodes(path) | {id: node.id, name: CASE WHEN node.name IS NOT NULL THEN node.name ELSE node.statement END, type: labels(node)[0]}] as pathNodes
      ORDER BY pathLength ASC
      LIMIT 10
    `;
  } else {
    query += `
      RETURN path, rels, pathLength
      ORDER BY pathLength ASC
      LIMIT 10
    `;
  }
  
  return {
    query,
    params: {
      conceptA,
      conceptB,
      maxPathLength
    }
  };
}

/**
 * Creates a query for analyzing knowledge gaps
 * @param {Object} params - Parameters for the gap analysis
 * @returns {Object} - Cypher query and parameters
 */
function analyzeGapsQuery(params) {
  const { domain, analysisType, threshold = 0.7 } = params;
  
  let query = "";
  
  switch (analysisType) {
    case "missing-connections":
      query = `
        MATCH (d:Domain {name: $domain})<-[:BELONGS_TO]-(c:Concept)
        MATCH (c2:Concept)-[:BELONGS_TO]->(d)
        WHERE c <> c2 AND NOT (c)-[]-(c2)
        WITH c, c2,
             CASE
               WHEN c.keywords IS NOT NULL AND c2.keywords IS NOT NULL 
               THEN apoc.text.jaroWinklerDistance(c.name, c2.name)
               ELSE 0.5
             END as similarity
        WHERE similarity > $threshold
        RETURN c.name as concept1, c2.name as concept2, similarity
        ORDER BY similarity DESC
        LIMIT 20
      `;
      break;
      
    case "weak-areas":
      query = `
        MATCH (d:Domain {name: $domain})<-[:BELONGS_TO]-(c:Concept)
        WITH c, 
             size((c)-[]->()) as outDegree,
             size((c)<-[]-()) as inDegree,
             c.confidence as confidence
        WHERE outDegree + inDegree < 3 OR confidence < $threshold
        RETURN c.name as concept, 
               outDegree + inDegree as connectionCount,
               confidence,
               'weak_connections' as reason
        ORDER BY connectionCount ASC, confidence ASC
        LIMIT 20
      `;
      break;
      
    case "outdated-content":
      query = `
        MATCH (d:Domain {name: $domain})<-[:BELONGS_TO]-(c:Concept)
        WHERE c.last_updated IS NOT NULL AND 
              duration.between(c.last_updated, datetime()).days > 90
        WITH c, duration.between(c.last_updated, datetime()).days as daysSinceUpdate
        RETURN c.name as concept,
               c.source as source,
               daysSinceUpdate,
               c.confidence as confidence
        ORDER BY daysSinceUpdate DESC
        LIMIT 20
      `;
      break;
      
    default:
      throw new Error(`Unknown analysis type: ${analysisType}`);
  }
  
  return {
    query,
    params: {
      domain,
      threshold
    }
  };
}

export { createConceptQuery,
  createFactQuery,
  createFactConceptRelationQuery,
  findPathsQuery,
  analyzeGapsQuery };