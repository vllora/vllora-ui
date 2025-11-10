import { FolderOpen, Trash2 } from 'lucide-react';
import { useNavigate } from "react-router";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

interface Project {
  id: string;
  name: string;
  description?: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

interface ProjectCardProps {
  project: Project;
  isDefaultProject: (projectId: string) => boolean;
  formatDate: (dateString: string) => string;
  onDelete: (projectId: string) => void;
}

export function ProjectCard({
  project,
  formatDate,
  onDelete,
}: ProjectCardProps) {
  const navigate = useNavigate();

  return (
    <Card
      key={project.id}
      className="hover:border-[rgb(var(--theme-500))] hover:shadow-lg hover:shadow-[rgba(var(--theme-500),0.1)] transition-all duration-200 group cursor-pointer relative overflow-hidden"
      onClick={() => {
        // Navigate to project with query parameter-based routing
        navigate(`/?projectId=${project.id}`);
      }}
    >
      {/* Gradient overlay on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-[rgba(var(--theme-500),0.05)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

      <CardHeader className="relative">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FolderOpen className="h-5 w-5 text-[rgb(var(--theme-500))] flex-shrink-0" />
              <span className="truncate">{project.name}</span>
              {project.is_default && (
                <Badge variant="secondary" className="text-xs bg-yellow-500/10 text-yellow-600 dark:text-yellow-500 px-2 py-0.5 rounded-full font-medium border border-yellow-500/20">
                  Default
                </Badge>
              )}
            </CardTitle>
            {project.description && (
              <CardDescription className="mt-2 line-clamp-2">
                {project.description}
              </CardDescription>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(project.id);
            }}
            className="opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 flex-shrink-0"
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="relative">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="font-medium">Created:</span>
          <span>{formatDate(project.created_at)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
