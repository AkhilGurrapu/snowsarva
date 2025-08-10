import React, { useRef, useState, useMemo, useCallback } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { 
  Text, 
  OrbitControls, 
  Html, 
  Box, 
  Cylinder,
  Sphere,
  Environment,
  Effects
} from '@react-three/drei'
import { motion } from 'framer-motion'
import * as THREE from 'three'

// 3D Bar Chart Component for Warehouse Costs
const WarehouseBar3D = ({ warehouse, costs, position, maxCost, onClick }) => {
  const meshRef = useRef()
  const [hovered, setHovered] = useState(false)
  
  const height = (costs.total_credits / maxCost) * 8 + 0.5
  const color = `hsl(${210 - (costs.total_credits / maxCost) * 60}, 70%, 60%)`
  
  useFrame((state) => {
    if (meshRef.current) {
      if (hovered) {
        meshRef.current.rotation.y = state.clock.elapsedTime * 2
        meshRef.current.position.y = height / 2 + 0.2
      } else {
        meshRef.current.rotation.y = 0
        meshRef.current.position.y = height / 2
      }
    }
  })

  return (
    <group position={position}>
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation()
          onClick?.(warehouse, costs)
        }}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <Box args={[1.5, height, 1.5]} />
        <meshStandardMaterial 
          color={color} 
          transparent
          opacity={hovered ? 0.9 : 0.7}
          emissive={color}
          emissiveIntensity={hovered ? 0.1 : 0.05}
        />
      </mesh>
      
      {/* Warehouse name label */}
      <Html distanceFactor={8} position={[0, -1, 0]}>
        <div className={`
          px-2 py-1 rounded text-xs font-medium text-center transition-all duration-300 pointer-events-none
          ${hovered ? 'bg-white/90 text-gray-900 shadow-lg' : 'bg-gray-800/80 text-white'}
        `}>
          <div className="font-semibold max-w-20 truncate">{warehouse}</div>
        </div>
      </Html>
      
      {/* Cost tooltip */}
      {hovered && (
        <Html distanceFactor={6} position={[0, height + 1, 0]}>
          <div className="bg-white/95 backdrop-blur-sm rounded-lg p-3 shadow-lg text-xs">
            <div className="font-semibold text-gray-900">{warehouse}</div>
            <div className="text-gray-600 mt-1">
              Credits: {costs.total_credits?.toFixed(2)}
            </div>
            <div className="text-gray-600">
              Est. Cost: ${(costs.total_credits * 2)?.toFixed(2)}
            </div>
            <div className="text-gray-600">
              Queries: {costs.usage_periods}
            </div>
          </div>
        </Html>
      )}
    </group>
  )
}

// 3D Pie Chart Component for Storage Distribution
const StoragePieSlice3D = ({ angle, radius, height, color, percentage, label, onHover }) => {
  const meshRef = useRef()
  const [hovered, setHovered] = useState(false)
  
  const startAngle = angle
  const endAngle = angle + (percentage / 100) * Math.PI * 2
  
  useFrame(() => {
    if (meshRef.current && hovered) {
      meshRef.current.position.y = height * 1.1
    } else if (meshRef.current) {
      meshRef.current.position.y = height
    }
  })

  // Create pie slice geometry
  const geometry = useMemo(() => {
    const shape = new THREE.Shape()
    shape.moveTo(0, 0)
    
    const segments = 32
    for (let i = 0; i <= segments; i++) {
      const currentAngle = startAngle + (endAngle - startAngle) * (i / segments)
      const x = Math.cos(currentAngle) * radius
      const y = Math.sin(currentAngle) * radius
      if (i === 0) {
        shape.lineTo(x, y)
      } else {
        shape.lineTo(x, y)
      }
    }
    shape.lineTo(0, 0)
    
    return new THREE.ExtrudeGeometry(shape, {
      depth: height,
      bevelEnabled: false
    })
  }, [startAngle, endAngle, radius, height])

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      onPointerOver={() => {
        setHovered(true)
        onHover?.(label, percentage)
      }}
      onPointerOut={() => setHovered(false)}
    >
      <meshStandardMaterial 
        color={color} 
        transparent
        opacity={hovered ? 0.9 : 0.8}
        emissive={color}
        emissiveIntensity={hovered ? 0.1 : 0}
      />
    </mesh>
  )
}

