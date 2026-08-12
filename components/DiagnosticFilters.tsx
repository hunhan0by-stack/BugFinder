"use client";

import { useState } from "react";
import DiagnosticIssueCard from "./DiagnosticIssueCard";
import type { DiagnosticIssue, Severity } from "@/types/scan";

const FILTERS: Array<{ id: "ALL" | Severity; label: string }> = [
  { id: "ALL", label: "All" },
  { id: "HIGH", label: "High" },
  { id: "MEDIUM", label: "Medium" },
  { id: "LOW", label: "Low" },
  { id: "INFO", label: "Info" },
];

export default function DiagnosticFilters({
  issues,
  counts,
}: {
  issues: DiagnosticIssue[];
  counts: Record<Severity, number> & { ALL: number };
}) {
  const [active, setActive] = useState<"ALL" | Severity>("ALL");

  const visible =
    active === "ALL"
      ? issues
      : issues.filter((issue) => issue.severity === active);

  return (
    <div className="space-y-4">
      <div
        role="group"
        aria-label="Filter diagnostics by severity"
        className="flex flex-wrap gap-2"
      >
        {FILTERS.map((filter) => {
          const pressed = active === filter.id;
          return (
            <button
              key={filter.id}
              type="button"
              aria-pressed={pressed}
              onClick={() => setActive(filter.id)}
              className={
                pressed
                  ? "rounded-lg border border-neutral-900 bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
                  : "border-line rounded-lg border bg-white px-3 py-1.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
              }
            >
              {filter.label} ({counts[filter.id]})
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <p className="text-muted text-sm">
          No diagnostic issues match the selected severity filter.
        </p>
      ) : (
        <ul className="space-y-4">
          {visible.map((issue) => (
            <li key={issue.id}>
              <DiagnosticIssueCard issue={issue} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
