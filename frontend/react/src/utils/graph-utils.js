import dagre from 'dagre';

export const transformationTypes = {
  DIRECT_COPY: 'direct_copy',
  CALCULATION: 'calculation', 
  AGGREGATION: 'aggregation',
  FILTER: 'filter',
  JOIN: 'join',
  UNKNOWN: 'unknown'
};

export const edgeStyles = {
  [transformationTypes.DIRECT_COPY]: {
    stroke: '#10b981', // green-500
    strokeWidth: 2,
    strokeDasharray: 'none',
    animated: false
  },
  [transformationTypes.CALCULATION]: {
    stroke: '#3b82f6', // blue-500  
    strokeWidth: 2,
    strokeDasharray: '5,5',
    animated: false
  },
  [transformationTypes.AGGREGATION]: {
    stroke: '#8b5cf6', // violet-500
    strokeWidth: 3,
    strokeDasharray: 'none', 
    animated: false
  },
  [transformationTypes.FILTER]: {
    stroke: '#f59e0b', // amber-500
    strokeWidth: 2,
    strokeDasharray: '2,3',
    animated: false
  },
  [transformationTypes.JOIN]: {
    stroke: '#ef4444', // red-500
    strokeWidth: 2,
    strokeDasharray: 'none',
    animated: false
  },
  [transformationTypes.UNKNOWN]: {
    stroke: '#6b7280', // gray-500
    strokeWidth: 1,
    strokeDasharray: '3,3',
    animated: false
  }
};

export const getLayoutedElements = (nodes, edges, direction = 'TB') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  const nodeWidth = 220;
  const nodeHeight = 150;

  dagreGraph.setGraph({ 
    rankdir: direction,
    nodesep: 50,
    ranksep: 80,
    marginy: 50,
    marginx: 50
  });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { 
      width: nodeWidth, 
      height: node.data?.isExpanded ? nodeHeight * 1.5 : nodeHeight
    });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      targetPosition: direction === 'TB' ? 'top' : 'left',
      sourcePosition: direction === 'TB' ? 'bottom' : 'right',
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    };
  });

  // Add jitter for organic layout
  const layoutedNodesWithJitter = layoutedNodes.map(node => ({
    ...node,
    position: {
      x: node.position.x + (Math.random() - 0.5) * 20,
      y: node.position.y + (Math.random() - 0.5) * 20,
    }
  }));

  return { nodes: layoutedNodesWithJitter, edges };
};

export const getEdgeStyle = (edgeType = transformationTypes.UNKNOWN, isHighlighted = false) => {
  const baseStyle = edgeStyles[edgeType] || edgeStyles[transformationTypes.UNKNOWN];
  
  return {
    ...baseStyle,
    stroke: isHighlighted ? '#ff6b35' : baseStyle.stroke,
    strokeWidth: isHighlighted ? baseStyle.strokeWidth + 1 : baseStyle.strokeWidth,
    animated: isHighlighted,
    style: {
      strokeWidth: isHighlighted ? baseStyle.strokeWidth + 1 : baseStyle.strokeWidth,
    }
  };
};

export const getNodeType = (nodeData) => {
  if (nodeData?.node_type === 'COLUMN') return 'column';
  if (nodeData?.node_type === 'DBT_MODEL') return 'dbtModel';
  return 'table';
};

export const createNodeData = (nodeInfo, isExpanded = false, isHighlighted = false) => {
  return {
    id: nodeInfo.object_id || nodeInfo.id,
    type: getNodeType(nodeInfo),
    position: { x: 0, y: 0 },
    data: {
      ...nodeInfo,
      isExpanded,
      isHighlighted,
      onToggleExpand: (nodeId) => {
        // This will be passed from parent component
      },
      onColumnClick: (nodeId, columnName) => {
        // This will be passed from parent component
      }
    },
  };
};

export const filterLineageByDepth = (nodes, edges, rootNodeId, maxDepth = 3) => {
  const visited = new Set();
  const validNodes = new Set([rootNodeId]);
  const validEdges = new Set();
  
  const traverse = (nodeId, depth, direction) => {
    if (depth > maxDepth || visited.has(`${nodeId}-${direction}`)) return;
    visited.add(`${nodeId}-${direction}`);

    edges.forEach(edge => {
      if (direction === 'downstream' && edge.source === nodeId) {
        validNodes.add(edge.target);
        validEdges.add(edge.id);
        traverse(edge.target, depth + 1, direction);
      } else if (direction === 'upstream' && edge.target === nodeId) {
        validNodes.add(edge.source);
        validEdges.add(edge.id);
        traverse(edge.source, depth + 1, direction);
      }
    });
  };

  traverse(rootNodeId, 0, 'upstream');
  traverse(rootNodeId, 0, 'downstream');

  return {
    nodes: nodes.filter(node => validNodes.has(node.id)),
    edges: edges.filter(edge => validEdges.has(edge.id))
  };
};