// Query Performance Bubble Chart
const QueryBubble3D = ({ query, position, maxCost, onClick }) => {
  const meshRef = useRef()
  const [hovered, setHovered] = useState(false)
  
  const size = Math.max(0.3, (query.execution_time / maxCost) * 2)
  const intensity = query.bytes_scanned / (1024 * 1024 * 1024) // GB
  const color = `hsl(${Math.max(0, 120 - intensity * 2)}, 70%, 60%)`
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.position.y = position[1] + (hovered ? 0.5 : 0) + Math.sin(state.clock.elapsedTime + position[0]) * 0.1
      if (hovered) {
        meshRef.current.scale.setScalar(1.3)
      } else {
        meshRef.current.scale.setScalar(1)
      }
    }
  })

  return (
    <group position={position}>
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation()
          onClick?.(query)
        }}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <Sphere args={[size]} />
        <meshStandardMaterial 
          color={color} 
          transparent
          opacity={hovered ? 0.8 : 0.6}
          emissive={color}
          emissiveIntensity={hovered ? 0.2 : 0}
        />
      </mesh>
      
      {hovered && (
        <Html distanceFactor={6} position={[0, size + 1, 0]}>
          <div className="bg-white/95 backdrop-blur-sm rounded-lg p-3 shadow-lg text-xs max-w-48">
            <div className="font-semibold text-gray-900">Query {query.query_id?.substring(0, 8)}...</div>
            <div className="text-gray-600 mt-1">User: {query.user}</div>
            <div className="text-gray-600">Time: {(query.execution_time/1000).toFixed(1)}s</div>
            <div className="text-gray-600">Data: {(query.bytes_scanned/(1024*1024*1024)).toFixed(2)}GB</div>
          </div>
        </Html>
      )}
    </group>
  )
}

