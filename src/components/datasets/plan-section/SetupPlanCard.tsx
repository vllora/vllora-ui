/**
 * SetupPlanCard
 *
 * Displays a proposed setup plan with approve/edit actions.
 * Used in the Lucy chat as a tool renderer for propose_setup_plan results.
 */

import { useState } from 'react';
import {
  FolderTree,
  Database,
  FlaskConical,
  Clock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Sparkles,
  BookOpen,
  Play,
  Edit3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SetupPlan } from '@/lib/distri-finetune-tools/steps/propose-setup-plan';

interface SetupPlanCardProps {
  plan: SetupPlan;
  onApprove: (plan: SetupPlan) => void;
  onEdit?: (plan: SetupPlan) => void;
  isExecuting?: boolean;
}

export function SetupPlanCard({
  plan,
  onApprove,
  onEdit,
  isExecuting = false,
}: SetupPlanCardProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['topics', 'steps'])
  );

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const SectionHeader = ({
    id,
    icon: Icon,
    title,
    subtitle,
  }: {
    id: string;
    icon: React.ElementType;
    title: string;
    subtitle?: string;
  }) => {
    const isExpanded = expandedSections.has(id);
    return (
      <button
        onClick={() => toggleSection(id)}
        className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors rounded-lg"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
        <Icon className="w-5 h-5 text-primary" />
        <div className="flex-1 text-left">
          <div className="text-sm font-medium">{title}</div>
          {subtitle && (
            <div className="text-xs text-muted-foreground">{subtitle}</div>
          )}
        </div>
      </button>
    );
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-primary/10 to-primary/5 border-b border-border">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <div>
            <h3 className="text-sm font-semibold">Setup Plan</h3>
            <p className="text-xs text-muted-foreground">
              for {plan.dataset_name}
            </p>
          </div>
        </div>
      </div>

      {/* Objective */}
      <div className="px-4 py-3 border-b border-border bg-muted/30">
        <div className="text-xs font-medium text-muted-foreground mb-1">
          Training Objective
        </div>
        <div className="text-sm">{plan.objective}</div>
      </div>

      {/* Knowledge Sources */}
      {plan.knowledge_sources.length > 0 && (
        <div className="border-b border-border">
          <SectionHeader
            id="knowledge"
            icon={BookOpen}
            title="Knowledge Sources"
            subtitle={`${plan.knowledge_sources.length} document(s) analyzed`}
          />
          {expandedSections.has('knowledge') && (
            <div className="px-4 pb-3 space-y-2">
              {plan.knowledge_sources.map((source, i) => (
                <div
                  key={i}
                  className="text-xs bg-muted/50 rounded-lg p-2"
                >
                  <div className="font-medium">{source.name}</div>
                  {source.topics_extracted.length > 0 && (
                    <div className="text-muted-foreground mt-1">
                      Topics: {source.topics_extracted.slice(0, 5).join(', ')}
                      {source.topics_extracted.length > 5 && ' ...'}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Topics */}
      <div className="border-b border-border">
        <SectionHeader
          id="topics"
          icon={FolderTree}
          title="Topic Hierarchy"
          subtitle={`${plan.total_topic_count} topics organized`}
        />
        {expandedSections.has('topics') && (
          <div className="px-4 pb-3">
            <div className="space-y-2">
              {plan.proposed_topics.map((topic, i) => (
                <div key={i} className="text-xs">
                  <div className="flex items-center gap-2 py-1">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <span className="font-medium">{topic.name}</span>
                    <span className="text-muted-foreground">
                      ({topic.target_count} examples)
                    </span>
                  </div>
                  {topic.subtopics && topic.subtopics.length > 0 && (
                    <div className="ml-4 pl-2 border-l border-border space-y-1">
                      {topic.subtopics.map((sub, j) => (
                        <div
                          key={j}
                          className="flex items-center gap-2 py-0.5 text-muted-foreground"
                        >
                          <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
                          <span>{sub.name}</span>
                          <span>({sub.target_count})</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Data Generation */}
      <div className="border-b border-border">
        <SectionHeader
          id="data"
          icon={Database}
          title="Data Generation"
          subtitle={`${plan.data_generation.seed_count} seed examples`}
        />
        {expandedSections.has('data') && (
          <div className="px-4 pb-3 text-xs space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
              <span>
                {plan.data_generation.grounded_in_knowledge
                  ? 'Grounded in uploaded knowledge sources'
                  : 'Generated from training objective'}
              </span>
            </div>
            <div className="text-muted-foreground">
              Strategy: {plan.data_generation.strategy}
            </div>
          </div>
        )}
      </div>

      {/* Grader Configuration */}
      <div className="border-b border-border">
        <SectionHeader
          id="grader"
          icon={FlaskConical}
          title="Evaluation Criteria"
          subtitle={`${plan.grader_config.criteria.length} criteria configured`}
        />
        {expandedSections.has('grader') && (
          <div className="px-4 pb-3">
            <div className="space-y-2">
              {plan.grader_config.criteria.map((criterion, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 text-xs"
                >
                  <div className="mt-1 w-2 h-2 rounded-full bg-primary" />
                  <div className="flex-1">
                    <span className="font-medium">{criterion.name}</span>
                    <div className="text-muted-foreground">
                      {criterion.description}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Execution Steps */}
      <div className="border-b border-border">
        <SectionHeader
          id="steps"
          icon={Clock}
          title="Execution Steps"
          subtitle={`Estimated ${plan.estimated_duration}`}
        />
        {expandedSections.has('steps') && (
          <div className="px-4 pb-3">
            <div className="space-y-2">
              {plan.execution_steps.map((step, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 text-xs"
                >
                  <div className="flex items-center justify-center w-5 h-5 rounded-full bg-muted text-muted-foreground font-medium">
                    {i + 1}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">{step.step}</div>
                    <div className="text-muted-foreground">
                      {step.description}
                    </div>
                  </div>
                  <div className="text-muted-foreground whitespace-nowrap">
                    {step.estimated_time}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="px-4 py-3 bg-muted/30 border-b border-border">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Estimated total:</span>
          <span className="font-medium">
            {plan.estimated_records} records in {plan.estimated_duration}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 py-3 flex items-center gap-2">
        {onEdit && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEdit(plan)}
            disabled={isExecuting}
            className="flex-1"
          >
            <Edit3 className="w-4 h-4 mr-2" />
            Edit Plan
          </Button>
        )}
        <Button
          size="sm"
          onClick={() => onApprove(plan)}
          disabled={isExecuting}
          className={cn(
            'flex-1',
            isExecuting && 'opacity-50 cursor-not-allowed'
          )}
        >
          {isExecuting ? (
            <>
              <div className="w-4 h-4 mr-2 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Executing...
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              Approve & Execute
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
