// scripts/setup-database.js
const neo4j = require('neo4j-driver');
const config = require('../config');
const { setupSchema } = require('../schemas/schema-setup');

/**
 * Sets up the Neo4j database with the required schema and initial data
 */
async function setupDatabase() {
  const driver = neo4j.driver(
    config.NEO4J_URI,
    neo4j.auth.basic(config.NEO4J_USERNAME, config.NEO4J_PASSWORD)
  );
  
  try {
    console.log('Verifying connection to Neo4j...');
    await driver.verifyConnectivity();
    console.log('✓ Connection successful');
    
    // Set up schema
    const schemaResult = await setupSchema(driver);
    if (!schemaResult.success) {
      throw new Error(`Schema setup failed: ${schemaResult.error}`);
    }
    
    console.log('\nDatabase setup complete!');
  } catch (error) {
    console.error('Database setup failed:', error);
    process.exit(1);
  } finally {
    await driver.close();
  }
}

if (require.main === module) {
  setupDatabase();
}

module.exports = setupDatabase;