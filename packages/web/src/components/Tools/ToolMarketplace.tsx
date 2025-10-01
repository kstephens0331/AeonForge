import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type Tool = {
  id: string;
  name: string;
  description: string;
  category: string;
  isNew?: boolean;
  isPopular?: boolean;
};

export function ToolMarketplace() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [filteredTools, setFilteredTools] = useState<Tool[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    // Fetch tools from API
    const fetchTools = async () => {
      const response = await fetch('/api/tools');
      const data = await response.json();
      setTools(data.tools);
      setFilteredTools(data.tools);
      setCategories(data.categories);
    };

    fetchTools();
  }, []);

  useEffect(() => {
    // Apply filters
    let results = tools;
    
    if (searchTerm) {
      results = results.filter(tool => 
        tool.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tool.description.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    if (selectedCategory !== 'all') {
      results = results.filter(tool => tool.category === selectedCategory);
    }
    
    setFilteredTools(results);
  }, [searchTerm, selectedCategory, tools]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4">
        <Input
          placeholder="Search 10,000+ tools..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1"
        />
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="border rounded-md px-3 py-2"
        >
          <option value="all">All Categories</option>
          {categories.map(category => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTools.map(tool => (
          <Card key={tool.id} className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle className="flex justify-between items-start">
                <span>{tool.name}</span>
                <div className="flex gap-1">
                  {tool.isNew && <Badge variant="secondary">New</Badge>}
                  {tool.isPopular && <Badge variant="default">Popular</Badge>}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">{tool.description}</p>
              <div className="flex justify-between items-center">
                <Badge variant="outline">{tool.category}</Badge>
                <Button size="sm">Use Tool</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}