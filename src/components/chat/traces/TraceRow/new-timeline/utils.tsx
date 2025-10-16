import { AcademicCapIcon, ArrowsUpDownIcon, CloudIcon, ShieldCheckIcon, ShieldExclamationIcon, WrenchScrewdriverIcon } from "@heroicons/react/24/outline";
import { ProviderIcon } from "@/components/Icons/ProviderIcons";
import { tryParseJson } from "@/utils/modelUtils";
import { getColorByType, getClientSDKName, isAgentSpan, isClientSDK, isPromptCachingApplied, isRouterSpan } from "@/utils/graph-utils";
import { BotIcon, ClapperboardIcon, PlayIcon } from "lucide-react";
import { ArrowsPointingOutIcon } from "@heroicons/react/24/outline"
import { ModelCall, Span } from "@/types/common-type";


export const getRouterTitle = (props: { span: Span }) => {
    const { span } = props;
    let attributes = span.attribute as any;
    let router_name = attributes['router_name'];
    return router_name || 'router';
}

export const getTaskTitle = (props: { span: Span }) => {
    const { span } = props;
    let attributes = span.attribute as any;
    let task_name =  attributes['langdb.task_name'] || attributes['task_name'];
    return task_name || 'task';
}

export const getAgentTitle = (props: { span: Span }) => {
    const { span } = props;
    let isAgent = isAgentSpan(span);
    if (!isAgent) {
        return 'Unknown Agent';
    }
    let sdkName = getClientSDKName(span);
    if (sdkName) {
        switch (sdkName.toLowerCase()) {
            case 'adk': {
                let attributes = span.attribute as any;
                let agent_name = attributes ? (attributes['langdb.agent_name'] || attributes['agent_name'] || attributes['langdb_agent_name']) : '';
                if(agent_name) {
                    return agent_name;
                }
                let operation_name = span.operation_name;
                if (operation_name.startsWith('agent_run')) {
                    return operation_name.replace('agent_run ', '').replace('[', '').replace(']', '');
                }
                return operation_name;
            }
            case 'crewai':
                let attribute = span.attribute as any;
                let crew_agent = attribute['input.value'];
                let crew_agent_json = tryParseJson(crew_agent);
                if (crew_agent_json) {
                    let crew_agent_info_text = crew_agent_json['agent'];
                    const match = crew_agent_info_text?.match(/role='(.*?)'/);
                    const role_name = match ? match[1] : null;
                    if (role_name) {
                        return role_name;
                    }
                }
                return 'Crewai Agent';
            case 'openai':
                return span.operation_name;
            case 'agno':
                let attributeAgno = span.attribute as any;
                let agent_name = attributeAgno['agno.agent'];
                return agent_name || span.operation_name;
            default:
                return `${sdkName} Agent`;
        }
    }
    let attributes = span.attribute as any;
    let agent_name = attributes ? (attributes['langdb.agent_name'] || attributes['agent_name'] || attributes['langdb_agent_name']) : '';
    return agent_name || 'Unknown Agent';
}
export const getToolDisplayName = (props: { span: Span }) => {
    const { span } = props;
    let attribute = span.attribute as any;
    let labelsTool = attribute && ((attribute as any).label);
    let nameDisplay = labelsTool || attribute.tool_name || span.operation_name;
    let enhanceNameDisplay = nameDisplay.split(',').map((text: string) => {
        if (text.includes('---')) {
            return text.split('---')[1];
        }
        return text;
    }).join(',');
    return enhanceNameDisplay;
}


export const getModelTooltipDisplay = (_: any) => {
    return <></>

}


export const getLinkFromAttribute = (props: {
    attributes: any,
    projectId?: string,
    mcp_template_definition_id?: string,
    currentSpan: Span,
    relatedSpans: Span[]
}) => {
    const { attributes, projectId, mcp_template_definition_id, currentSpan, relatedSpans } = props;
    const mcp_server_string = attributes && attributes['mcp_server'] as string;
    const mcp_server_json = mcp_server_string && tryParseJson(mcp_server_string);
    const mcp_slug = mcp_server_json && mcp_server_json['slug'];
    if (mcp_slug) {
        return projectId ? `/projects/${projectId}/mcp-servers/${mcp_slug}/details` : (mcp_template_definition_id ? `/mcp-servers/${mcp_template_definition_id}` : ``)
    }
    const model_id = attributes && attributes['model_id'] as string;
    const virtual_model_string = attributes && attributes['virtual_model'] as string;
    const virtual_model_json = virtual_model_string && tryParseJson(virtual_model_string);
    const virtual_model_slug = virtual_model_json && virtual_model_json['slug'] || model_id;
    if (virtual_model_slug) {
        return projectId ? `/projects/${projectId}/models/virtual-models/${virtual_model_slug}/edit` : ''
    }
    let modelDetailName = getModelDetailName(currentSpan, relatedSpans);
    if (modelDetailName) {
        return `/providers/${modelDetailName}`;
    }
    return '';
}

