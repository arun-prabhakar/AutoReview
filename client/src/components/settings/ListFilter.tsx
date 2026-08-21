import { Search, SearchX, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function ListFilter({
  value,
  onChange,
  placeholder,
  label,
  resultCount,
  totalCount,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  resultCount: number;
  totalCount: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="pl-9 pr-8"
        />
        {value && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {value.trim() !== "" && (
        <p role="status" className="whitespace-nowrap text-xs text-muted-foreground">
          {resultCount} of {totalCount}
        </p>
      )}
    </div>
  );
}

export function NoMatchesState({ query, entityLabel, onClear }: { query: string; entityLabel: string; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <SearchX className="mb-3 h-8 w-8 text-muted-foreground/50" />
      <p className="mb-1 text-sm font-medium text-muted-foreground">No {entityLabel} match your search</p>
      <p className="mb-4 text-xs text-muted-foreground">
        Nothing matches <span className="font-medium text-foreground">&ldquo;{query.trim()}&rdquo;</span>. Try a different search term.
      </p>
      <Button variant="outline" size="sm" onClick={onClear}>Clear search</Button>
    </div>
  );
}
