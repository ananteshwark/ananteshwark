import { useState, useEffect } from 'react';
import { projectsApi } from '../../api/projects';
import { Plus, FolderOpen, Clock, X } from 'lucide-react';

const PROJECT_STATUS_COLORS: Record<string, string> = {
  PLANNING: 'bg-gray-100 text-gray-700',
  ACTIVE: 'bg-green-100 text-green-700',
  ON_HOLD: 'bg-yellow-100 text-yellow-700',
  COMPLETED: 'bg-blue-100 text-blue-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

const TASK_PRIORITY_COLORS: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-600',
  MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-700',
  URGENT: 'bg-red-100 text-red-700',
};

const TASK_COLUMNS = [
  { key: 'TODO', label: 'To Do' },
  { key: 'IN_PROGRESS', label: 'In Progress' },
  { key: 'IN_REVIEW', label: 'In Review' },
  { key: 'DONE', label: 'Done' },
];

function NewProjectDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    code: '',
    name: '',
    clientName: '',
    managerId: '',
    startDate: '',
    endDate: '',
    budget: '',
    status: 'PLANNING',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await projectsApi.createProject({
        ...form,
        budget: form.budget ? Number(form.budget) : undefined,
        endDate: form.endDate || undefined,
        managerId: form.managerId || undefined,
      });
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">New Project</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">{error}</div>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                required
                placeholder="PROJ-001"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              >
                <option value="PLANNING">Planning</option>
                <option value="ACTIVE">Active</option>
                <option value="ON_HOLD">On Hold</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                required
                placeholder="Project name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Client Name</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.clientName}
                onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))}
                placeholder="Client / company"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Manager ID</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.managerId}
                onChange={e => setForm(f => ({ ...f, managerId: e.target.value }))}
                placeholder="User ID"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
              <input
                type="date"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.startDate}
                onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input
                type="date"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.endDate}
                onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Budget (₹)</label>
              <input
                type="number"
                step="0.01"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.budget}
                onChange={e => setForm(f => ({ ...f, budget: e.target.value }))}
                placeholder="0.00"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function LogTimeDialog({
  projects,
  onClose,
  onSaved,
}: {
  projects: any[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    projectId: projects[0]?.id || '',
    date: new Date().toISOString().split('T')[0],
    hours: '',
    description: '',
    billable: true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.projectId) { setError('Please select a project'); return; }
    setLoading(true);
    try {
      await projectsApi.createTimeEntry(form.projectId, {
        date: form.date,
        hours: Number(form.hours),
        description: form.description,
        billable: form.billable,
      });
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to log time');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="p-6 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">Log Time</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Project *</label>
            <select
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.projectId}
              onChange={e => setForm(f => ({ ...f, projectId: e.target.value }))}
              required
            >
              <option value="">Select project...</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
              <input
                type="date"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hours *</label>
              <input
                type="number"
                step="0.25"
                min="0.25"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.hours}
                onChange={e => setForm(f => ({ ...f, hours: e.target.value }))}
                required
                placeholder="0.00"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={2}
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="What did you work on?"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="billable"
              checked={form.billable}
              onChange={e => setForm(f => ({ ...f, billable: e.target.checked }))}
              className="rounded"
            />
            <label htmlFor="billable" className="text-sm text-gray-700">Billable</label>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Log Time'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProjectCard({ project }: { project: any }) {
  const completion = Number(project.completionPercent || 0);
  const budget = Number(project.budget || 0);
  const spent = Number(project.estimatedSpent || project.actualCost || 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs text-gray-400 font-mono mb-1">{project.code}</p>
          <h3 className="font-semibold text-gray-900">{project.name}</h3>
          {project.clientName && (
            <p className="text-xs text-gray-500 mt-0.5">{project.clientName}</p>
          )}
        </div>
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium ${PROJECT_STATUS_COLORS[project.status] || 'bg-gray-100 text-gray-700'}`}
        >
          {project.status}
        </span>
      </div>

      {/* Progress */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Progress</span>
          <span>{completion.toFixed(0)}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-1.5">
          <div
            className="bg-blue-600 h-1.5 rounded-full transition-all"
            style={{ width: `${Math.min(completion, 100)}%` }}
          />
        </div>
      </div>

      {/* Budget */}
      {budget > 0 && (
        <div className="flex justify-between text-xs text-gray-500">
          <span>Budget: ₹{budget.toLocaleString()}</span>
          <span>Spent: ₹{spent.toLocaleString()}</span>
        </div>
      )}

      {/* Dates */}
      {project.startDate && (
        <div className="mt-2 text-xs text-gray-400">
          {project.startDate?.split('T')[0]}
          {project.endDate ? ` → ${project.endDate?.split('T')[0]}` : ''}
        </div>
      )}
    </div>
  );
}

function TaskKanban({ projects }: { projects: any[] }) {
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id || '');
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchTasks = async () => {
    if (!selectedProjectId) return;
    setLoading(true);
    try {
      const res = await projectsApi.getTasks(selectedProjectId, { limit: 100 });
      setTasks(res.data?.items || res.data?.data || []);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId]);

  const grouped = TASK_COLUMNS.reduce<Record<string, any[]>>((acc, col) => {
    acc[col.key] = tasks.filter(t => t.status === col.key);
    return acc;
  }, {});

  return (
    <div>
      <div className="mb-4">
        <select
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={selectedProjectId}
          onChange={e => setSelectedProjectId(e.target.value)}
        >
          <option value="">Select project...</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>
      {loading && <p className="text-gray-500 text-sm">Loading tasks...</p>}
      {!loading && (
        <div className="grid grid-cols-4 gap-4">
          {TASK_COLUMNS.map(col => (
            <div key={col.key} className="bg-gray-50 rounded-xl p-3">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">{col.label}</h3>
                <span className="text-xs bg-gray-200 text-gray-600 rounded-full px-2 py-0.5">
                  {grouped[col.key]?.length || 0}
                </span>
              </div>
              <div className="space-y-2">
                {(grouped[col.key] || []).length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">No tasks</p>
                ) : (
                  (grouped[col.key] || []).map(task => (
                    <div key={task.id} className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
                      <p className="text-sm font-medium text-gray-800 mb-2">{task.title || task.name}</p>
                      <div className="flex items-center justify-between">
                        <span
                          className={`px-1.5 py-0.5 rounded text-xs font-medium ${TASK_PRIORITY_COLORS[task.priority] || 'bg-gray-100 text-gray-600'}`}
                        >
                          {task.priority}
                        </span>
                        {task.assignedTo && (
                          <span className="text-xs text-gray-400 truncate max-w-[80px]">
                            {task.assignee?.name || task.assignedTo}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TimeEntriesTab({ projects }: { projects: any[] }) {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showLogTime, setShowLogTime] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id || '');

  const fetchEntries = async () => {
    if (!selectedProjectId) return;
    setLoading(true);
    try {
      const res = await projectsApi.getTimeEntries(selectedProjectId, { limit: 50 });
      setEntries(res.data?.items || res.data?.data || []);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId]);

  return (
    <div>
      {showLogTime && (
        <LogTimeDialog
          projects={projects}
          onClose={() => setShowLogTime(false)}
          onSaved={() => { fetchEntries(); }}
        />
      )}
      <div className="flex items-center justify-between mb-4">
        <select
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={selectedProjectId}
          onChange={e => setSelectedProjectId(e.target.value)}
        >
          <option value="">Select project...</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button
          onClick={() => setShowLogTime(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
        >
          <Clock className="h-4 w-4" /> Log Time
        </button>
      </div>
      {loading && <p className="text-gray-500 text-sm">Loading...</p>}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Project</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Hours</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Billable</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-8 text-gray-400">
                  No time entries found
                </td>
              </tr>
            ) : (
              entries.map(entry => (
                <tr key={entry.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">{entry.date?.split('T')[0]}</td>
                  <td className="px-4 py-3">{entry.project?.name || entry.projectId}</td>
                  <td className="px-4 py-3 text-right font-medium">{Number(entry.hours || 0).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        entry.billable ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {entry.billable ? 'Billable' : 'Non-billable'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{entry.description || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type Tab = 'projects' | 'tasks' | 'time';

export default function ProjectsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('projects');
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const res = await projectsApi.getProjects({ limit: 50 });
      setProjects(res.data?.items || res.data?.data || []);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const tabs = [
    { key: 'projects' as const, label: 'Projects' },
    { key: 'tasks' as const, label: 'Tasks' },
    { key: 'time' as const, label: 'Time Entries' },
  ];

  return (
    <div className="p-6">
      {showNewProject && (
        <NewProjectDialog onClose={() => setShowNewProject(false)} onSaved={fetchProjects} />
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FolderOpen className="h-6 w-6 text-blue-600" /> Projects
          </h1>
          <p className="text-sm text-gray-500 mt-1">Manage projects, tasks, and time</p>
        </div>
        {activeTab === 'projects' && (
          <button
            onClick={() => setShowNewProject(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" /> New Project
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-4">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {loading && activeTab === 'projects' && (
        <p className="text-gray-500 text-sm mb-4">Loading...</p>
      )}

      {/* Projects Tab */}
      {activeTab === 'projects' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.length === 0 && !loading ? (
            <div className="col-span-3 text-center py-12 text-gray-400">
              <FolderOpen className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>No projects found. Create your first project.</p>
            </div>
          ) : (
            projects.map(project => <ProjectCard key={project.id} project={project} />)
          )}
        </div>
      )}

      {/* Tasks Tab */}
      {activeTab === 'tasks' && <TaskKanban projects={projects} />}

      {/* Time Entries Tab */}
      {activeTab === 'time' && <TimeEntriesTab projects={projects} />}
    </div>
  );
}
