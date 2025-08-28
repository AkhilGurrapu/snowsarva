import React, { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { X, ArrowUp, ArrowDown, GitBranch, Table, Database, Shield } from "lucide-react";
import { cn } from "../utils/cn";

const ColumnLineagePanel = ({ columnName, tableId, tableName, position, onClose }) => {
  const [upstreamLineage, setUpstreamLineage] = useState([]);
  const [downstreamLineage, setDownstreamLineage] = useState([]);
  const [loading, setLoading] = useState(true);
  const [columnDetails, setColumnDetails] = useState(null);

  useEffect(() => {
    const fetchColumnLineage = async () => {
      try {
        setLoading(true);
        
        // Try to fetch column-level lineage from the enhanced API
        const response = await fetch('/api/snowpark/lineage/enhanced-object?' + new URLSearchParams({
          object_name: tableName,
          column_name: columnName,
          lineage_type: 'column'
        }));
        
        if (response.ok) {
          const data = await response.json();
          
          // Extract upstream and downstream lineage from the response
          const upstream = data.upstream_lineage || [];
          const downstream = data.downstream_lineage || [];
          
          setUpstreamLineage(upstream);
          setDownstreamLineage(downstream);
          setColumnDetails(data.column_details || {});
        } else {
          // Fallback: try SQL parsing for lineage
          const fallbackResponse = await fetch('/api/snowpark/lineage/sql-parse', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              sql_text: `SELECT ${columnName} FROM ${tableName}`,
              source_table: tableName
            })
          });
          
          if (fallbackResponse.ok) {
            const fallbackData = await fallbackResponse.json();
            setUpstreamLineage(fallbackData.upstream_columns || []);
            setDownstreamLineage(fallbackData.downstream_columns || []);
          }
        }
        
      } catch (error) {
        console.error('Failed to fetch column lineage:', error);
        // Set empty arrays on error
        setUpstreamLineage([]);
        setDownstreamLineage([]);
      } finally {
        setLoading(false);
      }
    };

    if (columnName && tableName) {
      fetchColumnLineage();
    }
  }, [columnName, tableName]);

  // Calculate position to avoid going off screen
  const calculatePosition = () => {
    if (!position) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    
    const panelWidth = 280;
    const panelHeight = 300;
    const margin = 10;
    
    let top = Math.max(position.y - 50, margin);
    let left = Math.min(position.x + 30, window.innerWidth - panelWidth - margin);
    
    // Adjust if panel goes off bottom
    if (top + panelHeight > window.innerHeight - margin) {
      top = window.innerHeight - panelHeight - margin;
    }
    
    return { top, left };
  };

  const positionStyle = calculatePosition();

  return (
    <div 
      className="fixed z-50 bg-white rounded-lg shadow-xl border w-[280px] max-h-[300px] overflow-y-auto"
      style={positionStyle}
    >
      {/* Header */}
      <div className="p-3 border-b bg-gradient-to-r from-slate-50 to-slate-100 rounded-t-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <GitBranch className="w-4 h-4 text-blue-600" />
            <div>
              <h3 className="font-semibold text-sm text-slate-900">{columnName}</h3>
              <p className="text-xs text-slate-600">{tableName}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="p-1 h-7 w-7 hover:bg-slate-200">
            <X className="w-4 h-4" />
          </Button>
        </div>
        
        {columnDetails && (
          <div className="flex items-center space-x-2 mt-2">
            {columnDetails.data_type && (
              <Badge variant="secondary" className="text-xs">
                {columnDetails.data_type}
              </Badge>
            )}
            {columnDetails.is_nullable === false && (
              <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                NOT NULL
              </Badge>
            )}
            {columnDetails.data_classification === 'sensitive' && (
              <Shield className="w-3 h-3 text-red-500" />
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3 space-y-3">
        {loading ? (
          <div className="text-center text-slate-500 py-4 text-sm">
            Loading lineage...
          </div>
        ) : (
          <>
            {/* Upstream */}
            {upstreamLineage.length > 0 && (
              <div>
                <div className="flex items-center space-x-2 mb-2">
                  <ArrowUp className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium text-slate-800">
                    Sources ({upstreamLineage.length})
                  </span>
                </div>
                <div className="space-y-2 ml-6">
                  {upstreamLineage.slice(0, 3).map((lineage, index) => {
                    // Handle different data formats
                    const sourceColumn = lineage.src_column || lineage.source_column_name || lineage.column_name;
                    const sourceTable = lineage.src_object_name || lineage.source_table_name || lineage.table_name;
                    const sourceSchema = lineage.src_schema_name || lineage.source_schema_name;
                    const sourceDatabase = lineage.src_database_name || lineage.source_database_name;
                    
                    return (
                      <div key={index} className="text-xs bg-green-50 p-2 rounded border border-green-200">
                        <div className="font-mono font-semibold text-green-800">
                          {sourceColumn}
                        </div>
                        <div className="text-slate-600 mt-1">
                          <span className="text-slate-500">from </span>
                          <span className="font-medium">
                            {sourceDatabase && sourceSchema 
                              ? `${sourceDatabase}.${sourceSchema}.${sourceTable}`
                              : sourceTable
                            }
                          </span>
                        </div>
                        {lineage.transformation_type && (
                          <Badge variant="outline" className="text-xs mt-1 bg-white">
                            {lineage.transformation_type.replace('_', ' ').toLowerCase()}
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                  {upstreamLineage.length > 3 && (
                    <div className="text-xs text-slate-400 bg-slate-50 p-2 rounded">
                      +{upstreamLineage.length - 3} more sources
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Downstream */}
            {downstreamLineage.length > 0 && (
              <div>
                <div className="flex items-center space-x-2 mb-2">
                  <ArrowDown className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-slate-800">
                    Targets ({downstreamLineage.length})
                  </span>
                </div>
                <div className="space-y-2 ml-6">
                  {downstreamLineage.slice(0, 3).map((lineage, index) => {
                    // Handle different data formats  
                    const targetColumn = lineage.tgt_column || lineage.target_column_name || lineage.column_name;
                    const targetTable = lineage.tgt_object_name || lineage.target_table_name || lineage.table_name;
                    const targetSchema = lineage.tgt_schema_name || lineage.target_schema_name;
                    const targetDatabase = lineage.tgt_database_name || lineage.target_database_name;
                    
                    return (
                      <div key={index} className="text-xs bg-blue-50 p-2 rounded border border-blue-200">
                        <div className="font-mono font-semibold text-blue-800">
                          {targetColumn}
                        </div>
                        <div className="text-slate-600 mt-1">
                          <span className="text-slate-500">in </span>
                          <span className="font-medium">
                            {targetDatabase && targetSchema 
                              ? `${targetDatabase}.${targetSchema}.${targetTable}`
                              : targetTable
                            }
                          </span>
                        </div>
                        {lineage.transformation_type && (
                          <Badge variant="outline" className="text-xs mt-1 bg-white">
                            {lineage.transformation_type.replace('_', ' ').toLowerCase()}
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                  {downstreamLineage.length > 3 && (
                    <div className="text-xs text-slate-400 bg-slate-50 p-2 rounded">
                      +{downstreamLineage.length - 3} more targets
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* No lineage */}
            {upstreamLineage.length === 0 && downstreamLineage.length === 0 && (
              <div className="text-sm text-slate-500 text-center py-4 bg-slate-50 rounded">
                <Database className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                <p>No lineage connections found</p>
                <p className="text-xs mt-1">
                  This column may be a source column or not yet analyzed
                </p>
              </div>
            )}
            
            {/* Show suggestion for manual SQL parsing */}
            {upstreamLineage.length === 0 && downstreamLineage.length === 0 && (
              <div className="text-xs text-slate-400 text-center pt-2 border-t">
                💡 Try the SQL Parser tab to analyze specific queries
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ColumnLineagePanel;