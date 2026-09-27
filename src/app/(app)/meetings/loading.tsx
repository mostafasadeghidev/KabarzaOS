import { PageSkeleton } from '@/components/page-skeleton';

/** پوستهٔ بارگذاری — تا آمدنِ دادهٔ سرور. */
export default function Loading() {
  return <PageSkeleton variant="cards" />;
}
