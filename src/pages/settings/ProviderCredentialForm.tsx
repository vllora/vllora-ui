import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, ExternalLink } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';

export interface CredentialFormValues {
    [key: string]: string;
}

interface ProviderCredentialFormProps {
    providerType: string;
    providerName: string;
    values: CredentialFormValues;
    showKeys: Record<string, boolean>;
    onChange: (values: CredentialFormValues) => void;
    onToggleShow: (field: string) => void;
    onClose?: () => void;
}

const PROVIDER_DOCS: Record<string, { url: string; label: string }> = {
    openai: { url: 'https://platform.openai.com/api-keys', label: 'Get your OpenAI API key' },
    anthropic: { url: 'https://console.anthropic.com/settings/keys', label: 'Get your Anthropic API key' },
    google: { url: 'https://ai.google.dev/gemini-api/docs/api-key', label: 'Get your Google AI API key' },
    gemini: { url: 'https://ai.google.dev/gemini-api/docs/api-key', label: 'Get your Gemini API key' },
    aws: { url: 'https://docs.aws.amazon.com/bedrock/latest/userguide/security-iam.html', label: 'AWS Bedrock setup guide' },
    bedrock: { url: 'https://docs.aws.amazon.com/bedrock/latest/userguide/security-iam.html', label: 'AWS Bedrock setup guide' },
    vertex: { url: 'https://cloud.google.com/vertex-ai/docs/authentication', label: 'Vertex AI authentication guide' },
    vertexai: { url: 'https://cloud.google.com/vertex-ai/docs/authentication', label: 'Vertex AI authentication guide' },
    cohere: { url: 'https://dashboard.cohere.com/api-keys', label: 'Get your Cohere API key' },
    mistral: { url: 'https://console.mistral.ai/api-keys/', label: 'Get your Mistral API key' },
    groq: { url: 'https://console.groq.com/keys', label: 'Get your Groq API key' },
};

