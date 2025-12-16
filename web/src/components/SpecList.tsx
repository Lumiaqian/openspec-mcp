import { useState, useEffect } from 'react';
import { specsApi } from '../api/client';

export default function SpecList() {
  const [specs, setSpecs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSpec, setSelectedSpec] = useState<any>(null);

  useEffect(() => {
    async function fetchSpecs() {
      try {
        const res = await specsApi.list();
        setSpecs(res.specs);
      } catch (error) {
        console.error('Failed to fetch specs:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchSpecs();
  }, []);

  const handleViewSpec = async (specId: string) => {
    try {
      const res = await specsApi.get(specId);
      setSelectedSpec(res.spec);
    } catch (error) {
      console.error('Failed to fetch spec:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Specifications</h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Spec List */}
        <div className="lg:col-span-1">
          {specs.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
              No specifications found.
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow divide-y">
              {specs.map((spec) => (
                <button
                  key={spec.id}
                  onClick={() => handleViewSpec(spec.id)}
                  className={`w-full text-left p-4 hover:bg-gray-50 ${
                    selectedSpec?.id === spec.id ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="font-medium text-gray-900">{spec.title}</div>
                  <div className="text-sm text-gray-500">{spec.id}</div>
                  <div className="text-xs text-gray-400 mt-1">
                    {spec.requirementsCount} requirements
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Spec Content */}
        <div className="lg:col-span-2">
          {selectedSpec ? (
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">
                    {selectedSpec.title}
                  </h3>
                  <p className="text-sm text-gray-500">{selectedSpec.id}</p>
                </div>
                <span className="text-xs text-gray-400">
                  Updated: {new Date(selectedSpec.updatedAt).toLocaleDateString()}
                </span>
              </div>
              <pre className="whitespace-pre-wrap text-sm font-mono bg-gray-50 p-4 rounded max-h-[600px] overflow-auto">
                {selectedSpec.content}
              </pre>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
              Select a specification to view
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