export const getModelDetailName = (span: Span, relatedSpans: Span[]) => {
    const operationName = span.operation_name;
    if (!operationName) {
        return undefined;
    }
    let isAgent = isAgentSpan(span);
    if (isAgent) {
        return undefined
    }
    let isClientSDKSpan = isClientSDK(span);
    if (isClientSDKSpan) {
        return undefined;
    }
    if (operationName.startsWith('guard_')) {
        return undefined;
    }
    if (operationName == 'model_call') {
        return undefined
    }
    if (operationName == 'tools') {
        return undefined
    }
    if (operationName == 'cloud_api_invoke') {
        return undefined
    }
    if (operationName == 'api_invoke') {
        return undefined
    }
    if (operationName == 'request_routing') {
        return undefined
    }
    if (operationName.startsWith('virtual_model')) {
        return undefined
    }
    if (!['api_invoke', 'cloud_api_invoke', 'model_call', 'tools'].includes(operationName) && !operationName.startsWith('guard_')) {
        const parentSpans = relatedSpans.filter(s => s.span_id === span.parent_span_id);
        if (parentSpans.length > 0) {
            let parentSpan = parentSpans[0];
            if (parentSpan.operation_name == 'model_call') {
                let attributes = parentSpan.attribute as ModelCall;
                let model_name = attributes['model_name']
                return model_name
            }
        }
    }
    return undefined;
}

export const isTaskSpan = (span: Span) => {
    const operationName = span.operation_name;
    if (!operationName) {
        return false;
    }
    return operationName == 'task';
}
export const getSpanTitle = (props: { span: Span, relatedSpans: Span[] }) => {
    const { span, relatedSpans } = props;
    let isAgent = isAgentSpan(span);
    let isClientSDKSpan = isClientSDK(span);
    let isRouter = isRouterSpan(span);
    if (isAgent) {
        return getAgentTitle({ span });
    }
    if (isRouter) {
        return getRouterTitle({ span });
    }
    let isTask = isTaskSpan(span);
    if (isTask) {
        return getTaskTitle({ span });
    }    

    if (isClientSDKSpan) {
        let operation_name = span.operation_name;
        if (operation_name.startsWith('agent_run')) {
            return operation_name.replace('agent_run ', '').replace('[', '').replace(']', '');
        }
        if (operation_name.startsWith('execute_tool ')) {
            return operation_name.replace('execute_tool ', '').replace('[', '').replace(']', '');
        }
        return operation_name;
    }
    if (span.operation_name.startsWith('guard_')) {
        let attributes = span.attribute;
        let label = attributes['label'] as string;
        return label;
    }
    if (span.operation_name == 'model_call') {
        return span.operation_name;
    }
    if (span.operation_name == 'tools') {
        let attributes = span.attribute as any;
        let label = attributes['label'] as string;
        let tool_name = attributes['tool_name'];
        if (tool_name?.includes('---')) {
            return tool_name.split('---')[1];
        }
        return label || tool_name;
    }
    if (span.operation_name == 'cloud_api_invoke') {
        return span.operation_name;
    }
    if (span.operation_name == 'api_invoke') {
        return span.operation_name;
    }
    if (span.operation_name == 'request_routing') {
        let attributes = span.attribute as any;
        return attributes['router_name'] || span.operation_name;
    }
    if (span.operation_name.startsWith('virtual_model')) {
        let attributes = span.attribute as any;
        let model_id = attributes?.model_id;
        return model_id ?? span.operation_name;
    }
    if (!['api_invoke', 'cloud_api_invoke', 'model_call', 'tools'].includes(span.operation_name) && !span.operation_name.startsWith('guard_')) {
        const parentSpans = relatedSpans.filter(s => s.span_id === span.parent_span_id);
        if (parentSpans.length > 0) {
            let parentSpan = parentSpans[0];
            if (parentSpan.operation_name == 'model_call') {
                let attributes = parentSpan.attribute as ModelCall;
                let model_name = attributes['model_name']
                let provider_name = attributes['provider_name']
                return model_name?.replace(`${provider_name}/`, '');
            }
        }
        return span.operation_name;
    }
    return span.operation_name;
}

