import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { StepIndicator } from '../../components/ui/StepIndicator';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Card, CardContent } from '../../components/ui/Card';
import { useUpdateTenantSettings } from '../../api/hooks';
import { CheckCircle, Building2, Calendar, Package, User, Rocket } from 'lucide-react';

const STEPS = [
  { id: 1, label: 'Company' },
  { id: 2, label: 'Fiscal' },
  { id: 3, label: 'Modules' },
  { id: 4, label: 'Account' },
  { id: 5, label: 'Done' },
];

const MODULES = [
  { id: 'hr', label: 'Human Resources', description: 'Employees, attendance, leave management' },
  { id: 'finance', label: 'Finance', description: 'GL, AR, AP, invoicing' },
  { id: 'payroll', label: 'Payroll', description: 'Payroll processing and payslips' },
  { id: 'procurement', label: 'Procurement', description: 'Purchase orders and vendor management' },
  { id: 'inventory', label: 'Inventory', description: 'Stock management and tracking' },
  { id: 'crm', label: 'CRM', description: 'Customer relationship management' },
  { id: 'projects', label: 'Projects', description: 'Project tracking and timesheets' },
];

const CURRENCIES = [
  { value: 'USD', label: 'USD - US Dollar' },
  { value: 'EUR', label: 'EUR - Euro' },
  { value: 'GBP', label: 'GBP - British Pound' },
  { value: 'INR', label: 'INR - Indian Rupee' },
  { value: 'AED', label: 'AED - UAE Dirham' },
  { value: 'SGD', label: 'SGD - Singapore Dollar' },
];

const MONTHS = [
  { value: '1', label: 'January' }, { value: '2', label: 'February' },
  { value: '3', label: 'March' }, { value: '4', label: 'April' },
  { value: '5', label: 'May' }, { value: '6', label: 'June' },
  { value: '7', label: 'July' }, { value: '8', label: 'August' },
  { value: '9', label: 'September' }, { value: '10', label: 'October' },
  { value: '11', label: 'November' }, { value: '12', label: 'December' },
];

