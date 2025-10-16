import { GoogleAdkIcon } from "./google-adk-icon";
import { CrewaiIcon } from "./crewai-icon";
import { OpenAIIcon } from "./openai-icon";
import { LangchainIcon } from "./langchain-icon";
import { AgnoIcon } from "./agno-icon";
import { cn } from "@/lib/utils";

export const ClientSdkIcon = (props: any) => {
    const { client_name } = props;
    if(client_name == 'google_adk') {
        return <GoogleAdkIcon {...props} />;
    }
    if(client_name == 'crewai') {
        return <CrewaiIcon {...props} />;
    }
    if(client_name == 'openai') {
        return <OpenAIIcon {...props} />;
    }
    if(client_name == 'langchain') {
        return <LangchainIcon {...props} />;
    }
    if(client_name == 'agno') {
        return <AgnoIcon {...props} className={cn(props.className || '', 'rounded-full')} width={20} height={20}/>;
    }
    return <GoogleAdkIcon {...props} />;
}

        