export const getOperationIconColor = (props: {
    span: Span,
    relatedSpans: Span[]
}) => {
    const { span, relatedSpans } = props;
    let operationName = span.operation_name;
    let isClientSDKSpan = isClientSDK(span);
    let isAgent = isAgentSpan(span);
    let isRouter = isRouterSpan(span);
    if (isAgent) {
        return 'bg-[#1a1a1a] border-[1px] border-[#ec4899] border-opacity-30 shadow-[0_4px_20px_#ec4899_30] text-[#ec4899]';
    }
    if (isRouter) {
        return 'bg-[#1a1a1a] border-[1px] border-[#8b5cf6] border-opacity-30 shadow-[0_4px_20px_#8b5cf6_30] text-[#8b5cf6]';
    }
    if (isClientSDKSpan) {
        return 'bg-[#1a1a1a] border-[1px] border-[#3b82f6] border-opacity-30 shadow-[0_4px_20px_#ec4899_30] text-[#10b981]';
    }
    if (operationName === 'cloud_api_invoke') {
        return 'bg-[#1a1a1a]';
    }
    if (operationName === 'api_invoke') {
        return 'bg-[#1a1a1a] border-[1px] border-[#3b82f6] border-opacity-30 shadow-[0_4px_20px_#ec4899_30] text-[#10b981]';
    }
    if (operationName.startsWith('guard_')) {
        return 'border-[1px] border-[#ec4899] border-opacity-30 shadow-[0_4px_20px_#ec4899_30]';
    }
    if (operationName.startsWith('model_')) {
        return 'bg-[#1a1a1a]';
    }
    if (operationName.startsWith('tools')) {
        return 'border-[1px] border-[#3b82f6] border-opacity-30 shadow-[0_4px_20px_#3b82f6_30]';
    }
    if (operationName.startsWith('virtual_model')) {
        return 'border-[1px] border-[#10b981] border-opacity-30 shadow-[0_4px_20px_#10b981_30]';
    }
    if (!['api_invoke', 'cloud_api_invoke', 'model_call', 'tools'].includes(operationName) && !operationName.startsWith('guard_')) {
        const parentSpans = relatedSpans.filter(s => s.span_id === span.parent_span_id);
        if (parentSpans.length > 0) {
            let parentSpan = parentSpans[0];
            if (parentSpan.operation_name == 'model_call') {
                return `border-[1px] border-[#eab308] border-opacity-30 shadow-[0_4px_20px_#eab308_30]`;
            }
        }
    }
    return 'bg-[#1a1a1a]';
}



export const getOperationTitle = (props: {
    operation_name: string,
    span?: Span
}) => {
    const { operation_name, span } = props;
    if (span) {
        let isClientSDKSpan = isClientSDK(span);
        if (isClientSDKSpan) {
            let isAgent = isAgentSpan(span);
            if (isAgent) {
                return 'Agent';
            }
            let attributes = span.attribute as any;
            let title = attributes?.langdb_client_name || attributes['langdb.client_name'];
            // uppercase first letter
            title = title.charAt(0).toUpperCase() + title.slice(1);
            return `${title} Action`;
        }
    }
    if (span && isRouterSpan(span)) {
        return 'Router';
    }
    if (operation_name === 'cloud_api_invoke') {
        return 'Cloud API Invoke';
    }
    if (operation_name === 'api_invoke') {
        return 'API Invoke';
    }
    if (operation_name.startsWith('guard_')) {
        return 'Guard';
    }
    if (operation_name.startsWith('virtual_model')) {
        return 'Virtual Model';
    }
    if (operation_name.startsWith('model_')) {
        return 'Model';
    }
    if (operation_name.startsWith('tools')) {
        return 'Tools';
    }
    if (operation_name === 'cache') {
        return 'Cache Model Response';
    }
    if (span && isPromptCachingApplied(span)) {
        return 'Model with prompt caching';
    }
    return 'Model';
}

