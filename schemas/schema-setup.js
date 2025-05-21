// schemas/schema-setup.js
import neo4j from "neo4j-driver";
import config from "../config.js";

/**
 * Sets up the knowledge graph schema in Neo4j
 * @param {neo4j.Driver} driver - The Neo4j driver instance
 * @returns {Promise<Object>} - Operation result
 */
async function setupSchema(driver) {
  const session = driver.session();
  
  try {
    console.log('Setting up Neo4j knowledge graph schema...');
    
    // Create constraints for core node types
    const constraints = [
      'CREATE CONSTRAINT knowledge_id IF NOT EXISTS FOR (k:Knowledge) REQUIRE k.id IS UNIQUE',
      'CREATE CONSTRAINT concept_id IF NOT EXISTS FOR (c:Concept) REQUIRE c.id IS UNIQUE',
      'CREATE CONSTRAINT concept_name IF NOT EXISTS FOR (c:Concept) REQUIRE c.name IS UNIQUE',
      'CREATE CONSTRAINT fact_id IF NOT EXISTS FOR (f:Fact) REQUIRE f.id IS UNIQUE',
      'CREATE CONSTRAINT source_id IF NOT EXISTS FOR (s:Source) REQUIRE s.id IS UNIQUE',
      'CREATE CONSTRAINT person_id IF NOT EXISTS FOR (p:Person) REQUIRE p.id IS UNIQUE',
      'CREATE CONSTRAINT domain_id IF NOT EXISTS FOR (d:Domain) REQUIRE d.id IS UNIQUE',
      'CREATE CONSTRAINT ai_processing_id IF NOT EXISTS FOR (a:AIProcessing) REQUIRE a.id IS UNIQUE'
    ];
    
    for (const constraint of constraints) {
      try {
        await session.run(constraint);
        console.log(`✓ ${constraint.split(' ')[2]}`);
      } catch (err) {
        if (!err.message.includes('already exists')) {
          console.error(`✗ Failed to create constraint: ${err.message}`);
        }
      }
    }
    
    // Create indexes for performance optimization
    const indexes = [
      'CREATE INDEX knowledge_content IF NOT EXISTS FOR (k:Knowledge) ON (k.content)',
      'CREATE INDEX knowledge_source IF NOT EXISTS FOR (k:Knowledge) ON (k.source)',
      'CREATE INDEX knowledge_confidence IF NOT EXISTS FOR (k:Knowledge) ON (k.confidence)',
      'CREATE INDEX concept_name_idx IF NOT EXISTS FOR (c:Concept) ON (c.name)',
      'CREATE INDEX fact_statement IF NOT EXISTS FOR (f:Fact) ON (f.statement)',
      'CREATE INDEX source_type IF NOT EXISTS FOR (s:Source) ON (s.source_type)'
    ];
    
    for (const index of indexes) {
      try {
        await session.run(index);
        console.log(`✓ ${index.split(' ')[2]}`);
      } catch (err) {
        if (!err.message.includes('already exists')) {
          console.error(`✗ Failed to create index: ${err.message}`);
        }
      }
    }
    
    // Define initial domain structure
    const domains = [
      { name: 'Financial Planning', description: 'Knowledge related to financial strategies and planning' },
      { name: 'Technology', description: 'Technical knowledge and programming concepts' },
      { name: 'Business', description: 'Business processes and strategies' },
      { name: 'General', description: 'General knowledge not fitting other categories' }
    ];
    
    for (const domain of domains) {
      const domainQuery = `
        MERGE (d:Domain {name: $name})
        ON CREATE SET 
          d.id = randomUUID(), 
          d.description = $description, 
          d.created_date = datetime()
        RETURN d
      `;
      await session.run(domainQuery, domain);
      console.log(`✓ Domain '${domain.name}' created or updated`);
    }
    
    console.log('Knowledge graph schema setup complete!');
    
    return { success: true };
  } catch (error) {
    console.error('Schema setup failed:', error);
    return { 
      success: false, 
      error: error.message 
    };
  } finally {
    await session.close();
  }
}

export { setupSchema };