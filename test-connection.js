// test-connection.js
import neo4j from "neo4j-driver";
import config from "./config.js";

async function testConnection() {
  console.log(`Testing connection to Neo4j at ${config.NEO4J_URI} with user ${config.NEO4J_USERNAME}`);
  
  const driver = neo4j.driver(
    config.NEO4J_URI,
    neo4j.auth.basic(config.NEO4J_USERNAME, config.NEO4J_PASSWORD),
    {
      encrypted: true,
      trust: 'TRUST_SYSTEM_CA_SIGNED_CERTIFICATES',
      logging: {
        level: 'debug',
        logger: (level, message) => console.log(`${level}: ${message}`)
      }
    }
  );
  
  try {
    console.log('Verifying connection...');
    const serverInfo = await driver.verifyConnectivity();
    console.log('Connection successful!');
    console.log('Server info:', serverInfo);
    
    const session = driver.session();
    try {
      console.log('Running simple query...');
      const result = await session.run('RETURN 1 as num');
      console.log('Query result:', result.records[0].get('num').toNumber());
      console.log('Database connection is fully functional!');
    } finally {
      await session.close();
    }
  } catch (error) {
    console.error('Connection failed:', error);
  } finally {
    await driver.close();
  }
}

// Run the test
testConnection();
