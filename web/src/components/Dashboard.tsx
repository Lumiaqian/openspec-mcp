import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { changesApi, specsApi, tasksApi, approvalsApi } from '../api/client';

interface Stats {
  changes: number;
  specs: number;
  pendingApprovals: number;
  overallProgress: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({
    changes: 0,
    specs: 0,
    pendingApprovals: 0,
    overallProgress: 0,
  });
  const [recentChanges, setRecentChanges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [changesRes, specsRes, progressRes, approvalsRes] = await Promise.all([
          changesApi.list(),
          specsApi.list(),
          tasksApi.getProgress(),
          approvalsApi.listPending(),
        ]);

        setStats({
          changes: changesRes.changes.length,
          specs: specsRes.specs.length,
          pendingApprovals: approvalsRes.approvals.length,
          overallProgress: progressRes.overall.percentage,
        });

        setRecentChanges(changesRes.changes.slice(0, 5));
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Active Changes"
          value={stats.changes}
          link="/changes"
          color="blue"
        />
        <StatCard
          title="Specifications"
          value={stats.specs}
          link="/specs"
          color="green"
        />
        <StatCard
          title="Pending Approvals"
          value={stats.pendingApprovals}
          link="/approvals"
          color="yellow"
        />
        <StatCard
          title="Overall Progress"
          value={`${stats.overallProgress}%`}
          color="purple"
        />
      </div>

      {/* Recent Changes */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Recent Changes</h3>
          <Link to="/changes" className="text-blue-500 hover:text-blue-700 text-sm">
            View all →
          </Link>
        </div>

        {recentChanges.length === 0 ? (
          <p className="text-gray-500">No changes found.</p>
        ) : (
          <div className="space-y-3">
            {recentChanges.map((change) => (
              <Link
                key={change.id}
                to={`/changes/${change.id}`}
                className="block p-3 rounded-lg border hover:border-blue-500 transition-colors"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="font-medium text-gray-900">{change.title}</h4>
                    <p className="text-sm text-gray-500">{change.id}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">
                      {change.tasksCompleted}/{change.tasksTotal} tasks
                    </div>
                    <div className="w-24 h-2 bg-gray-200 rounded-full mt-1">
                      <div
                        className="h-full bg-blue-500 rounded-full"
                        style={{
                          width: `${
                            change.tasksTotal > 0
                              ? (change.tasksCompleted / change.tasksTotal) * 100
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  link,
  color,
}: {
  title: string;
  value: number | string;
  link?: string;
  color: 'blue' | 'green' | 'yellow' | 'purple';
}) {
  const colorClasses = {
    blue: 'bg-blue-50 border-blue-200',
    green: 'bg-green-50 border-green-200',
    yellow: 'bg-yellow-50 border-yellow-200',
    purple: 'bg-purple-50 border-purple-200',
  };

  const content = (
    <div className={`p-6 rounded-lg border ${colorClasses[color]}`}>
      <p className="text-sm text-gray-600">{title}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  );

  if (link) {
    return (
      <Link to={link} className="block hover:opacity-80 transition-opacity">
        {content}
      </Link>
    );
  }

  return content;
}
