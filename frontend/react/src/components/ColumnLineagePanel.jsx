import React, { useState, useEffect } from 'react';

const ColumnLineagePanel = ({ columnId, tableId, position, onClose }) => {
  const [upstreamData, setUpstreamData] = useState([]);
  const [downstreamData, setDownstreamData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!columnId) return;

    const fetchLineageData = async () => {
      setLoading(true);
      try {
        const apiBase = import.meta.env.VITE_API_URL || '/api/snowpark';
        
        // Try to get column-level lineage if the API exists
        const response = await fetch(`${apiBase}/lineage/enhanced-object?object_id=${columnId}&depth=2`);
        
        if (response.ok) {
          const data = await response.json();
          
          // Process the lineage data to separate upstream and downstream
          const upstream = [];
          const downstream = [];
          
          if (data.edges) {
            data.edges.forEach(edge => {
              if (edge.tgt_object_id === columnId || edge.target === columnId) {
                upstream.push(edge);
              } else if (edge.src_object_id === columnId || edge.source === columnId) {
                downstream.push(edge);
              }
            });
          }
          
          setUpstreamData(upstream);
          setDownstreamData(downstream);
        } else {
          setError('Failed to load lineage data');
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchLineageData();
  }, [columnId]);

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
      className="bg-white border rounded-lg shadow-lg p-4 w-80 max-h-96 overflow-y-auto"
      style={panelStyle}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900">Column Lineage</h3>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700 p-1"
          title="Close"
        >
          ✕
        </button>
      </div>

      {loading && (
        <div className="text-center py-4 text-gray-500">Loading lineage...</div>
      )}

      {error && (
        <div className="text-center py-4 text-red-500">
          Error: {error}
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-4">
          {/* Upstream Section */}
          {upstreamData.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
                <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                Upstream ({upstreamData.length})
              </h4>
              <div className="space-y-1">
                {upstreamData.slice(0, 5).map((edge, index) => (
                  <div key={index} className="text-sm p-2 bg-green-50 rounded border border-green-200">
                    <div className="font-mono text-gray-800">
                      {edge.src_object_name || edge.source}
                    </div>
                    {edge.edge_kind && (
                      <div className="text-xs text-green-600">
                        {edge.edge_kind}
                      </div>
                    )}
                  </div>
                ))}
                {upstreamData.length > 5 && (
                  <div className="text-xs text-gray-500 text-center">
                    +{upstreamData.length - 5} more upstream
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Downstream Section */}
          {downstreamData.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
                <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
                Downstream ({downstreamData.length})
              </h4>
              <div className="space-y-1">
                {downstreamData.slice(0, 5).map((edge, index) => (
                  <div key={index} className="text-sm p-2 bg-blue-50 rounded border border-blue-200">
                    <div className="font-mono text-gray-800">
                      {edge.tgt_object_name || edge.target}
                    </div>
                    {edge.edge_kind && (
                      <div className="text-xs text-blue-600">
                        {edge.edge_kind}
                      </div>
                    )}
                  </div>
                ))}
                {downstreamData.length > 5 && (
                  <div className="text-xs text-gray-500 text-center">
                    +{downstreamData.length - 5} more downstream
                  </div>
                )}
              </div>
            </div>
          )}

          {upstreamData.length === 0 && downstreamData.length === 0 && !loading && (
            <div className="text-center py-4 text-gray-500">
              No lineage data found for this column
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ColumnLineagePanel;