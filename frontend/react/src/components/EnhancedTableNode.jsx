import React, { memo, useState, useCallback } from "react";
import { Handle, Position } from "reactflow";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Table as TableIcon, Eye, Database, Shield, Tag, Plus, Minus } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

const apiBase = import.meta.env.VITE_API_URL || '/api/snowpark';

export default memo(function EnhancedTableNode({ data, selected }) {
  const { table, selectedColumn, highlightedColumns, onColumnSelect, isHighlighted, lineageLevel } = data;
  const [isExpanded, setIsExpanded] = useState(false);

  // Fetch columns for this table
  const { data: columns = [] } = useQuery({
    queryKey: ['table-columns', table.id],
    queryFn: async () => {
      const response = await fetch(`${apiBase}/tables/${table.id}/columns`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: isExpanded && !!table.id
  });

  const handleColumnClick = useCallback((columnId) => {
    if (onColumnSelect) {
      onColumnSelect(columnId, table.id);
    }
  }, [onColumnSelect, table.id]);

  const toggleExpanded = useCallback(() => {
    setIsExpanded(!isExpanded);
  }, [isExpanded]);

  const isColumnHighlighted = useCallback((columnId) => {
    return highlightedColumns && highlightedColumns.has(columnId);
  }, [highlightedColumns]);

  const isColumnSelected = useCallback((columnId) => {
    return selectedColumn === columnId;
  }, [selectedColumn]);

  const getTableTypeColor = (tableType) => {
    switch (tableType?.toLowerCase()) {
      case 'table':
        return 'bg-blue-100 text-blue-800';
      case 'view':
        return 'bg-green-100 text-green-800';
      case 'materialized_view':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getLineageLevelColor = (level) => {
    switch (level) {
      case 'source':
        return 'bg-green-100 text-green-800';
      case 'intermediate':
        return 'bg-yellow-100 text-yellow-800';
      case 'target':
        return 'bg-red-100 text-red-800';
      case 'connected':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div
      className={`
        bg-white border-2 rounded-lg shadow-lg min-w-[280px] max-w-[350px]
        ${selected ? 'border-blue-500 shadow-blue-200' : 'border-gray-200'}
        ${isHighlighted ? 'ring-2 ring-blue-300' : ''}
        transition-all duration-200 hover:shadow-xl
      `}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 bg-blue-500 border-2 border-white"
      />

      {/* Table Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <TableIcon className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <span className="font-semibold text-sm text-gray-900 truncate">
              {table.name || table.table_name}
            </span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {lineageLevel && (
              <Badge variant="secondary" className={getLineageLevelColor(lineageLevel)}>
                {lineageLevel}
              </Badge>
            )}
            <Badge variant="secondary" className={getTableTypeColor(table.tableType || table.table_type)}>
              {table.tableType || table.table_type || 'TABLE'}
            </Badge>
          </div>
        </div>

        {/* Table Info */}
        <div className="flex items-center justify-between text-xs text-gray-600">
          <div className="flex items-center gap-2">
            <Database className="w-3 h-3" />
            <span className="truncate">
              {table.database_name || table.databaseId}
            </span>
            <span>•</span>
            <span className="truncate">
              {table.schema_name || table.schemaId}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {table.rowCount !== undefined && (
              <span>{table.rowCount.toLocaleString()} rows</span>
            )}
            {table.bytes !== undefined && (
              <span>{(table.bytes / 1024 / 1024).toFixed(1)} MB</span>
            )}
          </div>
        </div>

        {/* Description */}
        {table.description && (
          <p className="text-xs text-gray-500 mt-2 line-clamp-2">
            {table.description}
          </p>
        )}
      </div>

      {/* Expandable Columns Section */}
      <div className="border-b border-gray-100">
        <button
          onClick={toggleExpanded}
          className="w-full px-4 py-2 flex items-center justify-between text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <span>Columns ({columns.length})</span>
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>

        {isExpanded && (
          <div className="px-4 pb-3 max-h-48 overflow-y-auto">
            {columns.length > 0 ? (
              <div className="space-y-1">
                {columns.map((column) => (
                  <div
                    key={column.id}
                    className={`
                      flex items-center justify-between p-2 rounded text-xs cursor-pointer
                      ${isColumnSelected(column.id) ? 'bg-blue-100 border border-blue-300' : ''}
                      ${isColumnHighlighted(column.id) ? 'bg-yellow-50 border border-yellow-200' : ''}
                      hover:bg-gray-50 transition-colors
                    `}
                    onClick={() => handleColumnClick(column.id)}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="font-medium text-gray-900 truncate">
                        {column.name || column.column_name}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {column.dataType || column.data_type}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {column.isPrimaryKey && (
                        <Shield className="w-3 h-3 text-yellow-600" />
                      )}
                      {!column.isNullable && (
                        <Tag className="w-3 h-3 text-red-600" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-500 text-center py-2">
                No columns available
              </p>
            )}
          </div>
        )}
      </div>

      {/* Table Actions */}
      <div className="p-3 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => console.log('View table details:', table.id)}
          >
            <Eye className="w-3 h-3 mr-1" />
            View
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => console.log('Expand table:', table.id)}
          >
            <Plus className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="w-3 h-3 bg-green-500 border-2 border-white"
      />
    </div>
  );
});