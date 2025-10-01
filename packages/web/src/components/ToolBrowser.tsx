import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export function ToolBrowser() {
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTools() {
      const res = await fetch('/api/tools?limit=100');
      const data = await res.json();
      setTools(data);
      setLoading(false);
    }
    fetchTools();
  }, []);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {tools.map(tool => (
        <Card key={tool.id} className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle>{tool.name}</CardTitle>
            <CardDescription>{tool.description}</CardDescription>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}