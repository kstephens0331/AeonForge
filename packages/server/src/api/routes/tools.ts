import express from 'express';
import { ToolRegistry } from '../../services/ToolRegistry';

const router = express.Router();
const toolRegistry = ToolRegistry.getInstance();

router.get('/', (req, res) => {
  const { category, search } = req.query;
  
  let tools = toolRegistry.getAllTools();
  
  if (category) {
    tools = toolRegistry.getToolsByCategory(String(category));
  }
  
  if (search) {
    const searchTerm = String(search).toLowerCase();
    tools = tools.filter(
      tool => tool.name.toLowerCase().includes(searchTerm) || 
             tool.description.toLowerCase().includes(searchTerm)
    );
  }
  
  res.json(tools);
});

router.get('/:id', (req, res) => {
  const tool = toolRegistry.getToolById(req.params.id);
  
  if (!tool) {
    return res.status(404).json({ error: 'Tool not found' });
  }
  
  res.json(tool);
});

export default router;