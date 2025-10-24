import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, ExternalLink, LogIn, Check, Loader2, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { startSession, fetchSessionKey } from '@/services/session-api';

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

type SessionStatus = 'idle' | 'waiting' | 'success' | 'timeout' | 'error';

export const ProviderCredentialForm = ({
    providerType,
    providerName,
    values,
    showKeys,
    onChange,
    onToggleShow,
    onClose,
}: ProviderCredentialFormProps) => {
    const firstInputRef = useRef<HTMLInputElement>(null);
    const [sessionStatus, setSessionStatus] = useState<SessionStatus>('idle');
    const [sessionError, setSessionError] = useState<string>('');
    const pollingIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const loginWindowRef = useRef<Window | null>(null);

    useEffect(() => {
        // Auto-focus first input when form opens
        const timer = setTimeout(() => {
            firstInputRef.current?.focus();
        }, 100);
        return () => clearTimeout(timer);
    }, []);

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

    const startSessionLogin = async () => {
        try {
            setSessionStatus('waiting');
            setSessionError('');

            // Step 1: Start session
            const { session_id } = await startSession();

            // Step 2: Open browser for login
            const uiUrl = import.meta.env.VITE_LANGDB_UI_URL || 'https://app.langdb.ai';
            const loginUrl = `${uiUrl}/login?session_id=${session_id}`;
            
            // Open with specific features to make it closeable
            const windowFeatures = 'width=600,height=700,left=100,top=100,resizable=yes,scrollbars=yes';
            loginWindowRef.current = window.open(loginUrl, 'langdb-login', windowFeatures);

            // Step 3: Start polling for API key
            const startTime = Date.now();
            const timeout = 120000; // 2 minutes

            pollingIntervalRef.current = setInterval(async () => {
                // Check timeout
                if (Date.now() - startTime > timeout) {
                    if (pollingIntervalRef.current) {
                        clearInterval(pollingIntervalRef.current);
                        pollingIntervalRef.current = null;
                    }
                    // Close the login popup window on timeout
                    if (loginWindowRef.current && !loginWindowRef.current.closed) {
                        loginWindowRef.current.close();
                    }
                    setSessionStatus('timeout');
                    setSessionError('Login timeout after 2 minutes. Please try again.');
                    return;
                }

                try {
                    const credentials = await fetchSessionKey(session_id);

                    if (credentials) {
                        // Stop polling
                        if (pollingIntervalRef.current) {
                            clearInterval(pollingIntervalRef.current);
                            pollingIntervalRef.current = null;
                        }

                        // Close the login popup window
                        if (loginWindowRef.current && !loginWindowRef.current.closed) {
                            try {
                                // Try to send a message to the window to close itself
                                loginWindowRef.current.postMessage({ type: 'CLOSE_WINDOW' }, '*');
                                
                                // Also try direct close
                                loginWindowRef.current.close();
                                
                                // If still open after a short delay, try again
                                setTimeout(() => {
                                    if (loginWindowRef.current && !loginWindowRef.current.closed) {
                                        loginWindowRef.current.close();
                                    }
                                }, 100);
                            } catch (error) {
                                console.warn('Could not close login window:', error);
                            }
                        }

                        // Update form with API key
                        onChange({ ...values, api_key: credentials.api_key });
                        setSessionStatus('success');
                        
                        // Auto-close modal after brief delay
                        if (onClose) {
                            setTimeout(() => {
                                onClose();
                            }, 1500); // Give user time to see success message
                        }
                    }
                    // If credentials is null (404), continue polling
                } catch (error) {
                    console.error('Polling error:', error);
                    // Continue polling on errors
                }
            }, 1000); // Poll every second
        } catch (error) {
            setSessionStatus('error');
            setSessionError(error instanceof Error ? error.message : 'Failed to start login flow');
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
                pollingIntervalRef.current = null;
            }
            // Close the login popup window on error
            if (loginWindowRef.current && !loginWindowRef.current.closed) {
                loginWindowRef.current.close();
            }
        }
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
                    {/* Status Messages */}
                    {sessionStatus === 'waiting' && (
                        <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-md border border-blue-200 dark:border-blue-800">
                            <div className="flex items-center gap-3">
                                <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                                <div>
                                    <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                                        Waiting for login...
                                    </p>
                                    <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                                        Please complete the login in the browser window that just opened.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {sessionStatus === 'success' && (
                        <div className="p-4 bg-green-50 dark:bg-green-950/30 rounded-md border border-green-200 dark:border-green-800">
                            <div className="flex items-center gap-3">
                                <Check className="h-5 w-5 text-green-600" />
                                <div>
                                    <p className="text-sm font-medium text-green-900 dark:text-green-100">
                                        Successfully authenticated!
                                    </p>
                                    <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                                        {onClose 
                                            ? 'Credentials saved! Closing...' 
                                            : 'Your API key has been retrieved. Click Save to complete setup.'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {(sessionStatus === 'timeout' || sessionStatus === 'error') && (
                        <div className="p-4 bg-red-50 dark:bg-red-950/30 rounded-md border border-red-200 dark:border-red-800">
                            <div className="flex items-center gap-3">
                                <AlertCircle className="h-5 w-5 text-red-600" />
                                <div>
                                    <p className="text-sm font-medium text-red-900 dark:text-red-100">
                                        {sessionStatus === 'timeout' ? 'Login timeout' : 'Authentication failed'}
                                    </p>
                                    <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                                        {sessionError || 'Please try again.'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Login Button and Manual API Key Entry */}
                    <div className="space-y-4">
                        {/* Login Button - shown when not waiting */}

                        {/* Manual API Key Entry - always shown */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="api_key">API Key</Label>
                                <span className="text-xs text-muted-foreground">
                                    {sessionStatus === 'idle' || sessionStatus === 'timeout' || sessionStatus === 'error' 
                                        ? 'Or enter manually' 
                                        : ''}
                                </span>
                            </div>
                            <div className="relative">
                                <Input
                                    ref={sessionStatus === 'idle' ? firstInputRef : undefined}
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
