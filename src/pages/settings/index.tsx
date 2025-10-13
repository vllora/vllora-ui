import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { ProjectDropdown } from "@/components/ProjectDropdown";
import { ProviderKeysPage } from "./providers";
import { ApiKeysPage } from "./api-keys";
import { UsersPage } from "./users";
import { ModelsPage } from "./models";
import { CostControlPage } from "./cost-control";

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeSection, setActiveSection] = useState("providers");

  // Sync URL params with active section
  useEffect(() => {
    const section = searchParams.get("section");
    if (section) {
      setActiveSection(section);
    }
  }, [searchParams]);

  const handleSectionChange = (section: string) => {
    setActiveSection(section);
    const newParams = new URLSearchParams(searchParams);
    newParams.set("section", section);
    setSearchParams(newParams);
  };

  const handleProjectChange = (_projectId: string) => {
    // Project change is handled by ProjectDropdown updating the URL query string
    // The models page will automatically refresh when project changes
  };

  const renderContent = () => {
    switch (activeSection) {
      case "providers":
        return <ProviderKeysPage />;
      case "api-keys":
        return <ApiKeysPage />;
      case "users":
        return <UsersPage />;
      case "models":
        return <ModelsPage />;
      case "cost-control":
        return <CostControlPage />;
      default:
        return <ProviderKeysPage />;
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-background">
      {/* Content */}
      <main className="flex-1 overflow-auto">
        {renderContent()}
      </main>
    </div>
  );
}