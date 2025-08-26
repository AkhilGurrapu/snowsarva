import React, { memo, useState, useCallback } from "react";
import { Handle, Position } from "reactflow";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Table as TableIcon, Eye, Database, Shield, Tag, Plus, Minus } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

export default memo(function LineageVisualizerTableNode({ data, selected }) {
  const { table, selectedColumn, highlightedColumns, onColumnSelect, isHighlighted, lineageLevel } = data;
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  const apiBase = import.meta.env.VITE_API_URL || '/api/snowpark';

  // Fetch columns for the table when expanded
  const { data: columns = [], isLoading } = useQuery({
    queryKey: ['table-columns', table.id],
    queryFn: async () => {
      const response = await fetch(`${apiBase}/tables/${table.id}/columns`);
      if (!response.ok) {
        // Fallback to getting columns from table data if direct endpoint fails
        return table.columns || [];
      }
      return response.json();
    },
    enabled: isExpanded,
  });

  const handleToggleExpand = useCallback((e) => {
    e?.stopPropagation();
    const newExpanded = !isExpanded;
    setIsExpanded(newExpanded);
    data.onExpand?.(table.id, newExpanded);
  }, [isExpanded, table.id, data]);

  const handleNodeClick = useCallback((e) => {
    e.stopPropagation();
    if (!isExpanded) {
      setIsExpanded(true);
      data.onExpand?.(table.id, true);
    }
  }, [isExpanded, table.id, data]);

  const handleColumnClick = useCallback((columnId) => {
    onColumnSelect?.(columnId, table.id);
  }, [onColumnSelect, table.id]);

  const getTableTypeIcon = () => {
    const tableType = table.tableType?.toLowerCase() || '';
    switch (tableType) {
      case 'view':
        return <Eye className="w-4 h-4 text-green-600" />;
      case 'materialized view':
      case 'materialized_view':
        return <Database className="w-4 h-4 text-blue-600" />;
      default:
        return <TableIcon className="w-4 h-4 text-slate-600" />;
    }
  };

  const getHighlightStyle = () => {
    if (selected) {
      return 'bg-blue-100 border-blue-500 shadow-xl';
    }
    if (isHighlighted) {
      return 'bg-yellow-50 border-yellow-400 shadow-lg';
    }
    return 'bg-white border-slate-300 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 ease-out';
  };

  if (isMinimized) {
    return (
      <div className={`rounded-xl p-3 min-w-[140px] backdrop-blur-sm border-2 ${getHighlightStyle()}`}>
        <Handle type="target" position={Position.Left} className="!w-3 !h-3 !border-2 !border-white" />
        <Handle type="source" position={Position.Right} className="!w-3 !h-3 !border-2 !border-white" />
        
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {getTableTypeIcon()}
            <span className="font-semibold text-sm truncate text-slate-800">{table.name}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsMinimized(false)}
            className="h-7 w-7 p-0 hover:bg-blue-100 transition-colors"
            data-testid="button-expand"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div 
      className={`rounded-xl shadow-lg min-w-[320px] max-w-[450px] cursor-pointer backdrop-blur-sm border-2 ${getHighlightStyle()}`}
      onClick={handleNodeClick}
    >
      <Handle 
        type="target" 
        position={Position.Left} 
        className="!w-4 !h-4 !border-2 !border-white !bg-blue-500 hover:!bg-blue-600 transition-colors" 
      />
      <Handle 
        type="source" 
        position={Position.Right} 
        className="!w-4 !h-4 !border-2 !border-white !bg-blue-500 hover:!bg-blue-600 transition-colors" 
      />
      
      {/* Table Header */}
      <div className="p-5 border-b bg-gradient-to-r from-slate-50 to-slate-100 rounded-t-xl">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-white rounded-lg shadow-sm">
              {getTableTypeIcon()}
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">{table.name}</h3>
              <div className="text-xs text-slate-600">
                {table.databaseId && table.schemaId ? `${table.databaseId}.${table.schemaId}` : ''}
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggleExpand}
              className="h-8 w-8 p-0 hover:bg-blue-100 transition-colors rounded-lg"
              data-testid={isExpanded ? "button-collapse" : "button-expand"}
            >
              {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-600" /> : <ChevronRight className="w-4 h-4 text-slate-600" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMinimized(true)}
              className="h-8 w-8 p-0 hover:bg-slate-100 transition-colors rounded-lg"
              data-testid="button-minimize"
            >
              <Minus className="w-4 h-4 text-slate-600" />
            </Button>
          </div>
        </div>
        
        {table.description && (
          <p className="text-sm text-slate-700 mb-3 leading-relaxed">{table.description}</p>
        )}
        
        <div className="flex items-center space-x-4 text-sm">
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            <span className="capitalize text-slate-600 font-medium">{table.tableType?.replace('_', ' ') || 'Table'}</span>
          </div>
          {table.rowCount && table.rowCount > 0 && (
            <div className="flex items-center space-x-1">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-slate-600 font-medium">{table.rowCount.toLocaleString()} rows</span>
            </div>
          )}
        </div>
      </div>

      {/* Expanded Columns Section */}
      {isExpanded && (
        <div 
          className="p-5 border-t column-scroll-container resize-y"
          style={{ 
            height: '300px',
            minHeight: '200px',
            maxHeight: '500px',
            overflowY: 'auto',
            scrollbarWidth: 'thin',
            scrollbarColor: '#cbd5e1 #f1f5f9',
            resize: 'vertical'
          }}
          onWheel={(e) => {
            e.stopPropagation();
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
          }}
          onMouseMove={(e) => {
            e.stopPropagation();
          }}
        >
          {isLoading ? (
            <div className="text-sm text-slate-500 py-4 text-center">Loading columns...</div>
          ) : columns.length === 0 ? (
            <div className="text-sm text-slate-500 py-4 text-center">No columns found</div>
          ) : (
            <div className="space-y-2">
              <div className="text-sm font-semibold text-slate-800 mb-3 flex items-center space-x-2">
                <div className="w-1 h-4 bg-blue-500 rounded-full"></div>
                <span>Columns ({columns.length})</span>
              </div>
              {columns.map((column, index) => {
                const columnId = column.id || column.column_id || `${table.id}_${column.name || column.column_name}_${index}`;
                const columnName = column.name || column.column_name || '';
                const dataType = column.dataType || column.data_type || '';
                const isColumnHighlighted = highlightedColumns?.has(columnId);
                const isColumnSelected = selectedColumn === columnId;
                
                return (
                  <div
                    key={columnId}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleColumnClick(columnId);
                    }}
                    className={`
                      p-3 rounded-lg cursor-pointer text-sm transition-all duration-300 transform
                      ${isColumnSelected 
                        ? 'bg-blue-100 border border-blue-300 shadow-md' 
                        : isColumnHighlighted 
                        ? 'bg-yellow-50 border border-yellow-200 shadow-sm' 
                        : 'hover:bg-gradient-to-r hover:from-slate-50 hover:to-slate-100 hover:shadow-md hover:scale-[1.01] border border-transparent'
                      }
                    `}
                    data-testid={`column-${columnName}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3 flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <div className="w-2 h-2 bg-slate-400 rounded-full"></div>
                          <span className="font-mono font-semibold truncate text-slate-800">{columnName}</span>
                        </div>
                        {dataType && (
                          <span className="text-slate-600 text-sm font-medium bg-slate-100 px-2 py-1 rounded">{dataType}</span>
                        )}
                      </div>
                      
                      <div className="flex items-center space-x-2 ml-3">
                        {column.isPrimaryKey && (
                          <Badge variant="outline" className="text-xs px-2 py-1 bg-amber-50 text-amber-700 border-amber-200 font-medium">PK</Badge>
                        )}
                        {column.isNullable === false && (
                          <Badge variant="outline" className="text-xs px-2 py-1 bg-blue-50 text-blue-700 border-blue-200 font-medium">NN</Badge>
                        )}
                        {column.dataClassification === 'sensitive' && (
                          <Shield className="w-4 h-4 text-red-500" />
                        )}
                      </div>
                    </div>
                    
                    {column.description && (
                      <div className="text-slate-600 text-sm mt-2 leading-relaxed">
                        {column.description}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
});