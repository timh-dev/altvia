import { useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface PlaceResult {
  displayName: string;
  latitude: number;
  longitude: number;
  boundingBox: [number, number, number, number] | null;
}

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
  boundingbox?: [string, string, string, string];
}

interface PlaceSearchProps {
  onPlaceSelected: (place: PlaceResult) => void;
}

export function PlaceSearch({ onPlaceSelected }: PlaceSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setOpen(false);
      setLoading(false);
      return;
    }

    setLoading(true);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      if (abortRef.current) {
        abortRef.current.abort();
      }

      const controller = new AbortController();
      abortRef.current = controller;

      const params = new URLSearchParams({ q: query, format: "jsonv2", limit: "5" });

      fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
        signal: controller.signal,
        headers: { "Accept-Language": "en" },
      })
        .then((response) => response.json())
        .then((data: NominatimResult[]) => {
          const places: PlaceResult[] = data.map((item) => {
            let boundingBox: [number, number, number, number] | null = null;
            if (item.boundingbox) {
              const [south, north, west, east] = item.boundingbox.map(Number);
              boundingBox = [south, north, west, east];
            }
            return {
              displayName: item.display_name,
              latitude: Number(item.lat),
              longitude: Number(item.lon),
              boundingBox,
            };
          });
          setResults(places);
          setOpen(places.length > 0 || query.length >= 3);
          setHighlightIndex(-1);
          setLoading(false);
        })
        .catch((err) => {
          if (err.name !== "AbortError") {
            setLoading(false);
          }
        });
    }, 400);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  function selectPlace(place: PlaceResult) {
    setQuery(place.displayName.split(",")[0]);
    setOpen(false);
    onPlaceSelected(place);
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (!open || results.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (highlightIndex >= 0 && highlightIndex < results.length) {
        selectPlace(results[highlightIndex]);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  function handleFocus() {
    if (results.length > 0) {
      setOpen(true);
    }
  }

  function handleClear() {
    setQuery("");
    setResults([]);
    setOpen(false);
    inputRef.current?.focus();
  }

  function parseName(displayName: string): { primary: string; secondary: string } {
    const parts = displayName.split(",");
    const primary = parts[0].trim();
    const secondary = parts.slice(1).join(",").trim();
    return { primary, secondary };
  }

  return (
    <div ref={containerRef} className="pointer-events-auto relative">
      <div className="flex items-center gap-1.5 rounded-full border border-[var(--border-translucent-light)] bg-[var(--glass-panel)] px-3 py-2 shadow-[0_18px_36px_var(--shadow-color)] backdrop-blur-[24px]">
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--text-label)]" />
        ) : (
          <Search className="h-3.5 w-3.5 shrink-0 text-[var(--text-label)]" />
        )}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          placeholder="Search places"
          className="w-24 bg-transparent text-[11px] uppercase tracking-[0.18em] text-[var(--text-secondary)] placeholder-[var(--text-very-faint)] outline-none sm:w-36"
        />
        {query.length > 0 ? (
          <button type="button" onClick={handleClear} className="shrink-0 text-[var(--text-very-faint)] transition hover:text-[var(--text-secondary)]">
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="absolute left-0 top-full z-50 mt-2 w-[min(400px,calc(100vw-3rem))] rounded-[1rem] border border-[var(--border-translucent)] bg-[var(--glass-dropdown)] p-2 shadow-[0_18px_36px_var(--shadow-medium)] backdrop-blur-[20px]">
          {results.length > 0 ? (
            results.map((place, index) => {
              const { primary, secondary } = parseName(place.displayName);
              return (
                <button
                  key={`${place.latitude}-${place.longitude}-${index}`}
                  type="button"
                  onClick={() => selectPlace(place)}
                  onPointerEnter={() => setHighlightIndex(index)}
                  className={cn(
                    "flex w-full flex-col rounded-[0.8rem] px-3 py-2 text-left transition",
                    index === highlightIndex ? "bg-[var(--surface-elevated)]" : "hover:bg-[var(--glass-button)]",
                  )}
                >
                  <span className="text-sm font-medium text-[var(--text-secondary)]">{primary}</span>
                  {secondary ? (
                    <span className="truncate text-xs text-[var(--text-faint)]">{secondary}</span>
                  ) : null}
                </button>
              );
            })
          ) : query.length >= 3 ? (
            <p className="px-3 py-2 text-xs text-[var(--text-faint)]">No places found</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
