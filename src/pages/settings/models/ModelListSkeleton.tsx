import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const ModelListSkeleton = () => {
  return (
    <>
      {[1, 2, 3, 4].map((i) => (
        <Card key={i} className="bg-card border-border shadow-sm overflow-hidden">
          <CardHeader className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Skeleton className="h-4 w-4" />
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div>
                    <Skeleton className="h-5 w-32 mb-2" />
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-4 w-12" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Skeleton className="h-2 w-24" />
                <Skeleton className="h-5 w-5 rounded-full" />
              </div>
            </div>
          </CardHeader>
        </Card>
      ))}
    </>
  );
};

export const ConfigSummarySkeleton = () => {
  return (
    <div className="flex items-center gap-2">
      <Skeleton className="h-5 w-10" />
      <Skeleton className="h-5 w-5" />
      <Skeleton className="h-5 w-10" />
      <Skeleton className="h-5 w-24" />
    </div>
  );
};


