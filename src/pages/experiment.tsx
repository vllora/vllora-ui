import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Play, Save, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

interface Message {
    role: string;
    content: string;
}

interface ExperimentConfig {
    model: string;
    messages: Message[];
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
}

export function ExperimentPage() {
    const { spanId } = useParams<{ spanId: string }>();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);
    const [config, setConfig] = useState<ExperimentConfig>({
        model: "gpt-4",
        messages: [],
        temperature: 0.7,
        max_tokens: 4096,
        top_p: 1.0,
        frequency_penalty: 0,
        presence_penalty: 0,
    });
    const [originalResponse, setOriginalResponse] = useState<any>(null);
    const [newResponse, setNewResponse] = useState<any>(null);
    const [viewMode, setViewMode] = useState<"visual" | "json">("visual");
    const [traceId, setTraceId] = useState<string>("");
    const [experimentName, setExperimentName] = useState<string>("");
    const [showSaveDialog, setShowSaveDialog] = useState(false);

    useEffect(() => {
        if (spanId) {
            fetchSpanData(spanId);
        }
    }, [spanId]);

    const fetchSpanData = async (spanId: string) => {
        try {
            setLoading(true);
            // Fetch the specific span by span_id
            const response = await fetch(`/spans/${spanId}`);

            if (!response.ok) {
                throw new Error("Failed to fetch span data");
            }

            const span = await response.json();
            const attribute = span.attribute;

            // Store trace_id
            setTraceId(span.trace_id || "");

            // Parse request from attribute
            if (attribute.request) {
                const requestData = typeof attribute.request === 'string'
                    ? JSON.parse(attribute.request)
                    : attribute.request;

                setConfig({
                    model: requestData.model || "gpt-4",
                    messages: requestData.messages || [],
                    temperature: requestData.temperature ?? 0.7,
                    max_tokens: requestData.max_tokens ?? 4096,
                    top_p: requestData.top_p ?? 1.0,
                    frequency_penalty: requestData.frequency_penalty ?? 0,
                    presence_penalty: requestData.presence_penalty ?? 0,
                });
            }

            // Store original response
            if (attribute.response) {
                const responseData = typeof attribute.response === 'string'
                    ? JSON.parse(attribute.response)
                    : attribute.response;
                setOriginalResponse(responseData);
            } else if (attribute.output) {
                const outputData = typeof attribute.output === 'string'
                    ? JSON.parse(attribute.output)
                    : attribute.output;
                setOriginalResponse(outputData);
            }
        } catch (error) {
            console.error("Error fetching span data:", error);
            toast.error("Failed to load span data");
        } finally {
            setLoading(false);
        }
    };

    const handleRun = async () => {
        try {
            setRunning(true);
            setNewResponse(null);

            const response = await fetch('/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(config),
            });

            if (!response.ok) {
                throw new Error("Failed to run experiment");
            }

            const data = await response.json();
            setNewResponse(data);
            toast.success("Experiment completed successfully");
        } catch (error) {
            console.error("Error running experiment:", error);
            toast.error("Failed to run experiment");
        } finally {
            setRunning(false);
        }
    };

    const handleSaveClick = () => {
        setExperimentName(`Experiment ${new Date().toLocaleString()}`);
        setShowSaveDialog(true);
    };

    const handleSaveConfirm = async () => {
        try {
            const response = await fetch('/experiments', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: experimentName,
                    description: "Experiment from span " + spanId,
                    span_id: spanId,
                    trace_id: traceId,
                    request_config: config,
                }),
            });

            if (response.ok) {
                toast.success("Experiment saved successfully");
                setShowSaveDialog(false);
            } else {
                throw new Error("Failed to save experiment");
            }
        } catch (error) {
            console.error("Error saving experiment:", error);
            toast.error("Failed to save experiment");
        }
    };

    const handleMessageChange = (index: number, field: 'role' | 'content', value: string) => {
        const updatedMessages = [...config.messages];
        updatedMessages[index] = { ...updatedMessages[index], [field]: value };
        setConfig({ ...config, messages: updatedMessages });
    };

    const handleAddMessage = () => {
        setConfig({
            ...config,
            messages: [...config.messages, { role: "user", content: "" }],
        });
    };

    const handleRemoveMessage = (index: number) => {
        const updatedMessages = config.messages.filter((_, i) => i !== index);
        setConfig({ ...config, messages: updatedMessages });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-lg">Loading experiment...</div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-background">
            {/* Header */}
            <div className="border-b px-6 py-4 flex items-center justify-between bg-card">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h1 className="text-xl font-semibold">Experiment</h1>
                        <p className="text-sm text-muted-foreground">Span: {spanId?.slice(0, 8)}...</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={handleSaveClick}>
                        <Save className="h-4 w-4 mr-2" />
                        Save
                    </Button>
                    <Button onClick={handleRun} disabled={running}>
                        <Play className="h-4 w-4 mr-2" />
                        {running ? "Running..." : "Run"}
                    </Button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex flex-1 overflow-hidden">
                {/* Left Panel - Request Editor (60%) */}
                <div className="w-3/5 border-r overflow-y-auto">
                    <div className="p-6 space-y-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold">Request Configuration</h2>
                            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "visual" | "json")}>
                                <TabsList>
                                    <TabsTrigger value="visual">Visual</TabsTrigger>
                                    <TabsTrigger value="json">JSON</TabsTrigger>
                                </TabsList>
                            </Tabs>
                        </div>

                        {viewMode === "visual" ? (
                            <div className="space-y-6">
                                {/* Model Parameters Card */}
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-base">Model Parameters</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label>Model</Label>
                                                <Input
                                                    value={config.model}
                                                    onChange={(e) => setConfig({ ...config, model: e.target.value })}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Max Tokens</Label>
                                                <Input
                                                    type="number"
                                                    value={config.max_tokens}
                                                    onChange={(e) => setConfig({ ...config, max_tokens: parseInt(e.target.value) })}
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-3">
                                            <div className="space-y-2">
                                                <div className="flex justify-between">
                                                    <Label>Temperature</Label>
                                                    <span className="text-sm text-muted-foreground">{config.temperature}</span>
                                                </div>
                                                <Slider
                                                    value={[config.temperature ?? 0.7]}
                                                    onValueChange={(value) => setConfig({ ...config, temperature: value[0] })}
                                                    max={2}
                                                    step={0.1}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <div className="flex justify-between">
                                                    <Label>Top P</Label>
                                                    <span className="text-sm text-muted-foreground">{config.top_p}</span>
                                                </div>
                                                <Slider
                                                    value={[config.top_p ?? 1.0]}
                                                    onValueChange={(value) => setConfig({ ...config, top_p: value[0] })}
                                                    max={1}
                                                    step={0.1}
                                                />
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Messages */}
                                <div className="space-y-3">
                                    <h3 className="font-semibold">Messages</h3>
                                    {config.messages.map((message, index) => (
                                        <Card key={index}>
                                            <CardHeader className="pb-3">
                                                <div className="flex items-center justify-between">
                                                    <Select
                                                        value={message.role}
                                                        onValueChange={(value) => handleMessageChange(index, 'role', value)}
                                                    >
                                                        <SelectTrigger className="w-32">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="system">System</SelectItem>
                                                            <SelectItem value="user">User</SelectItem>
                                                            <SelectItem value="assistant">Assistant</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleRemoveMessage(index)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </CardHeader>
                                            <CardContent>
                                                <Textarea
                                                    value={message.content}
                                                    onChange={(e) => handleMessageChange(index, 'content', e.target.value)}
                                                    placeholder="Message content..."
                                                    className="min-h-[100px] font-mono text-sm"
                                                />
                                            </CardContent>
                                        </Card>
                                    ))}
                                    <Button variant="outline" onClick={handleAddMessage} className="w-full">
                                        <Plus className="h-4 w-4 mr-2" />
                                        Add Message
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <Textarea
                                value={JSON.stringify(config, null, 2)}
                                onChange={(e) => {
                                    try {
                                        setConfig(JSON.parse(e.target.value));
                                    } catch (error) {
                                        // Invalid JSON, don't update
                                    }
                                }}
                                className="font-mono text-sm min-h-[600px]"
                            />
                        )}
                    </div>
                </div>

                {/* Right Panel - Output (40%) */}
                <div className="w-2/5 overflow-y-auto bg-muted/30">
                    <div className="p-6 space-y-4">
                        <h2 className="text-lg font-semibold">Output</h2>

                        {newResponse && (
                            <Card className="border-green-600 bg-green-50 dark:bg-green-950">
                                <CardHeader>
                                    <CardTitle className="text-sm flex items-center gap-2">
                                        <div className="h-2 w-2 rounded-full bg-green-600"></div>
                                        New Output
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-2">
                                        {newResponse.choices?.[0]?.message?.content && (
                                            <div className="p-3 bg-background rounded-md">
                                                <p className="text-sm whitespace-pre-wrap">
                                                    {newResponse.choices[0].message.content}
                                                </p>
                                            </div>
                                        )}
                                        <details className="text-xs">
                                            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                                                View raw JSON
                                            </summary>
                                            <pre className="mt-2 p-2 bg-background rounded text-xs overflow-auto">
                                                {JSON.stringify(newResponse, null, 2)}
                                            </pre>
                                        </details>
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {originalResponse && (
                            <Card className="border-gray-400">
                                <CardHeader>
                                    <CardTitle className="text-sm flex items-center gap-2">
                                        <div className="h-2 w-2 rounded-full bg-gray-400"></div>
                                        Original Output
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-2">
                                        {originalResponse.choices?.[0]?.message?.content && (
                                            <div className="p-3 bg-background rounded-md">
                                                <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                                                    {originalResponse.choices[0].message.content}
                                                </p>
                                            </div>
                                        )}
                                        <details className="text-xs">
                                            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                                                View raw JSON
                                            </summary>
                                            <pre className="mt-2 p-2 bg-background rounded text-xs overflow-auto">
                                                {JSON.stringify(originalResponse, null, 2)}
                                            </pre>
                                        </details>
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {!newResponse && !originalResponse && (
                            <Card>
                                <CardContent className="py-12 text-center text-muted-foreground">
                                    <p>Click "Run" to see the output</p>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>
            </div>

            {/* Save Dialog */}
            <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Save Experiment</DialogTitle>
                        <DialogDescription>
                            Give your experiment a name to save it for future reference.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Experiment Name</Label>
                            <Input
                                value={experimentName}
                                onChange={(e) => setExperimentName(e.target.value)}
                                placeholder="Enter experiment name..."
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleSaveConfirm} disabled={!experimentName.trim()}>
                            Save Experiment
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
