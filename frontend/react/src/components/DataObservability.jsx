import React from 'react'

export default function DataObservability() {
  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Data Quality Monitoring</h2>
        <p className="text-gray-600">Monitor data quality, freshness and completeness across your Snowflake environment.</p>
        
        <div className="mt-6 grid grid-cols-3 gap-4">
          <div className="bg-green-50 p-4 rounded-lg">
            <div className="text-green-600 font-medium">Data Freshness</div>
            <div className="text-2xl font-bold text-green-700">98%</div>
            <div className="text-sm text-green-600">Tables updated on schedule</div>
          </div>
          
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="text-blue-600 font-medium">Completeness</div>
            <div className="text-2xl font-bold text-blue-700">95%</div>
            <div className="text-sm text-blue-600">Non-null required fields</div>
          </div>
          
          <div className="bg-orange-50 p-4 rounded-lg">
            <div className="text-orange-600 font-medium">Schema Changes</div>
            <div className="text-2xl font-bold text-orange-700">3</div>
            <div className="text-sm text-orange-600">Changes this week</div>
          </div>
        </div>
      </div>
      
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Data Quality Tests</h3>
        <div className="text-gray-500">
          Configure and monitor automated data quality tests here.
        </div>
      </div>
    </div>
  )
}