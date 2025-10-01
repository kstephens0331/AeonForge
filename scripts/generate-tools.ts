import { faker } from '@faker-js/faker';
import fs from 'fs';

const categories = [
  'document', 'finance', 'development', 'marketing',
  'productivity', 'business', 'design', 'education'
];

const tools = Array.from({ length: 10000 }, (_, i) => ({
  id: `tool-${(i + 1).toString().padStart(5, '0')}`,
  name: `${faker.commerce.productAdjective()} ${faker.commerce.product()} ${faker.word.verb()}`,
  description: faker.commerce.productDescription(),
  category: categories[i % categories.length],
  endpoint: `/tools/${categories[i % categories.length]}/${i + 1}`,
  isPremium: faker.datatype.boolean(),
  tags: faker.helpers.arrayElements(
    ['pdf', 'ai', 'generator', 'converter', 'analyzer'], 
    3
  ),
  version: '1.0.0'
}));

fs.writeFileSync('data/tools.json', JSON.stringify(tools, null, 2));
console.log('Generated 10,000 tools in data/tools.json');