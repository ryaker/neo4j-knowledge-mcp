// test/test-connection.js
const neo4j = require('neo4j-driver');
const config = require('../config');

/**
 * Tests the connection to the Neo4j database
 */
async function testConnection() {
  const driver = neo4j.driver(
    config.NEO4J_URI,
    neo4j.auth.basic(config.NEO4J_USERNAME, config.NEO4J_PASSWORD)
  );
  
  try {
    console.log('Testing connection to Neo4j...');
    
    // Verify general connectivity
    await driver.verifyConnectivity();
    console.log('✓ General connectivity verified');
    
    // Test a simple query
    const session = driver.session();
    const result = await session.run('RETURN 1 as test');
    console.log(`✓ Query execution verified: ${result.records[0].get('test')}`);
    
    // Get database information
    const dbInfo = await session.run('CALL dbms.components() YIELD name, versions, edition RETURN name, versions, edition');
    const name = dbInfo.records[0].get('name');
    const version = dbInfo.records[0].get('versions')[0];
    const edition = dbInfo.records[0].get('edition');
    
    console.log(`\nDatabase Information:`);
    console.log(`Name: ${name}`);
    console.log(`Version: ${version}`);
    console.log(`Edition: ${edition}`);
    
    await session.close();
    console.log('\n✓ Connection test completed successfully');
  } catch (error) {
    console.error('Connection test failed:', error);
    process.exit(1);
  } finally {
    await driver.close();
  }
}

if (require.main === module) {
  testConnection();
}

module.exports = testConnection;