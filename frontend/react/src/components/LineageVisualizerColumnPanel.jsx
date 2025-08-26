import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, ArrowUp, ArrowDown, Database, Table } from 'lucide-react';

const LineageVisualizerColumnPanel = ({ columnId, tableId, position, onClose }) => {
  const apiBase = import.meta.env.VITE_API_URL || '/api/snowpark';

  // Fetch column lineage data
  const { data: lineageData, isLoading, error } = useQuery({
    queryKey: ['column-lineage-detail', columnId],
    queryFn: async () => {
      const response = await fetch(`${apiBase}/lineage/enhanced-object?object_id=${columnId}&depth=2`);
      if (!response.ok) {
        throw new Error('Failed to fetch column lineage');
      }
      return response.json();
    },
    enabled: !!columnId
  });

  // Process lineage data to separate upstream and downstream
  const { upstreamData, downstreamData } = React.useMemo(() => {
    if (!lineageData?.edges) {
      return { upstreamData: [], downstreamData: [] };
    }

    const upstream = [];
    const downstream = [];

    lineageData.edges.forEach(edge => {
      if (edge.tgt_object_id === columnId || edge.target === columnId) {
        upstream.push({
          id: edge.edge_id || edge.id,
          sourceId: edge.src_object_id || edge.source,
          sourceName: edge.src_object_name || edge.source,
          transformationType: edge.edge_kind || edge.edge_type || 'transform',
          sourceTable: edge.src_table_name || ''
        });
      } else if (edge.src_object_id === columnId || edge.source === columnId) {
        downstream.push({
          id: edge.edge_id || edge.id,
          targetId: edge.tgt_object_id || edge.target,
          targetName: edge.tgt_object_name || edge.target,
          transformationType: edge.edge_kind || edge.edge_type || 'transform',
          targetTable: edge.tgt_table_name || ''
        });
      }
    });

    return { upstreamData: upstream, downstreamData: downstream };
  }, [lineageData, columnId]);

  if (!columnId) return null;

  const panelStyle = position 
    ? {
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: 1000
      }
    : {
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: 1000
      };

  return (
    <div 
      className="bg-white border rounded-lg shadow-lg w-80 max-h-96 overflow-hidden"
      style={panelStyle}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-blue-50 to-blue-100">
        <div>
          <h3 className="font-semibold text-gray-900 flex items-center">
            <Database className="w-4 h-4 mr-2 text-blue-600" />
            Column Lineage
          </h3>
          <p className="text-xs text-gray-600 mt-1">Upstream and downstream dependencies</p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700 p-1 hover:bg-white hover:bg-opacity-50 rounded transition-colors"
          title="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 overflow-y-auto max-h-80">
        {isLoading && (
          <div className="text-center py-4 text-gray-500 text-sm">
            <div className="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2"></div>
            Loading lineage...
          </div>
        )}

        {error && (
          <div className="text-center py-4 text-red-500 text-sm">
            <div className="mb-2">⚠️</div>
            Error: {error.message}
          </div>
        )}

        {!isLoading && !error && (
          <div className="space-y-4">
            {/* Upstream Section */}
            {upstreamData.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
                  <ArrowUp className="w-4 h-4 mr-2 text-green-600" />
                  Upstream ({upstreamData.length})
                </h4>
                <div className="space-y-2">
                  {upstreamData.slice(0, 5).map((item, index) => (
                    <div key={item.id || index} className="p-3 bg-green-50 rounded-lg border border-green-200">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="font-mono text-sm text-gray-800 truncate" title={item.sourceName}>
                            {item.sourceName}
                          </div>
                          {item.sourceTable && (
                            <div className="text-xs text-green-600 mt-1 flex items-center">
                              <Table className="w-3 h-3 mr-1" />
                              {item.sourceTable}
                            </div>
                          )}
                        </div>
                        {item.transformationType && (
                          <div className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded ml-2 flex-shrink-0">
                            {item.transformationType}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {upstreamData.length > 5 && (
                    <div className="text-xs text-gray-500 text-center py-2">
                      +{upstreamData.length - 5} more upstream dependencies
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Downstream Section */}
            {downstreamData.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
                  <ArrowDown className="w-4 h-4 mr-2 text-blue-600" />
                  Downstream ({downstreamData.length})
                </h4>
                <div className="space-y-2">
                  {downstreamData.slice(0, 5).map((item, index) => (
                    <div key={item.id || index} className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="font-mono text-sm text-gray-800 truncate" title={item.targetName}>
                            {item.targetName}
                          </div>
                          {item.targetTable && (
                            <div className="text-xs text-blue-600 mt-1 flex items-center">
                              <Table className="w-3 h-3 mr-1" />
                              {item.targetTable}
                            </div>
                          )}
                        </div>
                        {item.transformationType && (
                          <div className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded ml-2 flex-shrink-0">
                            {item.transformationType}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {downstreamData.length > 5 && (
                    <div className="text-xs text-gray-500 text-center py-2">
                      +{downstreamData.length - 5} more downstream dependencies
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* No Data State */}
            {upstreamData.length === 0 && downstreamData.length === 0 && !isLoading && (
              <div className="text-center py-8 text-gray-500">
                <Database className="w-8 h-8 mx-auto mb-3 text-gray-300" />
                <div className="text-sm">No lineage data found</div>
                <div className="text-xs text-gray-400 mt-1">This column may not have tracked dependencies</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 bg-gray-50 border-t text-xs text-gray-600">
        <div className="flex items-center justify-between">
          <span>Real-time from ACCOUNT_USAGE</span>
          <span className="flex items-center">
            <div className="w-2 h-2 bg-green-500 rounded-full mr-1"></div>
            Live Data
          </span>
        </div>
      </div>
    </div>
  );
};

export default LineageVisualizerColumnPanel;