export default function OnboardingPage() {
  const navigate = useNavigate();
  const updateSettings = useUpdateTenantSettings();
  const [step, setStep] = useState(1);

  const [companyInfo, setCompanyInfo] = useState({ industry: '', size: '', website: '', address: '' });
  const [fiscal, setFiscal] = useState({ fiscalYearStart: '1', baseCurrency: 'USD', timezone: 'UTC' });
  const [selectedModules, setSelectedModules] = useState<string[]>(['hr', 'finance', 'payroll']);

  const toggleModule = (id: string) => {
    setSelectedModules(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  const handleNext = async () => {
    if (step === 3) {
      try {
        await updateSettings.mutateAsync({
          enabledModules: selectedModules,
          baseCurrency: fiscal.baseCurrency,
          fiscalYearStart: parseInt(fiscal.fiscalYearStart),
          timezone: fiscal.timezone,
        });
      } catch (e) {
        toast.error('Failed to save settings');
        return;
      }
    }
    setStep(s => s + 1);
  };

  const handleFinish = () => navigate('/dashboard');

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Set up your ERP</h1>
          <p className="text-sm text-gray-500 mt-1">Just a few steps to get started</p>
        </div>

        <StepIndicator steps={STEPS} currentStep={step} />

        <Card>
          <CardContent className="py-6">
            {step === 1 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="h-5 w-5 text-blue-600" />
                  <h2 className="font-semibold">Company Information</h2>
                </div>
                <Input label="Industry" placeholder="Technology, Healthcare, Finance..." name="industry"
                  value={companyInfo.industry} onChange={e => setCompanyInfo({...companyInfo, industry: e.target.value})} />
                <Select label="Company Size" name="size"
                  options={[
                    { value: '1-10', label: '1-10 employees' },
                    { value: '11-50', label: '11-50 employees' },
                    { value: '51-200', label: '51-200 employees' },
                    { value: '201-1000', label: '201-1000 employees' },
                    { value: '1000+', label: '1000+ employees' },
                  ]}
                  value={companyInfo.size} onChange={e => setCompanyInfo({...companyInfo, size: e.target.value})}
                  placeholder="Select size" />
                <Input label="Website" placeholder="https://yourcompany.com" name="website"
                  value={companyInfo.website} onChange={e => setCompanyInfo({...companyInfo, website: e.target.value})} />
                <Input label="Address" placeholder="123 Main St, City, Country" name="address"
                  value={companyInfo.address} onChange={e => setCompanyInfo({...companyInfo, address: e.target.value})} />
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="h-5 w-5 text-blue-600" />
                  <h2 className="font-semibold">Fiscal Year & Currency</h2>
                </div>
                <Select label="Fiscal Year Start Month" name="fiscalYearStart"
                  options={MONTHS}
                  value={fiscal.fiscalYearStart}
                  onChange={e => setFiscal({...fiscal, fiscalYearStart: e.target.value})} />
                <Select label="Base Currency" name="baseCurrency"
                  options={CURRENCIES}
                  value={fiscal.baseCurrency}
                  onChange={e => setFiscal({...fiscal, baseCurrency: e.target.value})} />
                <Select label="Timezone" name="timezone"
                  options={[
                    { value: 'UTC', label: 'UTC' },
                    { value: 'America/New_York', label: 'Eastern (New York)' },
                    { value: 'America/Chicago', label: 'Central (Chicago)' },
                    { value: 'America/Los_Angeles', label: 'Pacific (Los Angeles)' },
                    { value: 'Asia/Kolkata', label: 'India (IST)' },
                    { value: 'Asia/Dubai', label: 'Gulf (Dubai)' },
                    { value: 'Europe/London', label: 'London (GMT)' },
                    { value: 'Europe/Berlin', label: 'Central Europe' },
                    { value: 'Asia/Singapore', label: 'Singapore' },
                  ]}
                  value={fiscal.timezone}
                  onChange={e => setFiscal({...fiscal, timezone: e.target.value})} />
              </div>
            )}

            {step === 3 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <Package className="h-5 w-5 text-blue-600" />
                  <h2 className="font-semibold">Select Modules</h2>
                </div>
                <p className="text-sm text-gray-500 mb-4">Choose the modules your business needs</p>
                {MODULES.map(mod => (
                  <label key={mod.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors">
                    <input type="checkbox" className="h-4 w-4 text-blue-600 rounded"
                      checked={selectedModules.includes(mod.id)}
                      onChange={() => toggleModule(mod.id)} />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{mod.label}</p>
                      <p className="text-xs text-gray-500">{mod.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <User className="h-5 w-5 text-blue-600" />
                  <h2 className="font-semibold">Admin Account</h2>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-700">
                    Your admin account has been created during registration. You can invite team members from the Users section.
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    Admin account created
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    System roles seeded
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    Tenant configured
                  </div>
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="text-center py-4 space-y-4">
                <div className="h-16 w-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <Rocket className="h-8 w-8 text-green-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Your ERP is ready!</h2>
                <p className="text-sm text-gray-500">
                  Everything is set up. Start by inviting your team members and exploring the modules.
                </p>
                <div className="grid grid-cols-2 gap-3 mt-6">
                  <button onClick={() => navigate('/users/invite')}
                    className="p-3 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 text-left">
                    <div className="font-medium">Invite Team</div>
                    <div className="text-xs text-gray-500">Add your colleagues</div>
                  </button>
                  <button onClick={() => navigate('/workflows')}
                    className="p-3 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 text-left">
                    <div className="font-medium">Setup Workflows</div>
                    <div className="text-xs text-gray-500">Configure approvals</div>
                  </button>
                  <button onClick={() => navigate('/roles')}
                    className="p-3 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 text-left">
                    <div className="font-medium">Manage Roles</div>
                    <div className="text-xs text-gray-500">Set permissions</div>
                  </button>
                  <button onClick={() => navigate('/settings/general')}
                    className="p-3 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 text-left">
                    <div className="font-medium">Company Settings</div>
                    <div className="text-xs text-gray-500">Branding & info</div>
                  </button>
                </div>
              </div>
            )}
          </CardContent>

          <div className="px-6 pb-6 flex justify-between">
            {step > 1 && step < 5 && (
              <Button variant="secondary" onClick={() => setStep(s => s - 1)}>
                Back
              </Button>
            )}
            {step < 5 && step !== 1 && <div />}
            {step === 1 && <div />}
            {step < 4 && (
              <Button onClick={handleNext} loading={updateSettings.isPending}>
                Next
              </Button>
            )}
            {step === 4 && (
              <Button onClick={() => setStep(5)}>
                Continue
              </Button>
            )}
            {step === 5 && (
              <Button onClick={handleFinish} className="w-full">
                Go to Dashboard
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
