import { useEffect, useState } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { useWebSocket } from './hooks/useWebSocket';
import { projectApi } from './api/client';
import Dashboard from './components/Dashboard';
import ChangeList from './components/ChangeList';
import ChangeDetail from './components/ChangeDetail';
import SpecList from './components/SpecList';
import ApprovalQueue from './components/ApprovalQueue';

function App() {
  const location = useLocation();
  const { connected } = useWebSocket();
  const [projectName, setProjectName] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    projectApi
      .get()
      .then(({ project }) => {
        if (active) {
          setProjectName(project.name);
        }
      })
      .catch(() => {
        // Ignore project name errors, keep UI functional.
      });
    return () => {
      active = false;
    };
  }, []);

  const navItems = [
    { path: '/', label: 'Dashboard' },
    { path: '/changes', label: 'Changes' },
    { path: '/specs', label: 'Specs' },
    { path: '/approvals', label: 'Approvals' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <h1 className="text-xl font-bold text-gray-900">OpenSpec MCP</h1>
              {projectName ? (
                <span className="text-sm text-gray-500" title={projectName}>
                  {projectName}
                </span>
              ) : null}
              <span
                className={`inline-flex items-center px-2 py-1 rounded text-xs ${
                  connected
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                {connected ? '● Connected' : '○ Disconnected'}
              </span>
            </div>
            <nav className="flex space-x-4">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`px-3 py-2 rounded-md text-sm font-medium ${
                    location.pathname === item.path
                      ? 'bg-gray-100 text-gray-900'
                      : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/changes" element={<ChangeList />} />
          <Route path="/changes/:id" element={<ChangeDetail />} />
          <Route path="/specs" element={<SpecList />} />
          <Route path="/approvals" element={<ApprovalQueue />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