export const getTimelineBgColor = (props: {
    span: Span,
    relatedSpans: Span[]
}) => {
    const { span, relatedSpans } = props;
    let operationName = span.operation_name;
    let isClientSDKSpan = isClientSDK(span);
    if (isClientSDKSpan) {
        if (isAgentSpan(span)) {
            return '#ec4899';
        }
        return '#10b981';
    }
    if (isRouterSpan(span)) {
        return '#8b5cf6';
    }

    if (operationName === 'cloud_api_invoke') {
        return 'bg-[#1a1a1a]';
    }
    if (operationName === 'api_invoke') {
        return getColorByType('api_invoke');
    }
    if (operationName.startsWith('guard_')) {
        return getColorByType('GuardNode');
    }
    if (operationName.startsWith('virtual_model')) {
        return getColorByType('VirtualModelNode');
    }
    if (operationName.startsWith('model_')) {
        return getColorByType('SpanModelNode');
    }
    if (operationName.startsWith('tools')) {
        return getColorByType('SpanToolNode');
    }
    if (!['api_invoke', 'cloud_api_invoke', 'model_call', 'tools'].includes(operationName) && !operationName.startsWith('guard_')) {
        const parentSpans = relatedSpans.filter(s => s.span_id === span.parent_span_id);
        if (parentSpans.length > 0) {
            let parentSpan = parentSpans[0];
            if (parentSpan.operation_name == 'model_call') {

                return getColorByType('SpanToolNode')
            }
        }
    }
    return getColorByType('SpanToolNode');
}
export const getOperationIcon = (props: {
    span: Span,
    relatedSpans: Span[]
}) => {
    const { span, relatedSpans } = props;
    let operationName = span.operation_name;
    let isClientSDKSpan = isClientSDK(span);
    let isAgent = isAgentSpan(span);
    if (isAgent) {
        return <BotIcon className="w-4 h-4" />;
    }
    if(operationName === 'run') {
        return <PlayIcon className="w-4 h-4" />;
    }
    if (isClientSDKSpan) {
        return <ClapperboardIcon className="w-4 h-4" />;
    }
    if (operationName === 'cloud_api_invoke') {
        return <CloudIcon className="w-4 h-4" />;
    }
    if (operationName === 'api_invoke') {
        return <ArrowsUpDownIcon className="w-4 h-4" />;
    }
    if (isRouterSpan(span)) {
        return <ArrowsPointingOutIcon className="w-4 h-4" />
    }
    if (operationName.startsWith('guard_')) {
        let attributes = span.attribute as any;
        let result = attributes['result'] as string;
        let resultJson = tryParseJson(result);
        let isOk = resultJson?.Ok && resultJson?.Ok?.passed && resultJson?.Ok?.passed === true || resultJson?.passed === true;

        return isOk ? <ShieldCheckIcon className="w-4 h-4 text-[#ec4899]" /> : <ShieldExclamationIcon className="w-4 h-4" />;
    }
    if (operationName.startsWith('model_')) {
        return <AcademicCapIcon className="w-4 h-4" />;
    }
    if (operationName.startsWith('tools')) {
        return <WrenchScrewdriverIcon className="w-4 h-4 text-[#3b82f6]" />;
    }
    if (operationName.startsWith('virtual_model')) {
        return <ProviderIcon provider_name="virtual_model" className="w-4 h-4" />;
    }
    if (operationName === 'cache') {
        const parentSpans = relatedSpans.filter(s => s.span_id === span.parent_span_id);
        if (parentSpans.length > 0) {
            let parentSpan = parentSpans[0];
            if (parentSpan.operation_name == 'model_call') {
                let attributes = parentSpan.attribute;
                let provider_name = attributes['provider_name'] as string;
                return <ProviderIcon provider_name={provider_name} className="w-4 h-4" />;
            }
        }
    }
    if (!['api_invoke', 'cloud_api_invoke', 'model_call', 'tools'].includes(operationName) && !operationName.startsWith('guard_')) {
        const parentSpans = relatedSpans.filter(s => s.span_id === span.parent_span_id);
        if (parentSpans.length > 0) {
            let parentSpan = parentSpans[0];
            if (parentSpan.operation_name == 'model_call') {
                let attributes = parentSpan.attribute;
                let provider_name = attributes['provider_name'] as string;
                return <ProviderIcon provider_name={provider_name} className="w-4 h-4" />;
            }
        }
    }
    return <ProviderIcon provider_name={operationName} className="w-4 h-4" />;
}
