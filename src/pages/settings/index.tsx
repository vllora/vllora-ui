import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ProviderKeysPage } from "./provider-keys"

export function SettingsPage() {
  return (
    <Tabs defaultValue="providers" className="w-full flex flex-col h-full p-6">
      <div>
        <TabsList className="bg-secondary/20 border border-border">
          <TabsTrigger
            className="data-[state=active]:bg-secondary data-[state=active]:text-white"
            value="providers">
            Providers
          </TabsTrigger>
          <TabsTrigger
            disabled
            className="data-[state=active]:bg-secondary data-[state=active]:text-white"
            value="settings">
            Settings
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="providers" className="mt-6 overflow-auto flex-1 max-h-[calc(100vh-80px)]">
        <ProviderKeysPage />
      </TabsContent>
    </Tabs>
  )
}