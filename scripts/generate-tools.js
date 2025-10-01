const fs = require('fs');
const { faker } = require('@faker-js/faker');

// Categories with weights for distribution
const categories = [
  { name: 'document', weight: 15 },
  { name: 'finance', weight: 12 },
  { name: 'development', weight: 18 },
  { name: 'marketing', weight: 10 },
  { name: 'productivity', weight: 8 },
  { name: 'data', weight: 7 },
  { name: 'design', weight: 5 },
  { name: 'education', weight: 4 },
  { name: 'healthcare', weight: 3 },
  { name: 'real-estate', weight: 3 },
  { name: 'engineering', weight: 5 },
  { name: 'legal', weight: 5 },
  { name: 'hr', weight: 5 }
];

// Generate weighted category list
const weightedCategories = [];
categories.forEach(cat => {
  for (let i = 0; i < cat.weight; i++) {
    weightedCategories.push(cat.name);
  }
});

// Tool templates by category
const toolTemplates = {
  document: [
    '${type} PDF ${action}',
    '${type} ${format} ${converter}',
    '${type} ${feature} ${tool}'
  ],
  finance: [
    '${type} ${calculator}',
    '${type} ${planner}',
    '${type} ${analyzer}'
  ],
  development: [
    '${language} ${generator}',
    '${system} ${debugger}',
    '${type} ${converter}'
  ]
  // ... other categories
};

// Generate 10,000 tools
const tools = [];
for (let i = 1; i <= 10000; i++) {
  const category = faker.helpers.arrayElement(weightedCategories);
  const template = faker.helpers.arrayElement(toolTemplates[category] || [`${category} tool`]);
  
  const tool = {
    id: `tool-${i.toString().padStart(5, '0')}`,
    name: faker.helpers.fake(template),
    description: faker.lorem.sentence(),
    category: [category],
    endpoint: `/tools/${category}/${i}`,
    inputSchema: [],
    outputType: faker.helpers.arrayElement(['json', 'file', 'text']),
    isPremium: faker.datatype.boolean(),
    tags: faker.helpers.uniqueArray(faker.word.adjective, 3),
    version: `${faker.number.int({ min: 1, max: 5 })}.0.0`
  };
  
  tools.push(tool);
}

// Write to files
fs.writeFileSync('tools.json', JSON.stringify(tools, null, 2));

// CSV header
let csv = 'id,name,description,category,endpoint,outputType,isPremium\n';
tools.forEach(tool => {
  csv += `"${tool.id}","${tool.name}","${tool.description}","${tool.category.join(',')}","${tool.endpoint}","${tool.outputType}","${tool.isPremium}"\n`;
});

fs.writeFileSync('tools.csv', csv);

console.log('Generated 10,000 tools in tools.json and tools.csv');