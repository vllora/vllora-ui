import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface ProviderKeysLoaderProps {
    count?: number;
}

export const ProviderKeysLoader = ({ count = 5 }: ProviderKeysLoaderProps) => {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Provider Keys</CardTitle>
                <CardDescription>
                    Configure API keys for different AI providers. Your keys are stored securely and associated with your current project.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                {Array.from({ length: count }).map((_, index) => (
                    <div
                        key={index}
                        className="flex items-center justify-between p-4 border border-border rounded-lg animate-pulse"
                    >
                        <div className="flex items-center gap-3 flex-1">
                            <div className="w-8 h-8 bg-muted rounded" />
                            <div className="flex-1">
                                <div className="h-5 bg-muted rounded w-32 mb-2" />
                                <div className="h-4 bg-muted rounded w-24" />
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="h-9 bg-muted rounded w-20" />
                        </div>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
};
