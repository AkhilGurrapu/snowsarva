import React, { memo, useState, useCallback, useEffect } from "react";
import { Handle, Position } from "@xyflow/react";
import { ChevronDown, ChevronRight, Table as TableIcon, Eye, Database, Shield, Tag, Plus, Minus } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { cn } from "../utils/cn";

const EnhancedTableNode = memo(function EnhancedTableNode({ data, selected }) {
  const { 
    object_name: tableName,
    database_name: databaseName,
    schema_name: schemaName,
    object_type: tableType,
    metadata,
    isExpanded: initialExpanded = false,
    isHighlighted = false,
    selectedColumn,
    highlightedColumns = new Set(),
    onColumnSelect,
    onToggleExpand
  } = data;

  const [isExpanded, setIsExpanded] = useState(initialExpanded);
  const [isMinimized, setIsMinimized] = useState(false);
  const [columns, setColumns] = useState([]);
  const [isLoadingColumns, setIsLoadingColumns] = useState(false);

  // Extract metadata if available
  const parsedMetadata = typeof metadata === 'string' ? JSON.parse(metadata || '{}') : metadata || {};
  const rowCount = parsedMetadata.row_count || parsedMetadata.rowCount;
  const description = parsedMetadata.description;
  const tags = parsedMetadata.tags || [];
  const dataClassification = parsedMetadata.data_classification || parsedMetadata.dataClassification;

  // Load columns when expanded
  useEffect(() => {
    if (isExpanded && columns.length === 0) {
      setIsLoadingColumns(true);
      
      // Try to fetch columns from the enhanced lineage API
      const fetchColumns = async () => {
        try {
          const response = await fetch(`/api/snowpark/lineage/enhanced-object?` + new URLSearchParams({
            object_name: tableName,
            database_name: databaseName,
            schema_name: schemaName,
            lineage_type: 'columns'
          }));
          
          if (response.ok) {
            const result = await response.json();
            setColumns(result.columns || []);
          } else {
            // Fallback - try to extract from existing metadata
            const columnData = parsedMetadata.columns || [];
            setColumns(columnData);
          }
        } catch (error) {
          console.error('Failed to fetch columns:', error);
          // Use metadata as fallback
          const columnData = parsedMetadata.columns || [];
          setColumns(columnData);
        } finally {
          setIsLoadingColumns(false);
        }
      };

      fetchColumns();
    }
  }, [isExpanded, tableName, databaseName, schemaName, columns.length, parsedMetadata.columns]);

  const handleToggleExpand = useCallback((e) => {
    e?.stopPropagation();
    const newExpanded = !isExpanded;
    setIsExpanded(newExpanded);
    onToggleExpand?.(data.id, newExpanded);
  }, [isExpanded, data.id, onToggleExpand]);

  const handleNodeClick = useCallback((e) => {
    e.stopPropagation();
    if (!isExpanded) {
      setIsExpanded(true);
      onToggleExpand?.(data.id, true);
    }
  }, [isExpanded, data.id, onToggleExpand]);

  const handleColumnClick = useCallback((columnName) => {
    onColumnSelect?.(columnName, data.id);
  }, [onColumnSelect, data.id]);

  const getTableTypeIcon = () => {
    const type = tableType?.toLowerCase();
    switch (type) {
      case 'view':
        return <Eye className="w-4 h-4 text-green-600" />;
      case 'materialized_view':
        return <Database className="w-4 h-4 text-blue-600" />;
      default:
        return <TableIcon className="w-4 h-4 text-slate-600" />;
    }
  };

  const getHighlightStyle = () => {
    if (selected) {
      return 'border-blue-500 bg-gradient-to-br from-blue-50 to-blue-100 shadow-lg scale-105';
    }
    if (isHighlighted) {
      return 'border-orange-500 bg-gradient-to-br from-orange-50 to-orange-100 shadow-lg scale-105';
    }
    return 'border-slate-200 bg-gradient-to-br from-white to-slate-50 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 ease-out';
  };

  if (isMinimized) {
    return (
      <div className={cn(
        "rounded-xl p-3 min-w-[140px] backdrop-blur-sm border-2 cursor-pointer",
        getHighlightStyle()
      )}>
        <Handle 
          type="target" 
          position={Position.Left} 
          className="!w-3 !h-3 !border-2 !border-white" 
        />
        <Handle 
          type="source" 
          position={Position.Right} 
          className="!w-3 !h-3 !border-2 !border-white" 
        />
        
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {getTableTypeIcon()}
            <span className="font-semibold text-sm truncate text-slate-800">{tableName}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsMinimized(false)}
            className="h-7 w-7 p-0 hover:bg-blue-100 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div 
      className={cn(
        "rounded-xl shadow-lg min-w-[320px] max-w-[450px] cursor-pointer backdrop-blur-sm border-2",
        getHighlightStyle()
      )}
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
            <div className="flex flex-col">
              <h3 className="font-bold text-slate-900 text-base">{tableName}</h3>
              {databaseName && schemaName && (
                <span className="text-xs text-slate-500">{databaseName}.{schemaName}</span>
              )}
            </div>
            {dataClassification && (
              <Badge variant="outline" className="text-xs bg-gradient-to-r from-slate-100 to-slate-200 text-slate-700 border-slate-300 shadow-sm">
                <Shield className="w-3 h-3 mr-1 text-slate-600" />
                {dataClassification}
              </Badge>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggleExpand}
              className="h-8 w-8 p-0 hover:bg-blue-100 transition-colors rounded-lg"
            >
              {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-600" /> : <ChevronRight className="w-4 h-4 text-slate-600" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setIsMinimized(true);
              }}
              className="h-8 w-8 p-0 hover:bg-slate-100 transition-colors rounded-lg"
            >
              <Minus className="w-4 h-4 text-slate-600" />
            </Button>
          </div>
        </div>
        
        {description && (
          <p className="text-sm text-slate-700 mb-3 leading-relaxed">{description}</p>
        )}
        
        <div className="flex items-center space-x-4 text-sm">
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            <span className="capitalize text-slate-600 font-medium">
              {tableType?.replace('_', ' ').toLowerCase()}
            </span>
          </div>
          {rowCount && (
            <div className="flex items-center space-x-1">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-slate-600 font-medium">{rowCount.toLocaleString()} rows</span>
            </div>
          )}
        </div>

        {Array.isArray(tags) && tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {tags.slice(0, 3).map((tag, index) => (
              <Badge key={index} variant="secondary" className="text-xs px-2 py-1 bg-gradient-to-r from-blue-50 to-blue-100 text-blue-700 border-blue-200">
                <Tag className="w-3 h-3 mr-1" />
                {tag}
              </Badge>
            ))}
            {tags.length > 3 && (
              <Badge variant="secondary" className="text-xs px-2 py-1 bg-gradient-to-r from-slate-100 to-slate-200 text-slate-700">
                +{tags.length - 3}
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Expanded Columns Section */}
      {isExpanded && (
        <div className="border-t">
          <ScrollArea className="h-[300px] max-h-[500px] p-5">
            {isLoadingColumns ? (
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
                  // Handle both object and simple string formats
                  const columnName = typeof column === 'object' ? column.name || column.column_name : column;
                  const dataType = typeof column === 'object' ? column.dataType || column.data_type : '';
                  const isPrimaryKey = typeof column === 'object' ? column.isPrimaryKey || column.is_primary_key : false;
                  const isNullable = typeof column === 'object' ? column.isNullable !== false && column.is_nullable !== false : true;
                  const columnDescription = typeof column === 'object' ? column.description : '';
                  const classification = typeof column === 'object' ? column.dataClassification || column.data_classification : '';
                  
                  const isColumnHighlighted = highlightedColumns.has(columnName);
                  const isColumnSelected = selectedColumn === columnName;
                  
                  return (
                    <div
                      key={index}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleColumnClick(columnName);
                      }}
                      className={cn(
                        "p-3 rounded-lg cursor-pointer text-sm transition-all duration-300 transform border",
                        isColumnSelected 
                          ? 'bg-blue-100 border-blue-300 shadow-md scale-[1.02]' 
                          : isColumnHighlighted 
                          ? 'bg-orange-100 border-orange-300 shadow-md scale-[1.02]' 
                          : 'hover:bg-gradient-to-r hover:from-slate-50 hover:to-slate-100 hover:shadow-md hover:scale-[1.01] border-transparent'
                      )}
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
                          {isPrimaryKey && (
                            <Badge variant="outline" className="text-xs px-2 py-1 bg-amber-50 text-amber-700 border-amber-200 font-medium">PK</Badge>
                          )}
                          {!isNullable && (
                            <Badge variant="outline" className="text-xs px-2 py-1 bg-blue-50 text-blue-700 border-blue-200 font-medium">NN</Badge>
                          )}
                          {classification === 'sensitive' && (
                            <Shield className="w-4 h-4 text-red-500" />
                          )}
                        </div>
                      </div>
                      
                      {columnDescription && (
                        <div className="text-slate-600 text-sm mt-2 leading-relaxed">
                          {columnDescription}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  );
});

export default EnhancedTableNode;