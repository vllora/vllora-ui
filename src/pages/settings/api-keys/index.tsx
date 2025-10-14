import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Key } from 'lucide-react';

export function ApiKeysPage() {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-1 flex-col gap-6">
        <Card className="bg-card border-border shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Key className="h-6 w-6 text-[rgb(var(--theme-500))]" />
              <div>
                <CardTitle>API Keys</CardTitle>
                <CardDescription>
                  Manage authentication keys for chat completions
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <Key className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">API Keys for Authentication</h3>
              <p className="text-muted-foreground mb-4">
                API key management for chat completions will be available soon.
              </p>
              <p className="text-sm text-muted-foreground">
                This feature will allow you to configure authentication keys for users accessing the chat completion endpoints.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


