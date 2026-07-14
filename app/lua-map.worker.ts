import { LuaFactory, type LuaEngine } from "wasmoon";
import type { Civ5Tile } from "../lib/civ5-map.ts";
import {
  findLuaIncludes,
  normalizeLuaIncludeName,
  type LuaPipelineStage,
  type LuaProjectDependency,
  type LuaRuntimeMetadata,
  type LuaScriptOption,
} from "../lib/lua-project.ts";

type ScriptStart = { x: number; y: number; player: number; cityState: boolean };
type Request = {
  source: string;
  width: number;
  height: number;
  wraps: boolean;
  worldSize: number;
  seed: number;
  players: number;
  cityStates: number;
  customOptions?: number[];
  dependencies?: LuaProjectDependency[];
  postProcessSource?: string;
};
type Response =
  | { ok: true; tiles: Civ5Tile[]; starts: ScriptStart[]; logs: string[]; metadata: LuaRuntimeMetadata }
  | { ok: false; error: string; logs: string[]; stages: LuaPipelineStage[] };

const luaTerrains = ["TERRAIN_GRASS", "TERRAIN_PLAINS", "TERRAIN_DESERT", "TERRAIN_TUNDRA", "TERRAIN_SNOW", "TERRAIN_COAST", "TERRAIN_OCEAN"];
const luaFeatures = [
  "FEATURE_ICE", "FEATURE_JUNGLE", "FEATURE_MARSH", "FEATURE_OASIS", "FEATURE_FLOOD_PLAINS", "FEATURE_FOREST", "FEATURE_FALLOUT", "FEATURE_CRATER",
  "FEATURE_FUJI", "FEATURE_MESA", "FEATURE_REEF", "FEATURE_VOLCANO", "FEATURE_GIBRALTAR", "FEATURE_GEYSER", "FEATURE_FOUNTAIN_YOUTH",
  "FEATURE_POTOSI", "FEATURE_EL_DORADO", "FEATURE_ATOLL", "FEATURE_LAKE", "FEATURE_RIVER",
];
const luaResources = [
  "RESOURCE_IRON", "RESOURCE_HORSE", "RESOURCE_COAL", "RESOURCE_OIL", "RESOURCE_ALUMINUM", "RESOURCE_URANIUM", "RESOURCE_WHEAT", "RESOURCE_COW",
  "RESOURCE_SHEEP", "RESOURCE_DEER", "RESOURCE_BANANA", "RESOURCE_FISH", "RESOURCE_STONE", "RESOURCE_WHALE", "RESOURCE_PEARLS", "RESOURCE_GOLD",
  "RESOURCE_SILVER", "RESOURCE_GEMS", "RESOURCE_MARBLE", "RESOURCE_IVORY", "RESOURCE_FUR", "RESOURCE_DYE", "RESOURCE_SPICES", "RESOURCE_SILK",
  "RESOURCE_SUGAR", "RESOURCE_COTTON", "RESOURCE_WINE", "RESOURCE_INCENSE",
];
const luaTerrainToInternal = [2, 3, 4, 5, 6, 1, 0];
const internalTerrainToLua = [6, 5, 0, 1, 2, 3, 4];
const luaFeatureToInternal = new Map([[0, 3], [1, 1], [2, 2], [3, 4], [4, 5], [5, 0], [6, 6], [17, 7]]);
const internalFeatureToLua = [5, 1, 2, 0, 3, 4, 6, 17];
const luaResourceToInternal = new Map([[0, 5], [1, 6], [2, 7], [3, 8], [4, 9], [5, 10], [6, 0], [7, 1], [8, 2], [9, 3], [11, 4], [13, 23], [14, 22], [15, 11], [16, 14], [17, 12], [19, 21], [20, 15], [21, 16], [22, 13], [24, 17], [25, 18], [26, 19], [27, 20]]);
const internalResourceToLua = [6, 7, 8, 9, 11, 0, 1, 2, 3, 4, 5, 15, 17, 22, 16, 20, 21, 24, 25, 26, 27, 19, 14, 13];
const improvements = ["IMPROVEMENT_CITY_RUINS", "IMPROVEMENT_BARBARIAN_CAMP", "IMPROVEMENT_GOODY_HUT"];
const routes = ["ROUTE_ROAD", "ROUTE_RAILROAD"];
const builtInIncludes: Record<string, string> = {
  math: "",
  bit: "",
  mapgenerator: `
MapGenerator = MapGenerator or {}
function MapGenerator.Create() return setmetatable({}, { __index = MapGenerator }) end
function MapGenerator:GeneratePlotTypes() end
`,
  fluavector: `
function Vector2(x,y) return {x=x,y=y} end
function Vector3(x,y,z) return {x=x,y=y,z=z} end
function Vector4(x,y,z,w) return {x=x,y=y,z=z,w=w} end
`,
  assignstartingplots: `
AssignStartingPlots = AssignStartingPlots or {}
function AssignStartingPlots.Create()
  local instance = {}
  function instance:GenerateRegions() end
  function instance:ChooseLocations() end
  function instance:BalanceAndAssign() end
  function instance:PlaceNaturalWonders() end
  function instance:PlaceResourcesAndCityStates() end
  return instance
end
`,
  terrain_generator: "TerrainGenerator = TerrainGenerator or { Create=function() return {} end }",
  featuregenerator: "FeatureGenerator = FeatureGenerator or { Create=function() return {} end }",
};

