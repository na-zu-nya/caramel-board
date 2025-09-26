import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './ui/button';

interface YearPaginationProps {
  currentYear: number;
  availableYears: number[];
  onYearChange: (year: number) => void;
}

export function YearPagination({ currentYear, availableYears, onYearChange }: YearPaginationProps) {
  const currentIndex = availableYears.indexOf(currentYear);
  const hasPrevious = currentIndex < availableYears.length - 1;
  const hasNext = currentIndex > 0;

  const handlePrevious = () => {
    if (hasPrevious) {
      onYearChange(availableYears[currentIndex + 1]);
    }
  };

  const handleNext = () => {
    if (hasNext) {
      onYearChange(availableYears[currentIndex - 1]);
    }
  };

  return (
    <div className="flex items-center justify-center gap-4 p-4">
      <Button
        variant="ghost"
        size="icon"
        onClick={handlePrevious}
        disabled={!hasPrevious}
        aria-label="Previous year"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <span className="text-lg font-semibold min-w-[60px] text-center">{currentYear}</span>

      <Button
        variant="ghost"
        size="icon"
        onClick={handleNext}
        disabled={!hasNext}
        aria-label="Next year"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
