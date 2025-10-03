import { ProviderIcon } from '@/components/Icons/ProviderIcons';
import React from 'react';
import { JsonViewer } from '../JsonViewer';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/solid';
export const ExtraParameters = (props: { input: any }) => {
    const { input } = props;

    if (!input) {
        return <div className="text-xs text-gray-500 italic">No parameters</div>;
    }
    // if input is string
    if (typeof input === 'string') {
        return <StringParameter keyInput="input" value={input} />;
    }
    const filteredKeys = Object.keys(input).filter(key => key !== 'messages' && key !== 'tools' && key !== 'model' && key !== 'contents');
    
    if (filteredKeys.length === 0) {
        return <div className="text-xs text-gray-500 italic">No additional parameters</div>;
    }
    
    return (
        <div className="space-y-1.5">
            {filteredKeys.map((key: string) => {
                const value = input[key];
                const typeInput = typeof value;
                
                return (
                    <div key={key} className={`flex gap-2 py-1 px-2 bg-[#0d0d0d] border border-border rounded ${typeInput === 'object' ? 'flex-col justify-start' : 'items-center'}`}>
                        <span className={typeInput === 'object' ? 'text-xs text-gray-400' : 'text-xs text-gray-400 min-w-[100px]'}>{key}:</span>
                        
                        {typeInput === 'boolean' && (
                            <div className="flex items-center gap-1">
                                {value ? (
                                    <CheckCircleIcon className="w-3.5 h-3.5 text-green-400" />
                                ) : (
                                    <XCircleIcon className="w-3.5 h-3.5 text-red-400" />
                                )}
                                <span className={`text-xs font-medium ${value ? 'text-green-400' : 'text-red-400'}`}>
                                    {value ? 'true' : 'false'}
                                </span>
                            </div>
                        )}
                        
                        {typeInput === 'string' && (
                            <span className="text-xs text-white font-mono truncate flex-1" title={value}>
                                {value}
                            </span>
                        )}
                        
                        {typeInput === 'number' && (
                            <span className="text-xs text-blue-400 font-mono">
                                {value}
                            </span>
                        )}
                        
                        {typeInput === 'object' && (
                            <div className="flex-1 max-w-[200px]">
                                <JsonViewer 
                                    style={{ fontSize: '10px' }} 
                                    data={value}
                                />
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

export const StringParameter = (props: { keyInput: string, value: string }) => {
    const { keyInput, value } = props;
    if (keyInput === 'model') {
        let entity = undefined;
        if (entity) {
            let modelPrice = entity as any;
            return <></>
            // if (modelPrice.inference_provider) {
            //     return <div className="flex flex-row items-center gap-1">
            //         <ProviderIcon className="w-5 h-5" provider_name={modelPrice.inference_provider.provider} />
            //         <span className="text-sm text-white font-mono break-all">
            //             {value}
            //         </span>
            //     </div>
            // }
        }
    }
    return (
        <div className="flex flex-col gap-1 bg-[#111111] p-2 rounded-md border border-border">
            <span className="text-xs font-medium text-gray-300">{keyInput}</span>
            <span className="text-xs text-gray-400 font-mono break-all">
                {value}
            </span>
        </div>
    );
}
