import { useMemo } from 'react';
import YAML from 'yaml';

interface ServiceChange {
  type: string;
  desc: string;
  file?: string;
}

interface Service {
  name: string;
  role: string;
  status: string;
  database?: string;
  tables?: string[];
  changes: ServiceChange[];
  dependencies?: string[];
}

interface DeploymentStep {
  step: number;
  name: string;
  desc: string;
  rollback?: string;
}

interface ServicesConfig {
  feature: {
    name: string;
    description: string;
    jira?: string;
    version?: string;
    updated?: string;
  };
  services: Service[];
  deployment?: {
    order: DeploymentStep[];
  };
}

interface ServicesYamlViewProps {
  content: string;
}

const statusColors: Record<string, { bg: string; text: string; label: string }> = {
  design_complete: { bg: 'bg-blue-100', text: 'text-blue-700', label: '设计完成' },
  in_progress: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: '开发中' },
  done: { bg: 'bg-green-100', text: 'text-green-700', label: '已完成' },
  pending: { bg: 'bg-gray-100', text: 'text-gray-600', label: '待开始' },
};

const roleIcons: Record<string, string> = {
  gateway: '🌐',
  service: '⚙️',
  job: '⏰',
};

export default function ServicesYamlView({ content }: ServicesYamlViewProps) {
  const config = useMemo(() => {
    try {
      return YAML.parse(content) as ServicesConfig;
    } catch (e) {
      console.error('Failed to parse services.yaml:', e);
      return null;
    }
  }, [content]);

  if (!config) {
    return (
      <div className="p-4 bg-red-50 text-red-600 rounded">
        Failed to parse services.yaml
      </div>
    );
  }

  const { feature, services, deployment } = config;

  return (
    <div className="space-y-6">
      {/* Feature Header */}
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl p-6 text-white shadow-lg">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold">{feature.name}</h2>
            <p className="text-indigo-100 mt-1">{feature.description}</p>
          </div>
          <div className="text-right text-sm">
            {feature.jira && (
              <a
                href={`https://tssoft.atlassian.net/browse/${feature.jira}`}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white/20 px-3 py-1 rounded-full hover:bg-white/30 transition"
              >
                {feature.jira}
              </a>
            )}
            {feature.version && (
              <div className="mt-2 text-indigo-200">Version {feature.version}</div>
            )}
          </div>
        </div>
      </div>

      {/* Services Grid */}
      <div>
        <h3 className="text-lg font-semibold text-gray-800 mb-4">📦 Services</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {services.map((service) => {
            const status = statusColors[service.status] || statusColors.pending;
            const roleIcon = roleIcons[service.role] || '📦';

            return (
              <div
                key={service.name}
                className="bg-white border rounded-xl p-4 shadow-sm hover:shadow-md transition"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <span className="text-2xl">{roleIcon}</span>
                    <div>
                      <h4 className="font-semibold text-gray-900">{service.name}</h4>
                      <span className="text-xs text-gray-500">{service.role}</span>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${status.bg} ${status.text}`}>
                    {status.label}
                  </span>
                </div>

                {service.database && (
                  <div className="text-sm text-gray-600 mb-2">
                    <span className="text-gray-400">💾</span> {service.database}
                    {service.tables && service.tables.length > 0 && (
                      <span className="text-gray-400 ml-2">
                        ({service.tables.join(', ')})
                      </span>
                    )}
                  </div>
                )}

                {service.changes && service.changes.length > 0 && (
                  <div className="mt-3 space-y-1">
                    <div className="text-xs text-gray-500 font-medium">Changes:</div>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {service.changes.slice(0, 5).map((change, idx) => (
                        <div
                          key={idx}
                          className="text-xs bg-gray-50 px-2 py-1 rounded flex items-start"
                        >
                          <span className="text-gray-400 mr-1.5 shrink-0">
                            {change.type === 'api' ? '🔌' :
                             change.type === 'ddl' ? '🗄️' :
                             change.type === 'service' ? '⚙️' :
                             change.type === 'dao' ? '📊' :
                             change.type === 'types' ? '📝' :
                             change.type === 'job' ? '⏰' : '•'}
                          </span>
                          <span className="text-gray-700 line-clamp-1">{change.desc}</span>
                        </div>
                      ))}
                      {service.changes.length > 5 && (
                        <div className="text-xs text-gray-400 text-center">
                          +{service.changes.length - 5} more
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {service.dependencies && service.dependencies.length > 0 && (
                  <div className="mt-3 text-xs text-gray-500">
                    <span className="text-gray-400">→</span> Depends on:{' '}
                    {service.dependencies.join(', ')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Deployment Order */}
      {deployment?.order && deployment.order.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-800 mb-4">🚀 Deployment Order</h3>
          <div className="flex items-center space-x-2 overflow-x-auto pb-2">
            {deployment.order.map((step, idx) => (
              <div key={step.step} className="flex items-center">
                <div className="bg-white border rounded-lg px-4 py-2 shadow-sm min-w-[120px]">
                  <div className="text-xs text-gray-400 mb-1">Step {step.step}</div>
                  <div className="font-medium text-gray-800 text-sm">{step.name}</div>
                </div>
                {idx < deployment.order.length - 1 && (
                  <span className="text-gray-300 mx-2">→</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
