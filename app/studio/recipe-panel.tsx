"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { MAP_SIZES } from "../../lib/map-generator";
import { LANDSCAPES, PREMISE_DETAILS, STORIES, newEvent, selectLandscape, type Range, type StudioRecipe } from "../../lib/studio/model";

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="studio-field"><span>{label}</span><span className="studio-field-value">{children}</span>{hint && <small>{hint}</small>}</label>;
}
export function Slider({ label, value, onChange, min = 0, max = 100 }: { label: string; value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  return <label className="studio-slider"><span>{label}<output>{value}</output></span><input aria-label={label} type="range" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))} /></label>;
}
export function RangeField({ label, value, onChange, min = 0, max = 100, unit = "%", ends }: { label: string; value: Range; onChange: (r: Range) => void; min?: number; max?: number; unit?: string; ends?: [string, string] }) {
  const id = useId(), track = useRef<HTMLDivElement>(null), drag = useRef<0 | 1 | null>(null), current = useRef(value);
  useEffect(() => { current.current = value; }, [value]);
  const set = (index: 0 | 1, n: number) => {
    const next: Range = [...current.current]; next[index] = Math.max(index === 0 ? min : next[0], Math.min(index === 0 ? next[1] : max, Math.round(n)));
    current.current = next; onChange(next);
  };
  const pointerValue = (x: number) => { const rect = track.current!.getBoundingClientRect(); return min + Math.max(0, Math.min(1, (x - rect.left - 10) / Math.max(1, rect.width - 20))) * (max - min); };
  return <div className="studio-range" role="group" aria-labelledby={id}>
    <div className="studio-range-heading"><span id={id}>{label}</span><span className="studio-range-values">{([0, 1] as const).map(index => <span key={index}>{index === 1 && <span>–</span>}<input aria-label={`${label} ${index ? "maximum" : "minimum"} exact value`} type="number" min={min} max={max} key={`${index}-${value[index]}`} defaultValue={value[index]} onBlur={e => { if (e.target.value !== "" && Number.isFinite(Number(e.target.value))) set(index, Number(e.target.value)); else e.target.value = String(value[index]); }} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} /></span>)}<span>{unit}</span></span></div>
    <div ref={track} className="studio-dual-range" style={{ "--range-low": `${(value[0] - min) / (max - min) * 100}%`, "--range-high": `${(value[1] - min) / (max - min) * 100}%` } as React.CSSProperties}
      onPointerDown={e => { if (e.currentTarget.closest("fieldset")?.disabled) return; e.preventDefault(); const n = pointerValue(e.clientX), low = Math.abs(n - value[0]), high = Math.abs(n - value[1]); drag.current = low < high || low === high && n <= value[0] ? 0 : 1; e.currentTarget.setPointerCapture(e.pointerId); (e.currentTarget.querySelectorAll("input")[drag.current] as HTMLInputElement).focus(); set(drag.current, n); }}
      onPointerMove={e => { if (drag.current !== null) set(drag.current, pointerValue(e.clientX)); }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <div className="studio-range-track"><span /></div>
      {([0, 1] as const).map(index => <input key={index} type="range" min={min} max={max} value={value[index]} aria-label={`${label} ${index ? "maximum" : "minimum"}`} aria-valuetext={`${value[index]} ${unit}`} onChange={e => set(index, Number(e.target.value))} />)}
    </div>
    {ends && <div className="studio-range-ends"><span>{ends[0]}</span><span>{ends[1]}</span></div>}
  </div>;
}
export function NarrativeControls({ recipe, onChange }: { recipe: StudioRecipe; onChange: (r: StudioRecipe) => void }) {
  return <details className="studio-history-settings"><summary>World history <span>{recipe.events.length ? `${recipe.events.length} events` : "Add a past"}</span></summary>
    <p className="studio-caption">Events reshape the same foundation in order. Their age changes the surviving landforms.</p>
    {recipe.events.map((event, index) => <div className="studio-event" key={event.id}>
      <div className="studio-event-heading"><strong>{index + 1}. {STORIES.find(s => s.id === event.kind)?.name}</strong><button aria-label={`Move event ${index + 1} earlier`} disabled={index === 0} onClick={() => { const events = [...recipe.events]; [events[index - 1], events[index]] = [events[index], events[index - 1]]; onChange({ ...recipe, events }); }}>↑</button><button aria-label={`Remove event ${index + 1}`} onClick={() => onChange({ ...recipe, events: recipe.events.filter(e => e.id !== event.id) })}>×</button></div>
      <p className="studio-caption">{STORIES.find(s => s.id === event.kind)?.description}</p>
      {([["intensity", "Strength"], ["age", "Age"]] as const).map(([key, label]) => <Slider key={key} label={`${label} · event ${index + 1}`} value={Math.round(event[key] * 100)} onChange={v => onChange({ ...recipe, events: recipe.events.map(e => e.id === event.id ? { ...e, [key]: v / 100 } : e) })} />)}
      <details><summary>Position & extent</summary><Field label="Placement"><select value={event.placement ?? "FIXED"} onChange={e => onChange({ ...recipe, events: recipe.events.map(item => item.id === event.id ? { ...item, placement: e.target.value as "FIXED" | "INLAND" | "ICE_MARGIN" } : item) })}><option value="FIXED">Exact position</option><option value="INLAND">Nearby continental interior</option><option value="ICE_MARGIN">Nearby ice margin</option></select></Field>{([["x", "West → east"], ["y", "South → north"], ["radius", "Extent"]] as const).map(([key, label]) => <Slider key={key} label={`${label} · event ${index + 1}`} min={key === "radius" ? 3 : 0} max={key === "radius" ? 50 : 100} value={Math.round(event[key] * 100)} onChange={v => onChange({ ...recipe, events: recipe.events.map(e => e.id === event.id ? { ...e, [key]: v / 100 } : e) })} />)}</details>
    </div>)}
    <Field label="Add event"><select value="" disabled={recipe.events.length >= 8} onChange={e => { if (e.target.value) onChange({ ...recipe, events: [...recipe.events, newEvent(e.target.value as typeof recipe.events[number]["kind"])] }); }}><option value="">Choose a history…</option>{STORIES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
  </details>;
}
export function ClimateControls({ recipe, onChange }: { recipe: StudioRecipe; onChange: (r: StudioRecipe) => void }) {
  return <>{([["temperature", "Temperature"], ["rainfall", "Rainfall"], ["erosion", "Erosion"], ["rivers", "River density"]] as const).map(([key, label]) => <Slider key={key} label={label} value={recipe[key]} onChange={v => onChange({ ...recipe, [key]: v })} />)}</>;
}
export function RecipePanel({ recipe, onChange, disabled }: { recipe: StudioRecipe; onChange: (recipe: StudioRecipe) => void; disabled: boolean }) {
  const set = <K extends keyof StudioRecipe>(key: K, value: StudioRecipe[K]) => onChange({ ...recipe, [key]: value });
  const landscape = LANDSCAPES.find(l => l.id === recipe.landscape)!, detail = PREMISE_DETAILS[recipe.landscape];
  return <fieldset className="studio-recipe" disabled={disabled}>
    <section className="studio-premise">
      <span className="studio-eyebrow">WORLD PREMISE</span>
      <select aria-label="World premise" value={recipe.landscape} onChange={e => onChange(selectLandscape(recipe, e.target.value as StudioRecipe["landscape"]))}>{LANDSCAPES.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
      <p>{landscape.description}</p>
      <details><summary>Geography & possible play</summary><p className="studio-caption">{detail.identity}</p><p className="studio-caption">{detail.play}</p><p className="studio-caption studio-processes">{detail.processes}</p></details>
    </section>
    <section className="studio-control-section">
      <div className="studio-segment" aria-label="Generation priority"><button type="button" aria-pressed={recipe.foundation === "GEOGRAPHY"} onClick={() => set("foundation", "GEOGRAPHY")}>Geography-led</button><button type="button" aria-pressed={recipe.foundation === "GAMEPLAY"} onClick={() => set("foundation", "GAMEPLAY")}>Gameplay-led</button></div>
      <div className="studio-paired-fields"><Field label="Size"><select value={recipe.size} onChange={e => set("size", e.target.value as StudioRecipe["size"])}>{MAP_SIZES.filter(s => !s.gameBreaking).map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></Field><Field label="Humans"><input type="number" min={2} max={22} value={recipe.players} onChange={e => set("players", Number(e.target.value))} /></Field></div>
      <RangeField label="Water" value={recipe.water} max={90} onChange={r => set("water", r)} ends={["More land", "More water"]} />
      <RangeField label="Mountains" value={recipe.mountains} max={38} onChange={r => set("mountains", r)} ends={["Fewer peaks", "More peaks"]} />
    </section>
    <details><summary>Strategic intentions</summary><p className="studio-caption">Guide candidate selection and local development. The chosen premise remains the foundation.</p><RangeField label="Land contact" min={1} max={80} unit="cost" value={recipe.contact} onChange={r => set("contact", r)} ends={["Early pressure", "Room to develop"]} /><RangeField label="Approach width" min={1} max={8} unit="tiles" value={recipe.frontage} onChange={r => set("frontage", r)} ends={["Concentrated", "Room to manoeuvre"]} /><Field label="Balance"><select value={recipe.balance} onChange={e => set("balance", e.target.value as StudioRecipe["balance"])}><option value="OPEN">Open / surprising</option><option value="OPENING">Opening opportunities</option><option value="STRATEGIC">Broader opportunities</option><option value="SYMMETRIC">Rotational arena</option></select></Field><Field label="Teams"><select value={recipe.teams} onChange={e => set("teams", Number(e.target.value))}><option value={0}>Free-for-all</option><option value={2}>2 teams</option><option value={3}>3 teams</option><option value={4}>4 teams</option></select></Field></details>
    <NarrativeControls recipe={recipe} onChange={onChange} />
    <details><summary>Climate & landforms</summary><Field label="Character"><select value={recipe.character} onChange={e => set("character", e.target.value as StudioRecipe["character"])}><option value="REALISTIC">Coherent</option><option value="FANTASTICAL">Extraordinary</option><option value="MUNDANE">Restrained</option><option value="BRUTAL">Hostile</option></select></Field><ClimateControls recipe={recipe} onChange={onChange} /></details>
    <details><summary>Resources & wonders</summary>{([["resources", "Bonus resources"], ["luxuries", "Luxuries"], ["strategics", "Strategic resources"]] as const).map(([key, label]) => <Slider key={key} label={label} value={recipe[key]} onChange={v => set(key, v)} />)}<Field label="Wonders"><input type="number" min={0} max={12} value={recipe.wonders} onChange={e => set("wonders", Number(e.target.value))} /></Field><Field label="City states"><input type="number" min={0} max={41} value={recipe.cityStates} onChange={e => set("cityStates", Number(e.target.value))} /></Field></details>
    <details><summary>World shape & search</summary><Field label="Proportions"><select value={recipe.geometry} onChange={e => set("geometry", e.target.value as StudioRecipe["geometry"])}><option value="STANDARD">Standard</option><option value="WIDE">Wide</option><option value="TALL">Tall</option><option value="SQUARE">Square</option></select></Field><label className="studio-check"><input type="checkbox" checked={recipe.wraps} onChange={e => set("wraps", e.target.checked)} />Wrap east / west</label><Field label="Seed"><input value={recipe.seed} onChange={e => set("seed", e.target.value)} spellCheck={false} /></Field><Field label="Foundations"><select value={recipe.candidates} onChange={e => set("candidates", Number(e.target.value))}><option value={1}>1 · direct</option><option value={3}>3 · considered</option><option value={6}>6 · thorough</option><option value={12}>12 · extensive</option></select></Field><Slider label="Development rounds" min={0} max={6} value={recipe.development} onChange={v => set("development", v)} /><p className="studio-caption">Compare viable foundations, then develop promising ones through local changes. You can cancel at any time.</p></details>
  </fieldset>;
}
