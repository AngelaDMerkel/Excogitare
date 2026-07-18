"use client";

import { useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import type { GenerationHistoryEntry } from "@/lib/generation-history";

export type CreateStage = "GENERATE" | "REFINE" | "ITERATE" | "EDIT" | "ANALYZE";

export const CREATE_STAGES: ReadonlyArray<{ id: CreateStage; label: string; description: string }> = [
  { id: "GENERATE", label: "Design", description: "Choose the construction engine, narrative, scale, size and world shape." },
  { id: "REFINE", label: "Refine", description: "Apply environmental character, content, population and match assumptions." },
  { id: "ITERATE", label: "Iterate", description: "Browse branches, rerun passes and compare deliberate revisions." },
  { id: "EDIT", label: "Edit", description: "Paint tiles, reshape regions and protect or relocate authored structures." },
  { id: "ANALYZE", label: "Review", description: "Inspect balance, retained evidence and Civ V export readiness." },
] as const;

export function normalizeCreateStage(value: unknown): { stage: CreateStage; recovered: boolean } {
  const stage = CREATE_STAGES.find((candidate) => candidate.id === value)?.id;
  return stage ? { stage, recovered: false } : { stage: "GENERATE", recovered: value !== undefined && value !== null && value !== "" };
}

export function CreateStageTabs({ active, onChange }: { active: CreateStage; onChange: (stage: CreateStage) => void }) {
  const tabListRef = useRef<HTMLDivElement>(null);
  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % CREATE_STAGES.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + CREATE_STAGES.length) % CREATE_STAGES.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = CREATE_STAGES.length - 1;
    else return;
    event.preventDefault();
    onChange(CREATE_STAGES[next].id);
    window.requestAnimationFrame(() => tabListRef.current?.querySelectorAll<HTMLButtonElement>("[role=tab]")[next]?.focus());
  };
  return (
    <div ref={tabListRef} id="create-workspace-navigation" className="workspace-stage-tabs" role="tablist" aria-label="Create workspace">
      {CREATE_STAGES.map((stage, index) => (
        <button
          key={stage.id}
          id={`create-stage-tab-${stage.id.toLowerCase()}`}
          type="button"
          role="tab"
          aria-controls="create-workspace-panel"
          aria-selected={active === stage.id}
          tabIndex={active === stage.id ? 0 : -1}
          className={active === stage.id ? "is-active" : ""}
          data-tooltip={stage.description}
          onClick={() => onChange(stage.id)}
          onKeyDown={(event) => moveFocus(event, index)}
        >
          {stage.label}
        </button>
      ))}
    </div>
  );
}

function disclosureKey(panel: HTMLElement, details: HTMLDetailsElement) {
  if (details.dataset.sectionId) return details.dataset.sectionId;
  const classes = [...details.classList].filter((name) => name !== "creator-group").sort();
  if (classes.length) return classes.join(".");
  return `details-${[...panel.querySelectorAll("details")].indexOf(details)}`;
}

export function CreateStagePanel({ stage, disclosureState, onDisclosureChange, children }: {
  stage: CreateStage;
  disclosureState: Record<string, boolean>;
  onDisclosureChange: (stage: CreateStage, key: string, open: boolean) => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    for (const details of panel.querySelectorAll<HTMLDetailsElement>("details")) {
      const stored = disclosureState[disclosureKey(panel, details)];
      if (stored !== undefined) details.open = stored;
    }
    const recordToggle = (event: Event) => {
      const details = event.target;
      if (details instanceof HTMLDetailsElement) onDisclosureChange(stage, disclosureKey(panel, details), details.open);
    };
    panel.addEventListener("toggle", recordToggle, true);
    return () => panel.removeEventListener("toggle", recordToggle, true);
  }, [disclosureState, onDisclosureChange, stage]);
  return (
    <div
      ref={panelRef}
      id="create-workspace-panel"
      className="creator-panel"
      role="tabpanel"
      aria-labelledby={`create-stage-tab-${stage.toLowerCase()}`}
    >
      {children}
    </div>
  );
}

export function CreateOperationStatus({ running, stage, error, onCancel }: { running: boolean; stage: string; error: string; onCancel: () => void }) {
  if (!running && !error) return null;
  return (
    <div className={`create-operation-status${error ? " has-error" : ""}`} role={error ? "alert" : "status"} aria-live={error ? "assertive" : "polite"}>
      <span><strong>{error ? "Operation failed" : "Create is working"}</strong><small>{error || stage || "Preparing operation…"}</small></span>
      {running && <button type="button" onClick={onCancel}>Cancel</button>}
    </div>
  );
}

export function GenerationHistoryCard({ entry, active, preset, onOpen, onUseRecipe }: {
  entry: GenerationHistoryEntry;
  active: boolean;
  preset: string;
  onOpen: () => void;
  onUseRecipe: () => void;
}) {
  const options = entry.map.generation;
  return (
    <article className={`generation-history-card${active ? " is-active" : ""}`}>
      <button type="button" className="generation-history-open" onClick={onOpen}>
        <span><strong>Generation {entry.id}</strong><small>{options ? `${options.style.toLowerCase()} · ${preset}` : preset}</small></span>
        <span><em>{entry.map.width} × {entry.map.height}</em><code>{options?.seed ?? "unknown seed"}</code></span>
      </button>
      <div className="generation-history-provenance">
        <small>{entry.parentId === undefined ? "Root generation" : `Branched from ${entry.parentId}`} · {entry.operation.toLowerCase().replaceAll("_", " ")}</small>
        <button type="button" disabled={!entry.map.recipe && !entry.map.generation} onClick={onUseRecipe}>Use as Design recipe</button>
      </div>
    </article>
  );
}
