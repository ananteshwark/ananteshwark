import React, { useState } from 'react';
import { GitBranch, Clock, CheckCircle, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { PageSpinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { useWorkflowDefinitions, usePendingApprovals, useApproveStep, useRejectStep } from '../../api/hooks';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

type TabType = 'definitions' | 'pending';

const STATUS_VARIANTS: Record<string, 'default' | 'warning' | 'success' | 'error'> = {
  pending: 'warning',
  in_progress: 'warning',
  approved: 'success',
  rejected: 'error',
  cancelled: 'default',
};

export default function WorkflowPage() {
  const [activeTab, setActiveTab] = useState<TabType>('definitions');
  const [selectedInstance, setSelectedInstance] = useState<any>(null);
  const [comment, setComment] = useState('');

  const { data: definitions, isLoading: defsLoading } = useWorkflowDefinitions();
  const { data: pending, isLoading: pendingLoading } = usePendingApprovals();
  const approveStep = useApproveStep();
  const rejectStep = useRejectStep();

  const handleApprove = async (instanceId: string, stepId: string) => {
    try {
      await approveStep.mutateAsync({ instanceId, stepId, comment });
      toast.success('Step approved');
      setSelectedInstance(null);
      setComment('');
    } catch {
      toast.error('Failed to approve step');
    }
  };

  const handleReject = async (instanceId: string, stepId: string) => {
    try {
      await rejectStep.mutateAsync({ instanceId, stepId, comment });
      toast.success('Step rejected');
      setSelectedInstance(null);
      setComment('');
    } catch {
      toast.error('Failed to reject step');
    }
  };

  return (
    <div>
      <PageHeader
        title="Workflows"
        description="Manage approval workflows and monitor instances"
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        {(['definitions', 'pending'] as TabType[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'definitions' ? 'Definitions' : 'Pending Approvals'}
            {tab === 'pending' && Array.isArray(pending) && pending.length > 0 && (
              <span className="ml-1.5 bg-amber-500 text-white text-[10px] px-1.5 rounded-full">
                {pending.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'definitions' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {defsLoading ? (
            <PageSpinner />
          ) : !Array.isArray(definitions) || definitions.length === 0 ? (
            <div className="col-span-3">
              <EmptyState
                icon={<GitBranch className="h-10 w-10" />}
                title="No workflow definitions"
                description="Create workflow definitions to automate approvals"
              />
            </div>
          ) : (
            (definitions as any[]).map((def) => (
              <Card key={def.id}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-gray-900">{def.name}</h3>
                    <Badge variant={def.isActive ? 'success' : 'default'}>
                      {def.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  {def.description && (
                    <p className="text-sm text-gray-500 mb-3">{def.description}</p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span>Module: {def.triggerModule}</span>
                    <span>Steps: {def.steps?.length || 0}</span>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {activeTab === 'pending' && (
        <div className="space-y-3">
          {pendingLoading ? (
            <PageSpinner />
          ) : !Array.isArray(pending) || pending.length === 0 ? (
            <EmptyState
              icon={<CheckCircle className="h-10 w-10" />}
              title="No pending approvals"
              description="You're all caught up!"
            />
          ) : (
            (pending as any[]).map((instance) => (
              <Card key={instance.id}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-gray-900">{instance.subjectType}</h3>
                        <Badge variant={STATUS_VARIANTS[instance.status] || 'default'}>
                          {instance.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-500">
                        Current step: {instance.currentStep}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Started {format(new Date(instance.createdAt), 'MMM d, yyyy')}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => setSelectedInstance(instance)}
                      >
                        Review
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Approve Modal */}
      <Modal
        isOpen={!!selectedInstance}
        onClose={() => { setSelectedInstance(null); setComment(''); }}
        title="Review Approval Request"
      >
        <div className="p-6 space-y-4">
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-sm font-medium text-gray-700">Subject: {selectedInstance?.subjectType}</p>
            <p className="text-sm text-gray-500">Step: {selectedInstance?.currentStep}</p>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Comment (optional)</label>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Add a comment..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px]"
            />
          </div>
          <div className="flex gap-3">
            <Button
              className="flex-1"
              onClick={() => handleApprove(selectedInstance.id, selectedInstance.currentStep)}
              loading={approveStep.isPending}
              leftIcon={<CheckCircle className="h-4 w-4" />}
            >
              Approve
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleReject(selectedInstance.id, selectedInstance.currentStep)}
              loading={rejectStep.isPending}
              leftIcon={<XCircle className="h-4 w-4" />}
            >
              Reject
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
