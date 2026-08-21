import { motion } from "motion/react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";
import { fadeInUp, staggerContainer, useReducedMotionVariants } from "@/lib/motion";

export interface WizardStepDefinition {
  key: string;
  label: string;
  description: string;
  tab: string;
  done: boolean;
}

export function SetupWizard({
  steps,
  onStart,
  onSkip,
}: {
  steps: WizardStepDefinition[];
  onStart: (tab: string) => void;
  onSkip: () => void;
}) {
  const container = useReducedMotionVariants(staggerContainer);
  const item = useReducedMotionVariants(fadeInUp);
  const activeIndex = steps.findIndex((step) => !step.done);
  const completedCount = steps.filter((step) => step.done).length;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
        <div className="space-y-1">
          <h3 className="text-base font-semibold tracking-tight">Guided setup</h3>
          <p className="text-xs text-muted-foreground">
            {completedCount} of {steps.length} required steps complete
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={onSkip}
        >
          Skip — I&rsquo;ll configure manually
        </Button>
      </CardHeader>
      <CardContent>
        <p className="sr-only">Current step: {steps[activeIndex]?.label}</p>
        <motion.ol variants={container} initial="hidden" animate="visible" className="space-y-2" aria-label="Setup steps">
          {steps.map((step, index) => {
            const isDone = step.done || index < activeIndex;
            const isActive = index === activeIndex;

            if (isDone) {
              return (
                <motion.li key={step.key} variants={item} className="flex items-center gap-3 rounded-lg px-3 py-2">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
                  <p className="flex-1 text-sm text-muted-foreground">{step.label}</p>
                  <span className="text-xs font-medium text-success">Done</span>
                </motion.li>
              );
            }

            if (isActive) {
              return (
                <motion.li
                  key={step.key}
                  variants={item}
                  className="rounded-lg border border-interactive/30 bg-muted/40 p-3"
                >
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-interactive text-xs font-semibold text-interactive-foreground"
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-sm font-medium leading-snug">{step.label}</p>
                      <p className="text-xs leading-relaxed text-muted-foreground">{step.description}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 border-interactive/40 text-interactive hover:bg-interactive/10 hover:text-interactive"
                      onClick={() => onStart(step.tab)}
                    >
                      Start
                    </Button>
                  </div>
                </motion.li>
              );
            }

            return (
              <motion.li key={step.key} variants={item} className="flex items-center gap-3 rounded-lg px-3 py-2">
                <span
                  aria-hidden="true"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border text-xs font-medium text-muted-foreground"
                >
                  {index + 1}
                </span>
                <p className="flex-1 text-sm text-muted-foreground">{step.label}</p>
                <Button variant="link" size="sm" className="text-interactive" onClick={() => onStart(step.tab)}>
                  Start
                </Button>
              </motion.li>
            );
          })}
        </motion.ol>
      </CardContent>
    </Card>
  );
}
