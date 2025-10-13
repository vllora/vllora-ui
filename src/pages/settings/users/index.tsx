import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users } from 'lucide-react';

export function UsersPage() {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-1 flex-col gap-6">
        <Card className="bg-card border-border shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Users className="h-6 w-6 text-[rgb(var(--theme-500))]" />
              <div>
                <CardTitle>User Management</CardTitle>
                <CardDescription>
                  Manage user access and permissions
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">User Management</h3>
              <p className="text-muted-foreground mb-4">
                User management features will be available soon.
              </p>
              <p className="text-sm text-muted-foreground">
                This section will allow you to manage users, roles, and permissions within your project.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


