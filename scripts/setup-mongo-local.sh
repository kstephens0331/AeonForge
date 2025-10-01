#!/bin/bash

# Create data directory
mkdir -p data/db

# Start MongoDB in the background
mongod --dbpath=./data/db --fork --logpath ./data/mongod.log

# Create indexes
mongosh aeonforge --eval 'db.tools.createIndex({ name: "text", description: "text", tags: "text" })'
mongosh aeonforge --eval 'db.tools.createIndex({ category: 1, "usageStats.count": -1 })'

echo "MongoDB ready on port 27017"