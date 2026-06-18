import React from 'react';
import { clsx } from 'clsx';
import { Check } from 'lucide-react';

interface Step {
  id: number;
  label: string;
}

interface StepIndicatorProps {
  steps: Step[];
  currentStep: number;
}

export const StepIndicator = ({ steps, currentStep }: StepIndicatorProps) => (
  <div className="flex items-center justify-center mb-8">
    {steps.map((step, index) => (
      <React.Fragment key={step.id}>
        <div className="flex flex-col items-center">
          <div
            className={clsx(
              'h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold',
              step.id < currentStep && 'bg-blue-600 text-white',
              step.id === currentStep && 'bg-blue-600 text-white ring-4 ring-blue-100',
              step.id > currentStep && 'bg-gray-100 text-gray-400',
            )}
          >
            {step.id < currentStep ? <Check className="h-4 w-4" /> : step.id}
          </div>
          <span
            className={clsx(
              'mt-1 text-xs font-medium whitespace-nowrap',
              step.id === currentStep ? 'text-blue-600' : 'text-gray-400',
            )}
          >
            {step.label}
          </span>
        </div>
        {index < steps.length - 1 && (
          <div
            className={clsx(
              'flex-1 h-0.5 mx-3 mt-[-16px]',
              step.id < currentStep ? 'bg-blue-600' : 'bg-gray-200',
            )}
          />
        )}
      </React.Fragment>
    ))}
  </div>
);
