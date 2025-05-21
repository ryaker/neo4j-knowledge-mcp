// knowledge/storage.js
import neo4j from "neo4j-driver";
import * as cypherBuilder from "../utils/cypher-builder.js";

/**
 * Knowledge storage operations
 */
class KnowledgeStorage {
  /**
   * @param {neo4j.Driver} driver - Neo4j driver instance
   */
  constructor(driver) {
    this.driver = driver;
  }

  /**
   * Stores a concept in the knowledge graph
   * @param {Object} params - Concept parameters
   * @returns {Promise<Object>} - Operation result
   */
  async storeConcept(params) {
    const session = this.driver.session();
    
    try {
      const { query, params: queryParams } = cypherBuilder.createConceptQuery(params);
      const result = await session.run(query, queryParams);
      
      if (result.records.length === 0) {
        throw new Error('Failed to create concept');
      }
      
      const record = result.records[0];
      
      // Add to domain if specified
      if (params.domain) {
        const domainQuery = `
          MATCH (c:Concept {id: $conceptId})
          MERGE (d:Domain {name: $domain})
          ON CREATE SET 
            d.id = randomUUID(),
            d.created_date = datetime()
          MERGE (c)-[:BELONGS_TO]->(d)
          RETURN d.name as domainName
        `;
        
        await session.run(domainQuery, {
          conceptId: record.get('id'),
          domain: params.domain
        });
      }
      
      // Create relationships if specified
      if (params.relationships && params.relationships.length > 0) {
        for (const rel of params.relationships) {
          const relQuery = `
            MATCH (a:Concept {id: $conceptId})
            MATCH (b) WHERE id(b) = $targetId OR b.id = $targetId
            MERGE (a)-[r:${rel.type}]->(b)
            RETURN type(r) as relationship
          `;
          
          await session.run(relQuery, {
            conceptId: record.get('id'),
            targetId: rel.targetId
          });
        }
      }
      
      return {
        success: true,
        id: record.get('id'),
        name: record.get('name')
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
   * Stores a fact in the knowledge graph
   * @param {Object} params - Fact parameters
   * @returns {Promise<Object>} - Operation result
   */
  async storeFact(params) {
    const session = this.driver.session();
    
    try {
      const { query, params: queryParams } = cypherBuilder.createFactQuery(params);
      const result = await session.run(query, queryParams);
      
      if (result.records.length === 0) {
        throw new Error('Failed to create fact');
      }
      
      const record = result.records[0];
      const factId = record.get('id');
      
      // Connect fact to concepts if specified
      if (params.concepts && params.concepts.length > 0) {
        for (const concept of params.concepts) {
          // If concept is a string (name), find or create it
          if (typeof concept === 'string') {
            const conceptQuery = cypherBuilder.createConceptQuery({
              name: concept,
              source: params.source,
              confidence: params.confidence * 0.9 // Slightly lower confidence
            });
            
            const conceptResult = await session.run(conceptQuery.query, conceptQuery.params);
            if (conceptResult.records.length > 0) {
              const conceptId = conceptResult.records[0].get('id');
              
              // Create relationship
              const relQuery = cypherBuilder.createFactConceptRelationQuery({
                factId,
                conceptId
              });
              
              await session.run(relQuery.query, relQuery.params);
            }
          } 
          // If concept is an object with id
          else if (concept.id) {
            const relQuery = cypherBuilder.createFactConceptRelationQuery({
              factId,
              conceptId: concept.id,
              relationshipType: concept.relationshipType || 'ABOUT'
            });
            
            await session.run(relQuery.query, relQuery.params);
          }
        }
      }
      
      // Add to domain if specified
      if (params.domain) {
        const domainQuery = `
          MATCH (f:Fact {id: $factId})
          MERGE (d:Domain {name: $domain})
          ON CREATE SET 
            d.id = randomUUID(),
            d.created_date = datetime()
          MERGE (f)-[:BELONGS_TO]->(d)
          RETURN d.name as domainName
        `;
        
        await session.run(domainQuery, {
          factId,
          domain: params.domain
        });
      }
      
      return {
        success: true,
        id: factId,
        statement: record.get('statement')
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
   * Stores a source reference in the knowledge graph
   * @param {Object} params - Source parameters
   * @returns {Promise<Object>} - Operation result
   */
  async storeSource(params) {
    const { title, url, sourceType, author, publicationDate, reliability = 0.8, metadata = {} } = params;
    
    const session = this.driver.session();
    
    try {
      const query = `
        MERGE (s:Source {url: $url})
        ON CREATE SET 
          s.id = randomUUID(),
          s.title = $title,
          s.source_type = $sourceType,
          s.author = $author,
          s.publication_date = $publicationDate,
          s.processing_date = datetime(),
          s.reliability_score = $reliability,
          s.metadata = $metadata
        ON MATCH SET
          s.title = CASE WHEN $title IS NOT NULL THEN $title ELSE s.title END,
          s.author = CASE WHEN $author IS NOT NULL THEN $author ELSE s.author END,
          s.reliability_score = $reliability
        RETURN s.id as id, s.title as title
      `;
      
      const result = await session.run(query, {
        url,
        title,
        sourceType,
        author,
        publicationDate: publicationDate ? new Date(publicationDate).toISOString() : null,
        reliability,
        metadata: JSON.stringify(metadata)
      });
      
      if (result.records.length === 0) {
        throw new Error('Failed to create source');
      }
      
      const record = result.records[0];
      
      return {
        success: true,
        id: record.get('id'),
        title: record.get('title')
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
   * Creates a relationship between knowledge nodes
   * @param {Object} params - Relationship parameters
   * @returns {Promise<Object>} - Operation result
   */
  async createRelationship(params) {
    const { sourceId, targetId, type, properties = {} } = params;
    
    const session = this.driver.session();
    
    try {
      const query = `
        MATCH (source) WHERE source.id = $sourceId
        MATCH (target) WHERE target.id = $targetId
        MERGE (source)-[r:${type}]->(target)
        SET r += $properties
        RETURN type(r) as relationship, source.id as sourceId, target.id as targetId
      `;
      
      const result = await session.run(query, {
        sourceId,
        targetId,
        properties
      });
      
      if (result.records.length === 0) {
        throw new Error('Failed to create relationship');
      }
      
      const record = result.records[0];
      
      return {
        success: true,
        relationship: record.get('relationship'),
        sourceId: record.get('sourceId'),
        targetId: record.get('targetId')
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
   * Stores general knowledge with flexible node type
   * @param {Object} params - Knowledge parameters
   * @returns {Promise<Object>} - Operation result
   */
  async storeKnowledge(params) {
    const { content, contentType, source, metadata = {}, relationships = [] } = params;
    
    switch (contentType.toLowerCase()) {
      case 'concept':
        return this.storeConcept({
          name: content,
          source,
          confidence: metadata.confidence,
          domain: metadata.domain,
          metadata
        });
        
      case 'fact':
        return this.storeFact({
          statement: content,
          source,
          confidence: metadata.confidence,
          factType: metadata.factType || 'general',
          domain: metadata.domain,
          concepts: metadata.concepts || [],
          metadata
        });
        
      default:
        // Generic knowledge node
        const session = this.driver.session();
        
        try {
          // Upper case first letter of contentType for label
          const nodeLabel = contentType.charAt(0).toUpperCase() + contentType.slice(1);
          
          const query = `
            CREATE (n:Knowledge:${nodeLabel} {
              id: randomUUID(),
              content: $content,
              source: $source,
              contentType: $contentType,
              confidence: $confidence,
              created_date: datetime(),
              last_updated: datetime(),
              metadata: $metadata
            })
            RETURN n.id as nodeId
          `;
          
          const result = await session.run(query, {
            content,
            source,
            contentType,
            confidence: metadata.confidence || 0.8,
            metadata: JSON.stringify(metadata)
          });
          
          if (result.records.length === 0) {
            throw new Error('Failed to create knowledge node');
          }
          
          const nodeId = result.records[0].get('nodeId');
          
          // Create relationships if specified
          for (const rel of relationships) {
            await this.createRelationship({
              sourceId: nodeId,
              targetId: rel.targetNode,
              type: rel.relationshipType,
              properties: rel.properties || {}
            });
          }
          
          // Add to domain if specified
          if (metadata.domain) {
            const domainQuery = `
              MATCH (k:Knowledge {id: $nodeId})
              MERGE (d:Domain {name: $domain})
              ON CREATE SET 
                d.id = randomUUID(),
                d.created_date = datetime()
              MERGE (k)-[:BELONGS_TO]->(d)
              RETURN d.name as domainName
            `;
            
            await session.run(domainQuery, {
              nodeId,
              domain: metadata.domain
            });
          }
          
          return {
            success: true,
            id: nodeId,
            contentType,
            relationshipsCreated: relationships.length
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
}

export default KnowledgeStorage;