export const ProviderCredentialForm = ({
    providerType,
    providerName,
    values,
    showKeys,
    onChange,
    onToggleShow,
}: ProviderCredentialFormProps) => {
    const firstInputRef = useRef<HTMLInputElement>(null);
    const pollingIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const loginWindowRef = useRef<Window | null>(null);
    const [useCustomEndpoint, setUseCustomEndpoint] = useState(false);

    useEffect(() => {
        // Auto-focus first input when form opens
        const timer = setTimeout(() => {
            firstInputRef.current?.focus();
        }, 100);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (values.endpoint) {
            setUseCustomEndpoint(true);
        }
    }, [values]);

    // Cleanup polling and window on unmount
    useEffect(() => {
        return () => {
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
            }
            if (loginWindowRef.current && !loginWindowRef.current.closed) {
                loginWindowRef.current.close();
            }
        };
    }, []);

    const handleChange = (field: string, value: string) => {
        onChange({ ...values, [field]: value });
    };

    const docLink = PROVIDER_DOCS[providerName.toLowerCase()];

    const renderPasswordField = (field: string, label: string, placeholder: string, isFirst = false) => (
        <div key={field} className="space-y-2">
            <Label htmlFor={field}>{label}</Label>
            <div className="relative">
                <Input
                    ref={isFirst ? firstInputRef : undefined}
                    id={field}
                    type={showKeys[field] ? 'text' : 'password'}
                    placeholder={placeholder}
                    value={values[field] || ''}
                    onChange={(e) => handleChange(field, e.target.value)}
                    className="pr-10"
                />
                <button
                    type="button"
                    onClick={() => onToggleShow(field)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                    {showKeys[field] ? (
                        <EyeOff className="h-4 w-4" />
                    ) : (
                        <Eye className="h-4 w-4" />
                    )}
                </button>
            </div>
        </div>
    );

    const renderTextField = (field: string, label: string, placeholder: string) => (
        <div key={field} className="space-y-2">
            <Label htmlFor={field}>{label}</Label>
            <Input
                id={field}
                type="text"
                placeholder={placeholder}
                value={values[field] || ''}
                onChange={(e) => handleChange(field, e.target.value)}
            />
        </div>
    );

    const renderTextareaField = (field: string, label: string, placeholder: string) => (
        <div key={field} className="space-y-2">
            <Label htmlFor={field}>{label}</Label>
            <Textarea
                id={field}
                placeholder={placeholder}
                value={values[field] || ''}
                onChange={(e) => handleChange(field, e.target.value)}
                rows={8}
                className="font-mono text-sm"
            />
        </div>
    );

    const renderDocLink = () => {
        if (!docLink) return null;
        return (
            <div className="mt-2 p-3 bg-muted/50 rounded-md border border-border">
                <a
                    href={docLink.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline flex items-center gap-1"
                >
                    {docLink.label}
                    <ExternalLink className="h-3 w-3" />
                </a>
            </div>
        );
    };

    // Render form fields based on provider_type
    switch (providerType.toLowerCase()) {
        case 'api_key':
            return (
                <div className="space-y-4">
                    {renderPasswordField('api_key', 'API Key', 'Enter your API key', true)}
                    <div className="flex items-center space-x-2">
                        <Checkbox 
                            id="use_endpoint" 
                            checked={useCustomEndpoint} 
                            onCheckedChange={(checked: boolean) => setUseCustomEndpoint(checked)} 
                        />
                        <Label htmlFor="use_endpoint">Use Custom Endpoint</Label>
                    </div>
                    {useCustomEndpoint && renderTextField('endpoint', 'Endpoint URL', 'https://api.example.com')}
                    {renderDocLink()}
                </div>
            );

        case 'api_key_with_endpoint':
            return (
                <div className="space-y-4">
                    {renderPasswordField('api_key', 'API Key', 'Enter your API key', true)}
                    {renderTextField('endpoint', 'Endpoint URL', 'https://api.example.com')}
                    {renderDocLink()}
                </div>
            );

        case 'aws':
        case 'bedrock':
            return (
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>Authentication Method</Label>
                        <select
                            ref={firstInputRef as any}
                            value={values.auth_method || 'iam'}
                            onChange={(e) => handleChange('auth_method', e.target.value)}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                            <option value="iam">IAM Credentials</option>
                            <option value="api_key">API Key</option>
                        </select>
                    </div>

                    {values.auth_method === 'api_key' ? (
                        <>
                            {renderPasswordField('api_key', 'API Key', 'Enter your AWS API key')}
                            {renderTextField('region', 'Region (optional)', 'us-east-1')}
                        </>
                    ) : (
                        <>
                            {renderPasswordField('access_key', 'Access Key', 'Enter your AWS access key')}
                            {renderPasswordField('access_secret', 'Secret Access Key', 'Enter your AWS secret key')}
                            {renderTextField('region', 'Region (optional)', 'us-east-1')}
                        </>
                    )}
                    {renderDocLink()}
                </div>
            );

        case 'vertex':
        case 'vertexai':
            return (
                <div className="space-y-4">
                    {renderTextField('region', 'Region', 'us-central1')}
                    {renderTextareaField(
                        'credentials_json',
                        'Service Account JSON',
                        'Paste your Google Cloud service account JSON credentials here'
                    )}
                    {renderDocLink()}
                </div>
            );

        case 'langdb':
            return (
                <div className="space-y-4">
                    {/* Login Button and Manual API Key Entry */}
                    <div className="space-y-4">
                        {/* Login Button - shown when not waiting */}

                        {/* Manual API Key Entry - always shown */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="api_key">API Key</Label>

                            </div>
                            <div className="relative">
                                <Input
                                    ref={firstInputRef}
                                    id="api_key"
                                    type={showKeys['api_key'] ? 'text' : 'password'}
                                    placeholder="langdb_..."
                                    value={values['api_key'] || ''}
                                    onChange={(e) => handleChange('api_key', e.target.value)}
                                    className="pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => onToggleShow('api_key')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                >
                                    {showKeys['api_key'] ? (
                                        <EyeOff className="h-4 w-4" />
                                    ) : (
                                        <Eye className="h-4 w-4" />
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            );

        default:
            // Default to API key for unknown types
            return (
                <div className="space-y-4">
                    {renderPasswordField('api_key', 'API Key', 'Enter your API key', true)}
                    {renderDocLink()}
                </div>
            );
    }
};