function luaList(values: string[]) {
  return `{${values.map(luaString).join(",")}}`;
}

function luaString(value: string) {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\r", "\\r").replaceAll("\n", "\\n")}"`;
}

function luaIncludeSources(dependencies: LuaProjectDependency[]) {
  const sources = new Map(Object.entries(builtInIncludes));
  for (const dependency of dependencies) sources.set(normalizeLuaIncludeName(dependency.name), dependency.source);
  return `{${[...sources].map(([name, source]) => `[${luaString(name)}]=${luaString(source)}`).join(",")}}`;
}

function seededRandom(initialSeed: number) {
  let state = initialSeed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function blankTiles(width: number, height: number): Civ5Tile[] {
  return Array.from({ length: width * height }, () => ({
    terrain: 0,
    resource: 255,
    feature: 255,
    river: 0,
    elevation: 0,
    continent: 0,
    wonder: 255,
    resourceAmount: 0,
  }));
}

self.onmessage = async (event: MessageEvent<Request>) => {
  const request = event.data;
  const logs: string[] = [];
  const stages: LuaPipelineStage[] = [];
  const requestedIncludes = findLuaIncludes(request.source);
  const loadedIncludes = new Set<string>();
  const missingIncludes = new Set<string>();
  const scriptOptions = new Map<number, LuaScriptOption>();
  const scriptStarts = new Map<number, ScriptStart>();
  const random = seededRandom(request.seed);
  let selectedOptions = [...(request.customOptions ?? [])];
  let effectiveWidth = request.width;
  let effectiveHeight = request.height;
  let effectiveWraps = request.wraps;
  let mapName = "Lua Map";
  let mapDescription = "Generated in Excogitare's sandboxed Civ V Lua runtime.";
  let tiles = blankTiles(effectiveWidth, effectiveHeight);
  const indexOf = (x: number, y: number) => y * effectiveWidth + x;
  const valid = (x: number, y: number) => x >= 0 && x < effectiveWidth && y >= 0 && y < effectiveHeight;
  const neighborCoordinates = (x: number, y: number, direction: number) => {
    const even = [[-1, 0], [-1, 1], [0, 1], [1, 0], [0, -1], [-1, -1]];
    const odd = [[-1, 0], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1]];
    const [dx, dy] = (y % 2 === 0 ? even : odd)[direction] ?? [0, 0];
    let nextX = x + dx;
    if (effectiveWraps) nextX = (nextX + effectiveWidth) % effectiveWidth;
    return [nextX, y + dy];
  };
  const addStage = (id: LuaPipelineStage["id"], label: string, status: LuaPipelineStage["status"], detail: string) => {
    stages.push({ id, label, status, detail });
  };
  let lua: LuaEngine | null = null;

  try {
    const wasmUrl = self.location?.protocol === "http:" || self.location?.protocol === "https:"
      ? new URL("/wasmoon.wasm", self.location.href).href
      : undefined;
    const factory = new LuaFactory(wasmUrl);
    lua = await factory.createEngine({ functionTimeout: 8_000 });
    lua.global.set("__log", (...values: unknown[]) => {
      if (logs.length < 160) logs.push(values.map(String).join(" "));
    });
    lua.global.set("__rand", (maximum: number) => maximum > 0 ? Math.floor(random() * maximum) : 0);
    lua.global.set("__width", () => effectiveWidth);
    lua.global.set("__height", () => effectiveHeight);
    lua.global.set("__wraps", () => effectiveWraps);
    lua.global.set("__custom_option", (index: number) => selectedOptions[index - 1] ?? scriptOptions.get(index)?.defaultValue ?? 1);
    lua.global.set("__include_event", (name: string, found: boolean) => {
      const normalized = normalizeLuaIncludeName(name);
      if (found) loadedIncludes.add(normalized);
      else missingIncludes.add(name);
    });
    lua.global.set("__map_info", (name: string, description: string) => {
      if (name) mapName = String(name);
      if (description) mapDescription = String(description);
    });
    lua.global.set("__add_custom_option", (index: number, name: string, defaultValue: number) => {
      scriptOptions.set(index, { index, name: String(name || `Option ${index}`), values: [], defaultValue: Number(defaultValue) || 1, selectedValue: Number(defaultValue) || 1 });
    });
    lua.global.set("__add_custom_option_value", (index: number, valueIndex: number, label: string) => {
      const option = scriptOptions.get(index);
      if (option) option.values[Math.max(0, Number(valueIndex) - 1)] = String(label);
    });
    lua.global.set("__set_init_data", (width: number, height: number, wraps: boolean) => {
      const nextWidth = Math.max(8, Math.min(256, Math.round(Number(width) || effectiveWidth)));
      const nextHeight = Math.max(8, Math.min(256, Math.round(Number(height) || effectiveHeight)));
      if (nextWidth * nextHeight > 32_768) throw new Error("GetMapInitData requested more than 32,768 tiles.");
      effectiveWidth = nextWidth;
      effectiveHeight = nextHeight;
      effectiveWraps = Boolean(wraps);
    });
    lua.global.set("__set_plot_type", (x: number, y: number, plotType: number) => {
      if (!valid(x, y)) return;
      const tile = tiles[indexOf(x, y)];
      if (plotType === 3) {
        tile.terrain = 0;
        tile.elevation = 0;
      } else {
        if (tile.terrain < 2) tile.terrain = 2;
        tile.elevation = plotType === 0 ? 2 : plotType === 1 ? 1 : 0;
      }
    });
    lua.global.set("__set_terrain", (x: number, y: number, terrain: number) => {
      const internal = luaTerrainToInternal[terrain];
      if (valid(x, y) && internal !== undefined) tiles[indexOf(x, y)].terrain = internal;
    });
    lua.global.set("__set_feature", (x: number, y: number, feature: number) => {
      const internal = luaFeatureToInternal.get(feature);
      if (valid(x, y)) tiles[indexOf(x, y)].feature = feature < 0 || internal === undefined ? 255 : internal;
    });
    lua.global.set("__set_resource", (x: number, y: number, resource: number, amount = 1) => {
      if (!valid(x, y)) return;
      const internal = luaResourceToInternal.get(resource);
      tiles[indexOf(x, y)].resource = resource < 0 || internal === undefined ? 255 : internal;
      tiles[indexOf(x, y)].resourceAmount = resource < 0 ? 0 : Math.max(1, amount);
    });
    lua.global.set("__set_river", (x: number, y: number, bit: number, enabled: boolean, flow = -1) => {
      if (!valid(x, y)) return;
      const tile = tiles[indexOf(x, y)];
      const flowBit = bit << 3;
      if (!enabled) {
        tile.river &= ~bit;
        tile.river &= ~flowBit;
        return;
      }
      tile.river |= bit;
      const directionSet = (bit === 1 && flow === 0) || (bit === 2 && flow === 1) || (bit === 4 && flow === 5);
      if (directionSet) tile.river |= flowBit;
      else tile.river &= ~flowBit;
    });
    lua.global.set("__set_continent", (x: number, y: number, continent: number) => {
      if (valid(x, y)) tiles[indexOf(x, y)].continent = Math.max(0, Math.min(255, Number(continent) || 0));
    });
    lua.global.set("__set_route", (x: number, y: number, route: number) => {
      if (!valid(x, y)) return;
      tiles[indexOf(x, y)].route = route === 1 ? "ROUTE_RAILROAD" : route === 0 ? "ROUTE_ROAD" : undefined;
    });
    lua.global.set("__set_improvement", (x: number, y: number, improvement: number) => {
      if (!valid(x, y)) return;
      tiles[indexOf(x, y)].improvement = improvement === 0
        ? "IMPROVEMENT_CITY_RUINS"
        : improvement === 1 ? "IMPROVEMENT_BARBARIAN_CAMP" : improvement === 2 ? "IMPROVEMENT_GOODY_HUT" : undefined;
    });
    lua.global.set("__set_start", (player: number, x: number, y: number, cityState: boolean) => {
      if (valid(x, y)) scriptStarts.set(player, { player, x, y, cityState: Boolean(cityState) });
    });
    lua.global.set("__terrain", (x: number, y: number) => valid(x, y) ? internalTerrainToLua[tiles[indexOf(x, y)].terrain] ?? -1 : -1);
    lua.global.set("__feature", (x: number, y: number) => valid(x, y) ? internalFeatureToLua[tiles[indexOf(x, y)].feature] ?? -1 : -1);
    lua.global.set("__resource", (x: number, y: number) => valid(x, y) ? internalResourceToLua[tiles[indexOf(x, y)].resource] ?? -1 : -1);
    lua.global.set("__plot_type", (x: number, y: number) => {
      if (!valid(x, y)) return -1;
      const tile = tiles[indexOf(x, y)];
      return tile.terrain < 2 ? 3 : tile.elevation === 2 ? 0 : tile.elevation === 1 ? 1 : 2;
    });
    lua.global.set("__is_coastal", (x: number, y: number) => {
      if (!valid(x, y) || tiles[indexOf(x, y)].terrain < 2) return false;
      for (let direction = 0; direction < 6; direction += 1) {
        const [nx, ny] = neighborCoordinates(x, y, direction);
        if (valid(nx, ny) && tiles[indexOf(nx, ny)].terrain < 2) return true;
      }
      return false;
    });

    const prelude = `
EXCOGITARE_WIDTH, EXCOGITARE_HEIGHT = ${request.width}, ${request.height}
function print(...) __log(...) end
unpack = table.unpack
table.maxn = table.maxn or function(values) local maximum=0 for key in pairs(values) do if type(key)=="number" and key>maximum then maximum=key end end return maximum end
math.atan2 = math.atan
math.mod = math.fmod
math.randomseed = function() end
math.random = function(one,two)
  if one == nil then return __rand(1000000) / 1000000 end
  if two == nil then return __rand(one) + 1 end
  return one + __rand(two - one + 1)
end
bit = { band=function(a,b) return a & b end, bor=function(a,b) return a | b end, bxor=function(a,b) return a ~ b end, lshift=function(a,b) return a << b end, rshift=function(a,b) return a >> b end }
PlotTypes = { PLOT_MOUNTAIN=0, PLOT_HILLS=1, PLOT_LAND=2, PLOT_OCEAN=3, NUM_PLOT_TYPES=4 }
TerrainTypes = { TERRAIN_GRASS=0, TERRAIN_PLAINS=1, TERRAIN_DESERT=2, TERRAIN_TUNDRA=3, TERRAIN_SNOW=4, TERRAIN_COAST=5, TERRAIN_OCEAN=6, NUM_TERRAIN_TYPES=7 }
FeatureTypes = { FEATURE_ICE=0, FEATURE_JUNGLE=1, FEATURE_MARSH=2, FEATURE_OASIS=3, FEATURE_FLOOD_PLAINS=4, FEATURE_FOREST=5, FEATURE_FALLOUT=6, FEATURE_ATOLL=17, NO_FEATURE=-1 }
DirectionTypes = { DIRECTION_WEST=0, DIRECTION_NORTHWEST=1, DIRECTION_NORTHEAST=2, DIRECTION_EAST=3, DIRECTION_SOUTHEAST=4, DIRECTION_SOUTHWEST=5, NO_DIRECTION=-1 }
FlowDirectionTypes = { FLOWDIRECTION_NORTH=0, FLOWDIRECTION_NORTHEAST=1, FLOWDIRECTION_SOUTHEAST=2, FLOWDIRECTION_SOUTH=3, FLOWDIRECTION_SOUTHWEST=4, FLOWDIRECTION_NORTHWEST=5, NO_DIRECTION=-1 }
DirW, DirNW, DirNE, DirE, DirSE, DirSW = 0, 1, 2, 3, 4, 5

local function makeRows(names)
  local rows, list = {}, {}
  for index, name in ipairs(names) do
    local row = { ID=index-1, Type=name, Description=name }
    rows[name], rows[index-1], list[index] = row, row, row
  end
  return setmetatable(rows, { __call=function()
    local index=0
    return function() index=index+1 return list[index] end
  end })
end
GameInfo = {
  Terrains=makeRows(${luaList(luaTerrains)}), Features=makeRows(${luaList(luaFeatures)}), Resources=makeRows(${luaList(luaResources)}),
  Routes=makeRows(${luaList(routes)}), Improvements=makeRows(${luaList(improvements)}),
  Worlds=makeRows({"WORLDSIZE_DUEL","WORLDSIZE_TINY","WORLDSIZE_SMALL","WORLDSIZE_STANDARD","WORLDSIZE_LARGE","WORLDSIZE_HUGE"}),
  Civilization_CityNames=makeRows({}), Map_Sizes=makeRows({}), Fantastical_Map_Labels=makeRows({})
}

local function getPlot(x,y)
  if x < 0 or x >= EXCOGITARE_WIDTH or y < 0 or y >= EXCOGITARE_HEIGHT then return nil end
  local plot = { __x=x, __y=y }
  function plot:SetPlotType(value) __set_plot_type(self.__x,self.__y,value) end
  function plot:SetTerrainType(value) __set_terrain(self.__x,self.__y,value) end
  function plot:SetFeatureType(value) __set_feature(self.__x,self.__y,value) end
  function plot:SetResourceType(value,amount) __set_resource(self.__x,self.__y,value,amount or 1) end
  function plot:SetWOfRiver(enabled,flow) __set_river(self.__x,self.__y,1,enabled,flow or -1) end
  function plot:SetNWOfRiver(enabled,flow) __set_river(self.__x,self.__y,2,enabled,flow or -1) end
  function plot:SetNEOfRiver(enabled,flow) __set_river(self.__x,self.__y,4,enabled,flow or -1) end
  function plot:SetContinentArtType(value) __set_continent(self.__x,self.__y,value) end
  function plot:SetRouteType(value) __set_route(self.__x,self.__y,value) end
  function plot:SetImprovementType(value) __set_improvement(self.__x,self.__y,value) end
  function plot:GetFeatureType() return __feature(self.__x,self.__y) end
  function plot:GetResourceType() return __resource(self.__x,self.__y) end
  function plot:GetTerrainType() return __terrain(self.__x,self.__y) end
  function plot:GetPlotType() return __plot_type(self.__x,self.__y) end
  function plot:IsWater() return __terrain(self.__x,self.__y) < 2 end
  function plot:IsMountain() return __plot_type(self.__x,self.__y) == PlotTypes.PLOT_MOUNTAIN end
  function plot:IsHills() return __plot_type(self.__x,self.__y) == PlotTypes.PLOT_HILLS end
  function plot:IsCoastalLand() return __is_coastal(self.__x,self.__y) end
  function plot:GetLatitude() return math.floor(math.abs(self.__y/math.max(1,EXCOGITARE_HEIGHT-1)-0.5)*180) end
  function plot:GetX() return self.__x end
  function plot:GetY() return self.__y end
  return plot
end
Map = {
  Rand=function(maximum) return __rand(maximum) end,
  GetCustomOption=function(index) return __custom_option(index) end,
  GetGridSize=function() return EXCOGITARE_WIDTH,EXCOGITARE_HEIGHT end,
  IsWrapX=function() return __wraps() end,
  GetPlot=getPlot,
  GetPlotByIndex=function(index) return getPlot(index % EXCOGITARE_WIDTH, math.floor(index/EXCOGITARE_WIDTH)) end,
  PlotDirection=function(x,y,direction)
    local even={{-1,0},{-1,1},{0,1},{1,0},{0,-1},{-1,-1}}
    local odd={{-1,0},{0,1},{1,1},{1,0},{1,-1},{0,-1}}
    local offset=(y%2==0 and even or odd)[direction+1]
    if not offset then return nil end
    local nextX=x+offset[1]
    if __wraps() then nextX=(nextX+EXCOGITARE_WIDTH)%EXCOGITARE_WIDTH end
    return getPlot(nextX,y+offset[2])
  end,
  DefaultContinentStamper=function() end
}
Players = {}
for playerID=0,${Math.max(0, request.players + request.cityStates - 1)} do
  local player={ __id=playerID }
  function player:IsMinorCiv() return self.__id >= ${request.players} end
  function player:SetStartingPlot(plot) if plot then __set_start(self.__id,plot:GetX(),plot:GetY(),self:IsMinorCiv()) end end
  function player:GetStartingPlot() return nil end
  Players[playerID]=player
end
Modding = { GetActivatedMods=function() return {} end, GetModProperty=function() return nil end }
DB = { Query=function() return function() return nil end end }
Locale = { ConvertTextKey=function(value) return value end }
function GetCoreMapOptions()
  local dummy={Name="Default",Values={"Default"},DefaultValue=1}
  return dummy,dummy,dummy,dummy,{Name="Resources",Values={"Sparse","Standard","Abundant","Legendary","Strategic Balance","Random"},DefaultValue=2}
end
function SetPlotTypes(values) for index,value in ipairs(values) do __set_plot_type((index-1)%EXCOGITARE_WIDTH,math.floor((index-1)/EXCOGITARE_WIDTH),value) end end
function SetTerrainTypes(values) for index,value in ipairs(values) do __set_terrain((index-1)%EXCOGITARE_WIDTH,math.floor((index-1)/EXCOGITARE_WIDTH),value) end end

local __includeSources = ${luaIncludeSources(request.dependencies ?? [])}
local __loadedIncludes = {}
function include(name)
  local key=string.lower(string.gsub(string.match(string.gsub(tostring(name),"\\\\","/"),"([^/]+)$") or tostring(name),"%.lua$",""))
  if __loadedIncludes[key] then return true end
  local source=__includeSources[key]
  if source == nil then __include_event(tostring(name),false) return false end
  __loadedIncludes[key]=true
  __include_event(tostring(name),true)
  if source == "" then return true end
  local chunk,problem=load(source,"@"..tostring(name),"t",_ENV)
  if not chunk then error(problem) end
  return chunk()
end
io=nil; package=nil; debug=nil; dofile=nil; loadfile=nil; require=nil
if os then os.execute=nil; os.remove=nil; os.rename=nil; os.exit=nil end
`;
    await lua.doString(prelude);
    addStage("LOAD", "Load project", "COMPLETE", `${1 + (request.dependencies?.length ?? 0)} Lua file${request.dependencies?.length ? "s" : ""} loaded into the isolated runtime`);

    const sanitizedSource = request.source.replace(/local\s+debugEnabled\s*=\s*true/g, "local debugEnabled = false");
    await lua.doString(sanitizedSource);
    await lua.doString(`
if type(GetMapScriptInfo)=="function" then
  local ok,info=pcall(GetMapScriptInfo)
  if ok and type(info)=="table" then
    __map_info(tostring(info.Name or ""),tostring(info.Description or ""))
    for index,option in ipairs(info.CustomOptions or {}) do
      __add_custom_option(index,tostring(option.Name or ("Option "..index)),tonumber(option.DefaultValue) or 1)
      for valueIndex,label in ipairs(option.Values or {}) do __add_custom_option_value(index,valueIndex,tostring(label)) end
    end
  elseif not ok then print("GetMapScriptInfo:",info) end
end
`);
    selectedOptions = [...scriptOptions.values()].sort((one, two) => one.index - two.index).map((option) => request.customOptions?.[option.index - 1] ?? option.defaultValue);
    for (const option of scriptOptions.values()) option.selectedValue = selectedOptions[option.index - 1] ?? option.defaultValue;
    addStage("METADATA", "Read script metadata", "COMPLETE", `${scriptOptions.size} custom option${scriptOptions.size === 1 ? "" : "s"} discovered`);

    await lua.doString(`
if type(GetMapInitData)=="function" then
  local ok,data=pcall(GetMapInitData,${request.worldSize})
  if ok and type(data)=="table" and data.Width and data.Height then __set_init_data(data.Width,data.Height,data.WrapX == true)
  elseif not ok then print("GetMapInitData:",data) end
end
EXCOGITARE_WIDTH,EXCOGITARE_HEIGHT=__width(),__height()
`);
    tiles = blankTiles(effectiveWidth, effectiveHeight);
    addStage("ALLOCATE", "Allocate map", "COMPLETE", `${effectiveWidth}×${effectiveHeight} · ${effectiveWraps ? "east/west wrap" : "no wrap"}`);

    await lua.doString(`
if type(GenerateMap)=="function" then
  GenerateMap()
  __log("__EXCOGITARE_STAGE__","PLOTS","GenerateMap completed")
else
  if type(GeneratePlotTypes)=="function" then local result=GeneratePlotTypes() if type(result)=="table" then SetPlotTypes(result) end __log("__EXCOGITARE_STAGE__","PLOTS","GeneratePlotTypes completed") end
  if type(GenerateTerrain)=="function" then local result=GenerateTerrain() if type(result)=="table" then SetTerrainTypes(result) end __log("__EXCOGITARE_STAGE__","TERRAIN","GenerateTerrain completed") end
  if type(AddFeatures)=="function" then AddFeatures() __log("__EXCOGITARE_STAGE__","FEATURES","AddFeatures completed") end
  if type(AddRivers)=="function" then AddRivers() __log("__EXCOGITARE_STAGE__","RIVERS","AddRivers completed") end
  if type(AddLakes)=="function" then AddLakes() end
  if type(DetermineContinents)=="function" then DetermineContinents() __log("__EXCOGITARE_STAGE__","CONTINENTS","DetermineContinents completed") end
end
`);
    const stageLogs = new Map(logs.filter((line) => line.startsWith("__EXCOGITARE_STAGE__ ")).map((line) => {
      const [, id, ...detail] = line.split(" ");
      return [id, detail.join(" ")];
    }));
    const stageDefinitions: Array<[LuaPipelineStage["id"], string]> = [
      ["PLOTS", "Generate plots"], ["TERRAIN", "Apply terrain"], ["FEATURES", "Place features"], ["RIVERS", "Add rivers"], ["CONTINENTS", "Finalize continents"],
    ];
    for (const [id, label] of stageDefinitions) addStage(id, label, stageLogs.has(id) ? "COMPLETE" : "SKIPPED", stageLogs.get(id) ?? "No matching script entry point");

    if (request.postProcessSource?.trim()) {
      await lua.doString(request.postProcessSource);
      addStage("POST_PROCESS", "Run post-process hook", "COMPLETE", "Project hook executed after the map script");
    } else {
      addStage("POST_PROCESS", "Run post-process hook", "SKIPPED", "No post-process Lua supplied");
    }
    addStage("CAPTURE", "Capture editable map", "COMPLETE", `${tiles.length.toLocaleString()} tiles and ${scriptStarts.size} script start${scriptStarts.size === 1 ? "" : "s"} captured`);

    const visibleLogs = logs.filter((line) => !line.startsWith("__EXCOGITARE_STAGE__ "));
    const metadata: LuaRuntimeMetadata = {
      name: mapName,
      description: mapDescription,
      width: effectiveWidth,
      height: effectiveHeight,
      wraps: effectiveWraps,
      options: [...scriptOptions.values()].sort((one, two) => one.index - two.index),
      requestedIncludes,
      loadedIncludes: [...loadedIncludes],
      missingIncludes: [...missingIncludes],
      stages,
    };
    const response: Response = { ok: true, tiles, starts: [...scriptStarts.values()], logs: visibleLogs, metadata };
    self.postMessage(response);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const response: Response = { ok: false, error: `Lua runtime failed: ${detail}`, logs, stages };
    self.postMessage(response);
  } finally {
    lua?.global.close();
  }
};
