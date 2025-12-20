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
      <div className="flex justify-center items-center h-96">
        <div className="relative">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          <div className="absolute top-0 left-0 h-12 w-12 rounded-full border-t-2 border-indigo-100 opacity-30 animate-pulse"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Overview</h2>
        <p className="mt-1 text-gray-500">Track your project specifications and progress.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Active Changes"
          value={stats.changes}
          icon={<GitPullRequestIcon />}
          link="/changes"
          color="blue"
          trend="Updates pending"
        />
        <StatCard
          title="Specifications"
          value={stats.specs}
          icon={<FileTextIcon />}
          link="/specs"
          color="indigo"
          trend="Project documentation"
        />
        <StatCard
          title="Pending Approvals"
          value={stats.pendingApprovals}
          icon={<CheckCircleIcon />}
          link="/approvals"
          color="amber"
          trend="Requires attention"
          highlight={stats.pendingApprovals > 0}
        />
        <StatCard
          title="Overall Progress"
          value={`${stats.overallProgress}%`}
          icon={<ActivityIcon />}
          color="emerald"
          trend="Completion rate"
        />
      </div>

      {/* Recent Activity Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Changes List - Takes up 2 columns */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-semibold text-gray-900">Recent Changes</h3>
            <Link 
              to="/changes" 
              className="group flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
            >
              View all 
              <span className="ml-1 group-hover:translate-x-0.5 transition-transform">→</span>
            </Link>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {recentChanges.length === 0 ? (
              <div className="p-8 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 mb-4">
                  <InboxIcon className="w-6 h-6 text-gray-400" />
                </div>
                <p className="text-gray-500">No recent changes found.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {recentChanges.map((change) => (
                  <Link
                    key={change.id}
                    to={`/changes/${change.id}`}
                    className="block p-5 hover:bg-gray-50 transition-colors duration-150"
                  >
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <h4 className="font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">
                          {change.title}
                        </h4>
                        <div className="flex items-center space-x-2 text-xs text-gray-500 font-mono">
                          <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                            {change.id}
                          </span>
                          <span>•</span>
                          <span>Updated recently</span>
                        </div>
                      </div>
                      
                      <div className="flex flex-col items-end min-w-[100px]">
                        <div className="text-xs font-medium text-gray-500 mb-1.5">
                          {change.tasksCompleted} / {change.tasksTotal} tasks
                        </div>
                        <div className="w-28 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              change.tasksCompleted === change.tasksTotal 
                                ? 'bg-emerald-500' 
                                : 'bg-indigo-500'
                            }`}
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

        {/* Quick Actions / Side Panel - Takes up 1 column */}
        <div className="space-y-6">
          <h3 className="text-xl font-semibold text-gray-900">Quick Actions</h3>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-3">
             <div className="flex items-center p-3 rounded-lg border border-dashed border-gray-200 bg-gray-50">
                <div className="p-2 rounded-md bg-blue-50 text-blue-600">
                  <PlusIcon className="w-5 h-5" />
                </div>
                <div className="ml-3">
                  <span className="font-medium text-gray-600 text-sm">Create Change</span>
                  <p className="text-xs text-gray-400 mt-0.5">Use <code className="bg-gray-100 px-1 rounded">openspec_create_change</code></p>
                </div>
             </div>
             <Link to="/specs" className="flex items-center p-3 rounded-lg border border-gray-100 hover:border-indigo-100 hover:bg-indigo-50 transition-all group">
                <div className="p-2 rounded-md bg-purple-50 text-purple-600 group-hover:bg-white group-hover:scale-110 transition-all">
                  <FileTextIcon className="w-5 h-5" />
                </div>
                <span className="ml-3 font-medium text-gray-700 group-hover:text-purple-700">Browse Specs</span>
             </Link>
          </div>
          
          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl p-6 text-white shadow-lg">
             <h4 className="font-bold text-lg mb-2">Pro Tip</h4>
             <p className="text-indigo-100 text-sm opacity-90">
               Review pending approvals to unblock your team's progress.
             </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  link,
  color,
  trend,
  highlight = false,
}: {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  link?: string;
  color: 'blue' | 'indigo' | 'amber' | 'emerald';
  trend?: string;
  highlight?: boolean;
}) {
  const colorStyles = {
    blue: { icon: 'text-blue-600 bg-blue-50', border: 'hover:border-blue-200' },
    indigo: { icon: 'text-indigo-600 bg-indigo-50', border: 'hover:border-indigo-200' },
    amber: { icon: 'text-amber-600 bg-amber-50', border: 'hover:border-amber-200' },
    emerald: { icon: 'text-emerald-600 bg-emerald-50', border: 'hover:border-emerald-200' },
  };

  const styles = colorStyles[color];

  const content = (
    <div className={`
      relative p-6 rounded-xl bg-white border border-gray-100 shadow-sm transition-all duration-300
      ${link ? 'hover:-translate-y-1 hover:shadow-md ' + styles.border : ''}
      ${highlight ? 'ring-2 ring-amber-100' : ''}
    `}>
      <div className="flex justify-between items-start">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-2 tracking-tight">{value}</p>
        </div>
        <div className={`p-3 rounded-lg ${styles.icon}`}>
          {icon}
        </div>
      </div>
      {trend && (
        <div className="mt-4 flex items-center text-xs text-gray-400 font-medium">
          {trend}
        </div>
      )}
    </div>
  );

  if (link) {
    return <Link to={link} className="block">{content}</Link>;
  }

  return content;
}

// --- Icons ---

function GitPullRequestIcon({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M13 6h3a2 2 0 0 1 2 2v7" />
      <line x1="6" y1="9" x2="6" y2="21" />
    </svg>
  );
}

function FileTextIcon({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  );
}

function CheckCircleIcon({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function ActivityIcon({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function InboxIcon({ className = "w-6 h-6" }: { className?: string }) {
  return (
     <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  )
}

function PlusIcon({ className = "w-6 h-6" }: { className?: string }) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    )
}
