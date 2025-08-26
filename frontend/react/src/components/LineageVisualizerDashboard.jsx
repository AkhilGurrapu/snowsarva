import React, { useState } from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Maximize2, Minimize2, Database as DatabaseIcon, Settings } from 'lucide-react';
import LineageCanvas from './LineageCanvas';

// Create a query client for the LineageVisualizer components
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function LineageVisualizerDashboardInner() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedDatabase, setSelectedDatabase] = useState(null);
  const [selectedSchema, setSelectedSchema] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  const apiBase = import.meta.env.VITE_API_URL || '/api/snowpark';

  // Fetch real Snowflake data
  const { data: databases = [] } = useQuery({
    queryKey: ['databases'],
    queryFn: async () => {
      const response = await fetch(`${apiBase}/databases`);
      if (!response.ok) throw new Error('Failed to fetch databases');
      return response.json();
    }
  });

  const { data: schemas = [] } = useQuery({
    queryKey: ['schemas', selectedDatabase],
    queryFn: async () => {
      const url = selectedDatabase 
        ? `${apiBase}/schemas?database=${selectedDatabase}`
        : `${apiBase}/schemas`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch schemas');
      return response.json();
    },
    enabled: true
  });

  const { data: tables = [] } = useQuery({
    queryKey: ['tables', selectedDatabase, selectedSchema],
    queryFn: async () => {
      let url = `${apiBase}/tables`;
      const params = new URLSearchParams();
      if (selectedDatabase) params.append('database', selectedDatabase);
      if (selectedSchema) params.append('schema', selectedSchema);
      if (params.toString()) url += `?${params.toString()}`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch tables');
      return response.json();
    },
    enabled: true
  });

  const { data: connections = [] } = useQuery({
    queryKey: ['table-lineage'],
    queryFn: async () => {
      const response = await fetch(`${apiBase}/lineage/enhanced-object`);
      if (!response.ok) throw new Error('Failed to fetch lineage');
      const data = await response.json();
      return data.connections || [];
    }
  });

  // Filter tables based on selected database/schema
  const filteredTables = tables.filter(table => {
    if (!selectedDatabase && !selectedSchema) return true;
    
    const tableSchema = schemas.find(s => s.id === table.schemaId);
    if (selectedDatabase && tableSchema?.databaseId !== selectedDatabase) return false;
    if (selectedSchema && table.schemaId !== selectedSchema) return false;
    
    return true;
  });

  return (
    <div className={`${isFullscreen ? 'fixed inset-0 z-50' : 'h-full'} bg-slate-50 flex flex-col`} data-testid="dashboard">
      {/* Header with Database Selector */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <DatabaseIcon className="w-6 h-6 text-blue-600" />
            <h1 className="text-xl font-semibold text-slate-900">Data Lineage</h1>
          </div>
          
          <div className="flex items-center space-x-3">
            <div className="flex flex-col">
              <label className="text-xs text-slate-500 mb-1">Database</label>
              <Select 
                value={selectedDatabase || ""} 
                onValueChange={(value) => {
                  const dbId = value === "all" ? null : value;
                  setSelectedDatabase(dbId);
                  if (dbId !== selectedDatabase) {
                    setSelectedSchema(null);
                  }
                }}
              >
                <SelectTrigger className="w-48" data-testid="select-database">
                  <SelectValue placeholder="All Databases" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Databases</SelectItem>
                  {databases.map((database) => (
                    <SelectItem key={database.id} value={database.id}>
                      {database.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col">
              <label className="text-xs text-slate-500 mb-1">Schema</label>
              <Select 
                value={selectedSchema || ""} 
                onValueChange={(value) => {
                  setSelectedSchema(value === "all" ? null : value);
                }}
                disabled={!selectedDatabase}
              >
                <SelectTrigger className="w-40" data-testid="select-schema">
                  <SelectValue placeholder="All Schemas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Schemas</SelectItem>
                  {schemas.filter(schema => 
                    !selectedDatabase || schema.databaseId === selectedDatabase
                  ).map((schema) => (
                    <SelectItem key={schema.id} value={schema.id}>
                      {schema.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSettings(true)}
            data-testid="button-settings"
          >
            <Settings className="w-4 h-4 mr-2" />
            Snowflake Settings
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsFullscreen(!isFullscreen)}
            data-testid={isFullscreen ? "button-minimize" : "button-maximize"}
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="w-4 h-4 mr-2" />
                Minimize
              </>
            ) : (
              <>
                <Maximize2 className="w-4 h-4 mr-2" />
                Maximize
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 relative overflow-hidden">
        <LineageCanvas 
          tables={filteredTables} 
          connections={connections}
        />
      </div>

      {/* Snowflake Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-lg font-semibold mb-4">Snowflake Settings</h2>
            <p className="text-gray-600 mb-4">
              Connection settings are managed through the backend configuration.
            </p>
            <Button onClick={() => setShowSettings(false)}>
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LineageVisualizerDashboard() {
  return (
    <QueryClientProvider client={queryClient}>
      <LineageVisualizerDashboardInner />
    </QueryClientProvider>
  );
}