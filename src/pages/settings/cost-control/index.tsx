import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign } from 'lucide-react';

export function CostControlPage() {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-1 flex-col gap-6">
        <Card className="bg-card border-border shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <DollarSign className="h-6 w-6 text-[rgb(var(--theme-500))]" />
              <div>
                <CardTitle>Cost Control</CardTitle>
                <CardDescription>
                  Manage usage limits and cost controls for your project
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <DollarSign className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Cost Control Settings</h3>
              <p className="text-muted-foreground mb-4">
                Cost control and usage management features will be available soon.
              </p>
              <p className="text-sm text-muted-foreground">
                This section will allow you to set usage limits, cost budgets, and monitoring for your project.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


