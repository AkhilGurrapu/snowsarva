import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { 
  Text, 
  OrbitControls, 
  Html, 
  Sphere, 
  Box, 
  Line, 
  Effects,
  Environment,
  PerspectiveCamera,
  useHelper,
  Plane
} from '@react-three/drei'
import { motion } from 'framer-motion'
import * as THREE from 'three'

// Node component for different types of data entities
const Node3D = ({ node, position, onClick, isSelected, level }) => {
  const meshRef = useRef()
  const [hovered, setHovered] = useState(false)
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.3
      if (hovered) {
        meshRef.current.scale.setScalar(1.2)
      } else {
        meshRef.current.scale.setScalar(1)
      }
    }
  })

  const getNodeColor = () => {
    switch (node.node_type || node.object_type) {
      case 'DBT_MODEL': return '#10b981'
      case 'COLUMN': return '#3b82f6'
      case 'VIEW': return '#8b5cf6'
      case 'MATERIALIZED_VIEW': return '#f59e0b'
      default: return '#6b7280'
    }
  }

  const getNodeGeometry = () => {
    switch (node.node_type || node.object_type) {
      case 'DBT_MODEL': return <Box args={[1.5, 1.5, 1.5]} />
      case 'COLUMN': return <Sphere args={[0.8]} />
      case 'VIEW': return <Box args={[1.2, 1.2, 1.2]} />
      default: return <Box args={[1, 1, 1]} />
    }
  }

  return (
    <group position={position}>
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation()
          onClick?.(node)
        }}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        {getNodeGeometry()}
        <meshStandardMaterial 
          color={getNodeColor()} 
          transparent
          opacity={isSelected ? 0.9 : 0.7}
          emissive={hovered ? getNodeColor() : '#000000'}
          emissiveIntensity={hovered ? 0.2 : 0}
        />
      </mesh>
      
      {/* Floating label */}
      <Html distanceFactor={10} position={[0, 1.5, 0]}>
        <div className={`
          px-2 py-1 rounded-lg text-xs font-medium transition-all duration-300 pointer-events-none
          ${hovered ? 'bg-white/90 text-gray-900 shadow-lg scale-110' : 'bg-gray-800/80 text-white'}
        `}>
          <div className="font-semibold">
            {node.object_name || node.name || node.column_name || 'Unknown'}
          </div>
          {node.database_name && node.schema_name && (
            <div className="text-xs opacity-75">
              {node.database_name}.{node.schema_name}
            </div>
          )}
        </div>
      </Html>
      
      {/* Glowing effect for selected node */}
      {isSelected && (
        <Sphere args={[2]} position={[0, 0, 0]}>
          <meshBasicMaterial 
            color="#ffffff" 
            transparent 
            opacity={0.1}
            side={THREE.BackSide}
          />
        </Sphere>
      )}
    </group>
  )
}

// Edge component for connections between nodes
const Edge3D = ({ start, end, edge, animated = false }) => {
  const lineRef = useRef()
  
  const points = useMemo(() => [
    new THREE.Vector3(...start),
    new THREE.Vector3(...end)
  ], [start, end])

  const getEdgeColor = () => {
    switch (edge.edge_kind || edge.edge_type) {
      case 'DBT_DEPENDENCY': return '#10b981'
      case 'COLUMN_LINEAGE': return '#3b82f6'
      case 'VIEW_DEPENDENCY': return '#8b5cf6'
      default: return '#64748b'
    }
  }

  useFrame((state) => {
    if (animated && lineRef.current) {
      lineRef.current.material.opacity = 0.3 + 0.3 * Math.sin(state.clock.elapsedTime * 2)
    }
  })

  return (
    <Line
      ref={lineRef}
      points={points}
      color={getEdgeColor()}
      lineWidth={2}
      transparent
      opacity={animated ? 0.6 : 0.4}
    />
  )
}

// Network layout algorithm for 3D space
const calculateLayout = (nodes, edges, options = {}) => {
  const {
    spacing = 8,
    levels = 3,
    radiusMultiplier = 1.5
  } = options

  const nodePositions = new Map()
  
  // Group nodes by hierarchy level or type
  const levelGroups = new Map()
  
  nodes.forEach((node, index) => {
    const level = node.hierarchy_level || 0
    if (!levelGroups.has(level)) {
      levelGroups.set(level, [])
    }
    levelGroups.get(level).push({ node, index })
  })

  // Position nodes in 3D layers
  levelGroups.forEach((nodesInLevel, level) => {
    const radius = (level + 1) * spacing * radiusMultiplier
    const angleStep = (2 * Math.PI) / nodesInLevel.length
    
    nodesInLevel.forEach(({ node, index }, i) => {
      const angle = i * angleStep
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      const y = (level - levels / 2) * spacing * 0.8
      
      nodePositions.set(node.id || node.object_id, [x, y, z])
    })
  })

  return nodePositions
}

