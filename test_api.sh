#!/bin/sh
curl -s http://localhost:3000/api/tools | jq '. | length'
curl -s http://localhost:3000/api/tools/document | jq '. | length'