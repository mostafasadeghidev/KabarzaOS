import { cn } from '@/lib/utils';

/** حالتِ خالی — به‌جای صفحهٔ سفید، توضیحِ روشن. */
export function EmptyState({
  title,
  description,
  className,
}: {
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={cn('rounded-[--radius] border border-dashed p-10 text-center', className)}>
      <p className="font-medium">{title}</p>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}
