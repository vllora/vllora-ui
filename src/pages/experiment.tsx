import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Play, Save } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

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
    });
    const [originalResponse, setOriginalResponse] = useState<any>(null);
    const [newResponse, setNewResponse] = useState<any>(null);
    const [viewMode, setViewMode] = useState<"visual" | "json">("visual");
    const [showAdvanced, setShowAdvanced] = useState(false);

    useEffect(() => {
        if (spanId) {
            fetchSpanData(spanId);
        }
    }, [spanId]);

    const fetchSpanData = async (spanId: string) => {
        try {
            setLoading(true);
            // Fetch span data from the backend
            const response = await fetch(`/spans?parent_span_ids=${spanId}&limit=100`);
            const data = await response.json();

            if (data.data && data.data.length > 0) {
                const span = data.data[0];
                const attribute = span.attribute;

                // Parse request from attribute
                if (attribute.request) {
                    const requestData = typeof attribute.request === 'string'
                        ? JSON.parse(attribute.request)
                        : attribute.request;

                    setConfig({
                        model: requestData.model || "gpt-4",
                        messages: requestData.messages || [],
                        temperature: requestData.temperature || 0.7,
                        max_tokens: requestData.max_tokens || 4096,
                        top_p: requestData.top_p,
                        frequency_penalty: requestData.frequency_penalty,
                        presence_penalty: requestData.presence_penalty,
                    });
                }

                // Store original response
                if (attribute.response) {
                    const responseData = typeof attribute.response === 'string'
                        ? JSON.parse(attribute.response)
                        : attribute.response;
                    setOriginalResponse(responseData);
                }
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

    const handleSave = async () => {
        try {
            const response = await fetch('/experiments', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: `Experiment ${new Date().toISOString()}`,
                    description: "Saved experiment",
                    span_id: spanId,
                    trace_id: "", // Will be populated from span data
                    request_config: config,
                }),
            });

            if (response.ok) {
                toast.success("Experiment saved successfully");
            } else {
                toast.error("Failed to save experiment");
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
        <div className="flex flex-col h-screen">
            {/* Header */}
            <div className="border-b px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <h1 className="text-xl font-semibold">Experiment: {spanId}</h1>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={handleSave}>
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
                {/* Left Panel - Request Editor */}
                <div className="w-3/5 border-r overflow-y-auto p-6 space-y-6">
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
                            {/* Messages */}
                            <div className="space-y-3">
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
                                                    size="sm"
                                                    onClick={() => handleRemoveMessage(index)}
                                                >
                                                    Remove
                                                </Button>
                                            </div>
                                        </CardHeader>
                                        <CardContent>
                                            <Textarea
                                                value={message.content}
                                                onChange={(e) => handleMessageChange(index, 'content', e.target.value)}
                                                placeholder="Message content..."
                                                className="min-h-[100px]"
                                            />
                                        </CardContent>
                                    </Card>
                                ))}
                                <Button variant="outline" onClick={handleAddMessage} className="w-full">
                                    + Add Message
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
                            className="font-mono min-h-[400px]"
                        />
                    )}
                </div>

                {/* Right Panel - Output */}
                <div className="w-2/5 overflow-y-auto p-6 space-y-6">
                    <Tabs defaultValue="output" className="space-y-4">
                        <TabsList>
                            <TabsTrigger value="output">Output</TabsTrigger>
                            <TabsTrigger value="trace">Trace</TabsTrigger>
                        </TabsList>

                        <TabsContent value="output" className="space-y-4">
                            {newResponse && (
                                <Card className="border-green-500">
                                    <CardHeader>
                                        <CardTitle className="text-sm">New Output</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <pre className="text-sm whitespace-pre-wrap">
                                            {JSON.stringify(newResponse, null, 2)}
                                        </pre>
                                    </CardContent>
                                </Card>
                            )}

                            {originalResponse && (
                                <Card className="border-gray-500">
                                    <CardHeader>
                                        <CardTitle className="text-sm">Original Output</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <pre className="text-sm whitespace-pre-wrap text-muted-foreground">
                                            {JSON.stringify(originalResponse, null, 2)}
                                        </pre>
                                    </CardContent>
                                </Card>
                            )}
                        </TabsContent>

                        <TabsContent value="trace">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-sm">Trace Information</CardTitle>
                                    <CardDescription>Trace details will appear here after running</CardDescription>
                                </CardHeader>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>

            {/* Footer Controls */}
            <div className="border-t px-6 py-4">
                <Accordion type="single" collapsible>
                    <AccordionItem value="advanced">
                        <AccordionTrigger>Model Parameters</AccordionTrigger>
                        <AccordionContent>
                            <div className="grid grid-cols-4 gap-4 pt-2">
                                <div className="space-y-2">
                                    <Label>Model</Label>
                                    <Input
                                        value={config.model}
                                        onChange={(e) => setConfig({ ...config, model: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Temperature</Label>
                                    <Input
                                        type="number"
                                        step="0.1"
                                        value={config.temperature}
                                        onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
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
                                <div className="space-y-2">
                                    <Label>Top P</Label>
                                    <Input
                                        type="number"
                                        step="0.1"
                                        value={config.top_p || 1.0}
                                        onChange={(e) => setConfig({ ...config, top_p: parseFloat(e.target.value) })}
                                    />
                                </div>
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            </div>
        </div>
    );
}
