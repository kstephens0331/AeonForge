import { connect } from 'mongoose';
import { Tool } from '../packages/server/src/models/Tool';
import { faker } from '@faker-js/faker';

async function main() {
  // Connect to local MongoDB
  await connect('mongodb://localhost:27017/aeonforge');

  // Generate 10,000 tools
  const tools = Array.from({ length: 10000 }, (_, i) => ({
    id: `tool-${(i + 1).toString().padStart(5, '0')}`,
    name: `${faker.commerce.productAdjective()} ${faker.commerce.product()} ${faker.hacker.verb()}`,
    description: faker.commerce.productDescription(),
    category: faker.helpers.arrayElement([
      'document', 'finance', 'development', 
      'marketing', 'productivity', 'business'
    ]),
    endpoint: `/tools/${i + 1}`,
    isPremium: faker.datatype.boolean(),
    version: '1.0.0',
    usageStats: { count: 0 }
  }));

  // Insert in batches of 500
  for (let i = 0; i < tools.length; i += 500) {
    const batch = tools.slice(i, i + 500);
    await Tool.insertMany(batch);
    console.log(`Inserted batch ${i / 500 + 1}/${Math.ceil(tools.length / 500)}`);
  }

  console.log('Successfully imported 10,000 tools');
  process.exit(0);
}

main().catch(console.error);