export type LuaProjectDependency = {
  name: string;
  source: string;
};

export type LuaScriptOption = {
  index: number;
  name: string;
  values: string[];
  defaultValue: number;
  selectedValue: number;
};

export type LuaPipelineStage = {
  id: "LOAD" | "METADATA" | "ALLOCATE" | "PLOTS" | "TERRAIN" | "FEATURES" | "RIVERS" | "CONTINENTS" | "POST_PROCESS" | "CAPTURE";
  label: string;
  status: "COMPLETE" | "SKIPPED";
  detail: string;
};

export type LuaRuntimeMetadata = {
  name: string;
  description: string;
  width: number;
  height: number;
  wraps: boolean;
  options: LuaScriptOption[];
  requestedIncludes: string[];
  loadedIncludes: string[];
  missingIncludes: string[];
  stages: LuaPipelineStage[];
};

const BUILT_IN_INCLUDES = new Set(["math", "bit", "mapgenerator", "fluavector", "assignstartingplots", "terrain_generator", "featuregenerator"]);

export function normalizeLuaIncludeName(name: string) {
  return name.trim().replaceAll("\\", "/").split("/").at(-1)?.replace(/\.lua$/i, "").toLowerCase() ?? "";
}

export function findLuaIncludes(source: string) {
  const includes: string[] = [];
  const seen = new Set<string>();
  for (const match of source.matchAll(/\binclude\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    const name = match[1];
    const key = normalizeLuaIncludeName(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    includes.push(name);
  }
  return includes;
}

export function mergeLuaDependencies(current: LuaProjectDependency[], incoming: LuaProjectDependency[]) {
  const merged = new Map(current.map((file) => [normalizeLuaIncludeName(file.name), file]));
  for (const file of incoming) merged.set(normalizeLuaIncludeName(file.name), file);
  return [...merged.values()].sort((one, two) => one.name.localeCompare(two.name));
}

export function luaDependencyCoverage(source: string, dependencies: LuaProjectDependency[]) {
  const supplied = new Set(dependencies.map((file) => normalizeLuaIncludeName(file.name)));
  const requested = findLuaIncludes(source);
  return {
    requested,
    supplied: requested.filter((name) => supplied.has(normalizeLuaIncludeName(name))),
    builtIn: requested.filter((name) => BUILT_IN_INCLUDES.has(normalizeLuaIncludeName(name))),
    missing: requested.filter((name) => {
      const key = normalizeLuaIncludeName(name);
      return !supplied.has(key) && !BUILT_IN_INCLUDES.has(key);
    }),
  };
}