// Main 3D Scene Component
const Scene3D = ({ data, onNodeClick, selectedNode, level }) => {
  const { camera } = useThree()
  const [nodePositions, setNodePositions] = useState(new Map())
  
  useEffect(() => {
    if (data?.nodes) {
      // Add hierarchy levels for better layout
      const nodesWithLevels = data.nodes.map(node => ({
        ...node,
        hierarchy_level: calculateHierarchyLevel(node, data.edges || [])
      }))
      
      const positions = calculateLayout(nodesWithLevels, data.edges || [])
      setNodePositions(positions)
    }
  }, [data])

  const calculateHierarchyLevel = (node, edges) => {
    // Simple algorithm: count incoming edges as depth
    const incomingEdges = edges.filter(
      edge => (edge.tgt_object_id || edge.target) === (node.object_id || node.id)
    )
    return Math.min(incomingEdges.length, 4) // Cap at 4 levels
  }

  if (!data?.nodes || data.nodes.length === 0) {
    return (
      <group>
        <Text
          position={[0, 0, 0]}
          fontSize={2}
          color="#64748b"
          anchorX="center"
          anchorY="middle"
        >
          No Data Available
        </Text>
      </group>
    )
  }

  return (
    <group>
      {/* Environment lighting */}
      <ambientLight intensity={0.4} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      <pointLight position={[-10, -10, -10]} intensity={0.5} />
      
      {/* Background plane with gradient */}
      <Plane args={[100, 100]} position={[0, 0, -20]} rotation={[0, 0, 0]}>
        <meshBasicMaterial 
          color="#f8fafc" 
          transparent 
          opacity={0.1}
        />
      </Plane>
      
      {/* Render nodes */}
      {data.nodes.map((node) => {
        const nodeId = node.object_id || node.id
        const position = nodePositions.get(nodeId) || [0, 0, 0]
        
        return (
          <Node3D
            key={nodeId}
            node={node}
            position={position}
            onClick={onNodeClick}
            isSelected={selectedNode?.object_id === nodeId}
            level={level}
          />
        )
      })}
      
      {/* Render edges */}
      {data.edges?.map((edge, index) => {
        const srcId = edge.src_object_id || edge.source
        const tgtId = edge.tgt_object_id || edge.target
        const startPos = nodePositions.get(srcId)
        const endPos = nodePositions.get(tgtId)
        
        if (!startPos || !endPos) return null
        
        return (
          <Edge3D
            key={edge.edge_id || index}
            start={startPos}
            end={endPos}
            edge={edge}
            animated={edge.lineage_source === 'QUERY_HISTORY'}
          />
        )
      })}
    </group>
  )
}

// Main LineageGraph3D Component
export default function LineageGraph3D({ data, level = 'table', onNodeClick, height = 600 }) {
  const [selectedNode, setSelectedNode] = useState(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleNodeClick = useCallback((node) => {
    setSelectedNode(node)
    onNodeClick?.(node)
  }, [onNodeClick])

  const controlsConfig = {
    enablePan: true,
    enableZoom: true,
    enableRotate: true,
    minDistance: 5,
    maxDistance: 100,
    autoRotate: false,
    autoRotateSpeed: 0.5
  }

  return (
    <div className="relative">
      {/* 3D Canvas */}
      <div 
        className="rounded-xl overflow-hidden shadow-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900"
        style={{ height }}
      >
        <Canvas
          camera={{ position: [15, 15, 15], fov: 60 }}
          gl={{ 
            antialias: true, 
            alpha: true,
            powerPreference: "high-performance"
          }}
        >
          <Scene3D 
            data={data} 
            onNodeClick={handleNodeClick}
            selectedNode={selectedNode}
            level={level}
          />
          <OrbitControls {...controlsConfig} />
          <Environment preset="city" />
        </Canvas>
      </div>

      {/* Controls Panel */}
      <motion.div 
        className="absolute top-4 right-4 bg-white/10 backdrop-blur-lg rounded-lg p-3 space-y-2"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="text-xs text-white font-medium">3D Lineage</div>
        <div className="flex gap-2">
          <div className="w-3 h-3 rounded bg-gray-500"></div>
          <span className="text-xs text-white/80">Tables</span>
        </div>
        <div className="flex gap-2">
          <div className="w-3 h-3 rounded bg-green-500"></div>
          <span className="text-xs text-white/80">dbt Models</span>
        </div>
        <div className="flex gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-500"></div>
          <span className="text-xs text-white/80">Columns</span>
        </div>
      </motion.div>

      {/* Node Info Panel */}
      {selectedNode && (
        <motion.div
          className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg p-4 max-w-xs shadow-lg"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
        >
          <div className="font-semibold text-gray-900">
            {selectedNode.object_name || selectedNode.name}
          </div>
          <div className="text-sm text-gray-600 mt-1">
            Type: {selectedNode.node_type || selectedNode.object_type || 'TABLE'}
          </div>
          {selectedNode.database_name && (
            <div className="text-xs text-gray-500 mt-1">
              {selectedNode.database_name}.{selectedNode.schema_name}
            </div>
          )}
          {selectedNode.description && (
            <div className="text-xs text-gray-600 mt-2 max-w-full break-words">
              {selectedNode.description}
            </div>
          )}
        </motion.div>
      )}

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center rounded-xl">
          <div className="bg-white/90 backdrop-blur-sm rounded-lg p-4">
            <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
            <div className="text-sm text-gray-700 mt-2">Loading 3D visualization...</div>
          </div>
        </div>
      )}
    </div>
  )
}