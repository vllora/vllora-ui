import { SVGProps } from "react"
import { ProviderIcon } from "../Icons/ProviderIcons"


export const OpenAIIcon = (props: SVGProps<SVGSVGElement>) => {
    return (
        <ProviderIcon provider_name={"openai"} {...props} />
    )
}   