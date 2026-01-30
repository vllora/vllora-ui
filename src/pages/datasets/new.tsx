/**
 * NewDatasetPage
 *
 * Dedicated page for creating a new dataset from gateway traces or uploaded files.
 * Accessible at /datasets/new route.
 */

import { SelectSpansOrUploadFile } from "@/components/datasets/SelectSpansOrUploadFile";
import { DatasetsUIProvider } from "@/contexts/DatasetsUIContext";

export function NewDatasetPage() {
  return (
    <DatasetsUIProvider>
      <section className="flex-1 flex overflow-hidden bg-background text-foreground relative">
        <div className="flex-1 flex flex-col overflow-hidden">
          <SelectSpansOrUploadFile />
        </div>
      </section>
    </DatasetsUIProvider>
  );
}
