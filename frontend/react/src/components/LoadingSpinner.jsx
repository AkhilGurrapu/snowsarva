import React from 'react'

export default function LoadingSpinner({ size = 'md', text = 'Loading...', color = 'blue' }) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6', 
    lg: 'w-8 h-8'
  }

  const textSizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg'
  }

  const colorClasses = {
    blue: 'text-blue-600',
    gray: 'text-gray-500',
    green: 'text-green-600',
    purple: 'text-purple-600',
    orange: 'text-orange-600'
  }

  return (
    <div className="flex items-center justify-center space-x-2">
      <div className={`${sizeClasses[size]} animate-spin ${colorClasses[color]}`}>
        <svg className="w-full h-full" fill="none" viewBox="0 0 24 24">
          <circle 
            className="opacity-25" 
            cx="12" 
            cy="12" 
            r="10" 
            stroke="currentColor" 
            strokeWidth="4"
          />
          <path 
            className="opacity-75" 
            fill="currentColor" 
            d="m12 2a10 10 0 0 1 10 10h-4a6 6 0 0 0-6-6z"
          />
        </svg>
      </div>
      <span className={`${textSizeClasses[size]} ${colorClasses[color]} font-medium`}>
        {text}
      </span>
    </div>
  )
}

// Skeleton loader for metric cards
export function MetricCardSkeleton() {
  return (
    <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm metric-card animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="h-4 bg-gray-200 rounded w-1/3"></div>
        <div className="w-6 h-6 bg-gray-200 rounded"></div>
      </div>
      <div className="h-8 bg-gray-200 rounded w-1/2 mb-2"></div>
      <div className="h-3 bg-gray-200 rounded w-2/3"></div>
    </div>
  )
}

// Inline loading state for metric values
export function MetricValueLoader({ color = 'blue' }) {
  const colorClasses = {
    blue: 'text-blue-500',
    gray: 'text-gray-400', 
    green: 'text-green-500',
    purple: 'text-purple-500',
    orange: 'text-orange-500'
  }

  return (
    <div className="flex items-center space-x-2">
      <div className={`w-4 h-4 animate-spin ${colorClasses[color]}`}>
        <svg className="w-full h-full" fill="none" viewBox="0 0 24 24">
          <circle 
            className="opacity-25" 
            cx="12" 
            cy="12" 
            r="10" 
            stroke="currentColor" 
            strokeWidth="4"
          />
          <path 
            className="opacity-75" 
            fill="currentColor" 
            d="m12 2a10 10 0 0 1 10 10h-4a6 6 0 0 0-6-6z"
          />
        </svg>
      </div>
      <span className={`text-2xl font-bold ${colorClasses[color]}`}>
        Loading...
      </span>
    </div>
  )
}