// Main FinOps 3D Scene
const FinOpsScene3D = ({ data, visualization, onItemClick }) => {
  const [selectedItem, setSelectedItem] = useState(null)

  const handleItemClick = useCallback((item, details) => {
    setSelectedItem({ item, details })
    onItemClick?.(item, details)
  }, [onItemClick])

  const renderWarehouseCosts = () => {
    if (!data?.warehouse_costs) return null
    
    const warehouses = Object.entries(data.warehouse_costs)
    const maxCost = Math.max(...warehouses.map(([, costs]) => costs.total_credits))
    
    return warehouses.map(([warehouse, costs], index) => {
      const angle = (index / warehouses.length) * Math.PI * 2
      const radius = 6
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      
      return (
        <WarehouseBar3D
          key={warehouse}
          warehouse={warehouse}
          costs={costs}
          position={[x, 0, z]}
          maxCost={maxCost}
          onClick={handleItemClick}
        />
      )
    })
  }

  const renderStorageDistribution = () => {
    if (!data?.total_storage) return null
    
    const storage = data.total_storage
    const total = storage.active + storage.time_travel + storage.failsafe + storage.clone
    
    const segments = [
      { label: 'Active', value: storage.active, color: '#10b981' },
      { label: 'Time Travel', value: storage.time_travel, color: '#f59e0b' },
      { label: 'Failsafe', value: storage.failsafe, color: '#ef4444' },
      { label: 'Clone', value: storage.clone, color: '#8b5cf6' }
    ]
    
    let currentAngle = 0
    
    return segments.map((segment, index) => {
      const percentage = (segment.value / total) * 100
      const slice = (
        <StoragePieSlice3D
          key={segment.label}
          angle={currentAngle}
          radius={4}
          height={1}
          color={segment.color}
          percentage={percentage}
          label={segment.label}
          onHover={(label, pct) => console.log(`${label}: ${pct.toFixed(1)}%`)}
        />
      )
      currentAngle += (percentage / 100) * Math.PI * 2
      return slice
    })
  }

  const renderQueryBubbles = () => {
    if (!data?.expensive_queries) return null
    
    const queries = data.expensive_queries.slice(0, 20) // Limit for performance
    const maxCost = Math.max(...queries.map(q => q.execution_time))
    
    return queries.map((query, index) => {
      // Create random but consistent 3D positions
      const seed = query.query_id?.charCodeAt(0) || index
      const x = (Math.sin(seed) * 8) % 10
      const y = (Math.cos(seed) * 3) % 4
      const z = (Math.sin(seed * 2) * 8) % 10
      
      return (
        <QueryBubble3D
          key={query.query_id || index}
          query={query}
          position={[x, y, z]}
          maxCost={maxCost}
          onClick={handleItemClick}
        />
      )
    })
  }

  return (
    <group>
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      <pointLight position={[-10, -10, -10]} intensity={0.5} />
      <pointLight position={[0, 10, 0]} intensity={0.8} color="#ffffff" />
      
      {/* Grid floor */}
      <gridHelper args={[20, 20, '#64748b', '#94a3b8']} position={[0, -2, 0]} />
      
      {/* Render based on visualization type */}
      {visualization === 'warehouses' && renderWarehouseCosts()}
      {visualization === 'storage' && renderStorageDistribution()}
      {visualization === 'queries' && renderQueryBubbles()}
      
      {/* Central title */}
      <Text
        position={[0, 8, 0]}
        fontSize={1.5}
        color="#1f2937"
        anchorX="center"
        anchorY="middle"
        fontWeight="bold"
      >
        {visualization === 'warehouses' && 'Warehouse Costs'}
        {visualization === 'storage' && 'Storage Distribution'}
        {visualization === 'queries' && 'Query Performance'}
      </Text>
    </group>
  )
}

// Main FinOps3D Component
export default function FinOps3D({ 
  data, 
  visualization = 'warehouses', 
  onItemClick, 
  height = 500 
}) {
  const [isLoading, setIsLoading] = useState(false)

  return (
    <div className="relative">
      <div 
        className="rounded-xl overflow-hidden shadow-2xl bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900"
        style={{ height }}
      >
        <Canvas
          camera={{ position: [12, 8, 12], fov: 60 }}
          gl={{ 
            antialias: true, 
            alpha: true,
            powerPreference: "high-performance"
          }}
        >
          <FinOpsScene3D 
            data={data}
            visualization={visualization}
            onItemClick={onItemClick}
          />
          <OrbitControls 
            enablePan={true}
            enableZoom={true}
            enableRotate={true}
            minDistance={5}
            maxDistance={30}
          />
          <Environment preset="sunset" />
        </Canvas>
      </div>

      {/* Visualization Controls */}
      <motion.div 
        className="absolute top-4 left-4 bg-white/10 backdrop-blur-lg rounded-lg p-3"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="text-xs text-white font-medium mb-2">FinOps 3D</div>
        <div className="space-y-1 text-xs text-white/80">
          {visualization === 'warehouses' && (
            <>
              <div>Height = Credits Used</div>
              <div>Color = Cost Level</div>
            </>
          )}
          {visualization === 'storage' && (
            <>
              <div>Pie = Storage Types</div>
              <div>Size = Total Usage</div>
            </>
          )}
          {visualization === 'queries' && (
            <>
              <div>Size = Execution Time</div>
              <div>Color = Data Scanned</div>
            </>
          )}
        </div>
      </motion.div>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center rounded-xl">
          <div className="bg-white/90 backdrop-blur-sm rounded-lg p-4">
            <div className="animate-spin w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full mx-auto"></div>
            <div className="text-sm text-gray-700 mt-2">Loading 3D FinOps...</div>
          </div>
        </div>
      )}
    </div>
  )
}