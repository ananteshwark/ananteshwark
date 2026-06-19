import { useState, useEffect } from 'react';
import { talentApi } from '../../api/talent';
import { CheckCircle, Circle, Clock } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  NOT_STARTED: 'bg-gray-100 text-gray-700',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

const TASK_STATUS_ICONS: Record<string, any> = {
  PENDING: <Circle className="h-4 w-4 text-gray-400" />,
  IN_PROGRESS: <Clock className="h-4 w-4 text-blue-500" />,
  COMPLETED: <CheckCircle className="h-4 w-4 text-green-500" />,
  SKIPPED: <Circle className="h-4 w-4 text-gray-300" />,
};

export default function OnboardingPage() {
  const [plans, setPlans] = useState<any[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPlans = async () => {
    try {
      const r = await talentApi.getOnboardingPlans({ limit: 50 });
      setPlans(r.data?.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPlans(); }, []);

  const handlePlanClick = async (plan: any) => {
    try {
      const r = await talentApi.getEmployeeOnboarding(plan.employeeId);
      setSelectedPlan(r.data);
      setTasks(r.data?.tasks || []);
    } catch {
      setSelectedPlan(plan);
      setTasks([]);
    }
  };

  const handleUpdateTask = async (taskId: string, status: string) => {
    await talentApi.updateOnboardingTask(taskId, { status });
    if (selectedPlan) handlePlanClick(selectedPlan);
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Onboarding</h1>
        <p className="text-sm text-gray-500 mt-1">Track employee onboarding progress</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Active Plans</h2>
          {loading ? <div className="text-center text-gray-500 py-4">Loading...</div> : plans.length === 0 ? (
            <div className="text-center text-gray-500 py-8 bg-white border rounded-xl">
              <p className="text-sm">No onboarding plans found.</p>
            </div>
          ) : plans.map(plan => (
            <button key={plan.id} onClick={() => handlePlanClick(plan)} className={`w-full text-left bg-white border rounded-xl p-4 hover:border-blue-300 transition-colors ${selectedPlan?.id === plan.id ? 'border-blue-500 ring-1 ring-blue-500' : ''}`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[plan.status]}`}>{plan.status?.replace(/_/g, ' ')}</span>
                <span className="text-xs text-gray-500">{plan.completionPercent}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded h-2 mb-2">
                <div className="bg-blue-500 h-full rounded transition-all" style={{ width: `${plan.completionPercent}%` }} />
              </div>
              <p className="text-xs text-gray-500">Employee: {plan.employeeId?.slice(0, 8)}...</p>
              <p className="text-xs text-gray-500">Start: {plan.startDate}</p>
            </button>
          ))}
        </div>

        <div className="lg:col-span-2">
          {selectedPlan ? (
            <div className="bg-white border rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Onboarding Tasks</h2>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[selectedPlan.status]}`}>{selectedPlan.status?.replace(/_/g, ' ')}</span>
              </div>
              {tasks.length === 0 ? (
                <p className="text-gray-500 text-sm">No tasks defined for this plan.</p>
              ) : (
                <div className="space-y-3">
                  {tasks.map((task: any) => (
                    <div key={task.id} className="flex items-start gap-3 p-3 border rounded-lg hover:bg-gray-50">
                      <div className="mt-0.5">{TASK_STATUS_ICONS[task.status] || <Circle className="h-4 w-4 text-gray-400" />}</div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-medium">{task.title}</h4>
                          <span className="text-xs text-gray-500">{task.dueDate}</span>
                        </div>
                        {task.description && <p className="text-xs text-gray-500 mt-1">{task.description}</p>}
                        <div className="flex items-center gap-2 mt-2">
                          <span className={`text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600`}>{task.category}</span>
                          {task.status !== 'COMPLETED' && task.status !== 'SKIPPED' && (
                            <button onClick={() => handleUpdateTask(task.id, 'COMPLETED')} className="text-xs text-green-600 hover:underline">Mark Complete</button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-12 text-center">
              <p className="text-gray-500">Select an onboarding plan to view tasks</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
