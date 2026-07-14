import { LuaFactory } from "wasmoon";
import type { Civ5Tile } from "@/lib/civ5-map";

type Request = { source: string; width: number; height: number; seed: number; customOptions?: number[] };
type Response = { ok: true; tiles: Civ5Tile[]; logs: string[] } | { ok: false; error: string; logs: string[] };

const terrains = ["TERRAIN_OCEAN", "TERRAIN_COAST", "TERRAIN_GRASS", "TERRAIN_PLAINS", "TERRAIN_DESERT", "TERRAIN_TUNDRA", "TERRAIN_SNOW"];
const features = ["FEATURE_FOREST", "FEATURE_JUNGLE", "FEATURE_MARSH", "FEATURE_ICE", "FEATURE_OASIS", "FEATURE_FLOOD_PLAINS", "FEATURE_FALLOUT", "FEATURE_ATOLL"];
const resources = ["RESOURCE_WHEAT", "RESOURCE_CATTLE", "RESOURCE_SHEEP", "RESOURCE_DEER", "RESOURCE_FISH", "RESOURCE_IRON", "RESOURCE_HORSE", "RESOURCE_COAL", "RESOURCE_OIL", "RESOURCE_ALUMINUM", "RESOURCE_URANIUM", "RESOURCE_GOLD", "RESOURCE_GEMS", "RESOURCE_SPICES"];

function luaList(values: string[]) {
  return `{${values.map((value) => `"${value}"`).join(",")}}`;
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

self.onmessage = async (event: MessageEvent<Request>) => {
  const { source, width, height, seed, customOptions = [] } = event.data;
  const logs: string[] = [];
  const tiles: Civ5Tile[] = Array.from({ length: width * height }, () => ({
    terrain: 0,
    resource: 255,
    feature: 255,
    river: 0,
    elevation: 0,
    continent: 0,
    wonder: 255,
    resourceAmount: 0,
  }));
  const random = seededRandom(seed);
  const indexOf = (x: number, y: number) => y * width + x;
  const valid = (x: number, y: number) => x >= 0 && x < width && y >= 0 && y < height;
  const neighborCoordinates = (x: number, y: number, direction: number) => {
    const even = [[-1, 0], [-1, 1], [0, 1], [1, 0], [0, -1], [-1, -1]];
    const odd = [[-1, 0], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1]];
    const [dx, dy] = (y % 2 === 0 ? even : odd)[direction] ?? [0, 0];
    return [x + dx, y + dy];
  };
  const factory = new LuaFactory(new URL("/wasmoon.wasm", self.location.href).href);
  const lua = await factory.createEngine({ functionTimeout: 8_000 });

  try {
    lua.global.set("__log", (...values: unknown[]) => {
      if (logs.length < 80) logs.push(values.map(String).join(" "));
    });
    lua.global.set("__rand", (maximum: number) => maximum > 0 ? Math.floor(random() * maximum) : 0);
    lua.global.set("__custom_option", (index: number) => customOptions[index - 1] ?? 1);
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
      if (valid(x, y) && terrain >= 0 && terrain < terrains.length) tiles[indexOf(x, y)].terrain = terrain;
    });
    lua.global.set("__set_feature", (x: number, y: number, feature: number) => {
      if (valid(x, y)) tiles[indexOf(x, y)].feature = feature < 0 ? 255 : feature;
    });
    lua.global.set("__set_resource", (x: number, y: number, resource: number, amount = 1) => {
      if (!valid(x, y)) return;
      tiles[indexOf(x, y)].resource = resource < 0 ? 255 : resource;
      tiles[indexOf(x, y)].resourceAmount = resource < 0 ? 0 : Math.max(1, amount);
    });
    lua.global.set("__set_river", (x: number, y: number, bit: number, enabled: boolean) => {
      if (!valid(x, y)) return;
      if (enabled) tiles[indexOf(x, y)].river |= bit;
      else tiles[indexOf(x, y)].river &= ~bit;
    });
    lua.global.set("__set_continent", (x: number, y: number, continent: number) => {
      if (valid(x, y)) tiles[indexOf(x, y)].continent = continent;
    });
    lua.global.set("__terrain", (x: number, y: number) => valid(x, y) ? tiles[indexOf(x, y)].terrain : -1);
    lua.global.set("__feature", (x: number, y: number) => valid(x, y) ? tiles[indexOf(x, y)].feature : -1);
    lua.global.set("__resource", (x: number, y: number) => valid(x, y) ? tiles[indexOf(x, y)].resource : -1);
    lua.global.set("__is_coastal", (x: number, y: number) => {
      if (!valid(x, y) || tiles[indexOf(x, y)].terrain < 2) return false;
      for (let direction = 0; direction < 6; direction += 1) {
        const [nx, ny] = neighborCoordinates(x, y, direction);
        if (valid(nx, ny) && tiles[indexOf(nx, ny)].terrain < 2) return true;
      }
      return false;
    });

    const prelude = `
local WIDTH, HEIGHT = ${width}, ${height}
function print(...) __log(...) end
include = function() end
unpack = table.unpack
math.atan2 = math.atan
bit = { band = function(a,b) return a & b end, bor = function(a,b) return a | b end, bxor = function(a,b) return a ~ b end }
PlotTypes = { PLOT_MOUNTAIN=0, PLOT_HILLS=1, PLOT_LAND=2, PLOT_OCEAN=3, NUM_PLOT_TYPES=4 }
TerrainTypes = { TERRAIN_OCEAN=0, TERRAIN_COAST=1, TERRAIN_GRASS=2, TERRAIN_PLAINS=3, TERRAIN_DESERT=4, TERRAIN_TUNDRA=5, TERRAIN_SNOW=6, NUM_TERRAIN_TYPES=7 }
FeatureTypes = { FEATURE_FOREST=0, FEATURE_JUNGLE=1, FEATURE_MARSH=2, FEATURE_ICE=3, FEATURE_OASIS=4, FEATURE_FLOOD_PLAINS=5, FEATURE_FALLOUT=6, FEATURE_ATOLL=7, NO_FEATURE=-1 }
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
    local index = 0
    return function() index=index+1; return list[index] end
  end })
end
GameInfo = {
  Terrains=makeRows(${luaList(terrains)}), Features=makeRows(${luaList(features)}), Resources=makeRows(${luaList(resources)}),
  Routes=makeRows({"ROUTE_ROAD","ROUTE_RAILROAD"}), Improvements=makeRows({"IMPROVEMENT_CITY_RUINS"}),
  Worlds=makeRows({"WORLDSIZE_DUEL","WORLDSIZE_TINY","WORLDSIZE_SMALL","WORLDSIZE_STANDARD","WORLDSIZE_LARGE","WORLDSIZE_HUGE"}),
  Civilization_CityNames=makeRows({}), Map_Sizes=makeRows({}), Fantastical_Map_Labels=makeRows({})
}

local function getPlot(x, y)
  if x < 0 or x >= WIDTH or y < 0 or y >= HEIGHT then return nil end
  local plot = { __x=x, __y=y }
  function plot:SetPlotType(value) __set_plot_type(self.__x,self.__y,value) end
  function plot:SetTerrainType(value) __set_terrain(self.__x,self.__y,value) end
  function plot:SetFeatureType(value) __set_feature(self.__x,self.__y,value) end
  function plot:SetResourceType(value,amount) __set_resource(self.__x,self.__y,value,amount or 1) end
  function plot:SetWOfRiver(enabled) __set_river(self.__x,self.__y,1,enabled) end
  function plot:SetNWOfRiver(enabled) __set_river(self.__x,self.__y,2,enabled) end
  function plot:SetNEOfRiver(enabled) __set_river(self.__x,self.__y,4,enabled) end
  function plot:SetContinentArtType(value) __set_continent(self.__x,self.__y,value) end
  function plot:SetRouteType() end
  function plot:SetImprovementType() end
  function plot:GetFeatureType() return __feature(self.__x,self.__y) end
  function plot:GetResourceType() return __resource(self.__x,self.__y) end
  function plot:GetTerrainType() return __terrain(self.__x,self.__y) end
  function plot:IsCoastalLand() return __is_coastal(self.__x,self.__y) end
  function plot:GetLatitude() return math.floor(math.abs(self.__y/(HEIGHT-1)-0.5)*180) end
  function plot:GetY() return self.__y end
  return plot
end
Map = {
  Rand=function(maximum) return __rand(maximum) end,
  GetCustomOption=function(index) return __custom_option(index) end,
  GetGridSize=function() return WIDTH,HEIGHT end,
  GetPlot=getPlot,
  GetPlotByIndex=function(index) return getPlot(index % WIDTH, math.floor(index/WIDTH)) end,
  PlotDirection=function(x,y,direction)
    local even={{-1,0},{-1,1},{0,1},{1,0},{0,-1},{-1,-1}}
    local odd={{-1,0},{0,1},{1,1},{1,0},{1,-1},{0,-1}}
    local offset=(y%2==0 and even or odd)[direction+1]
    return getPlot(x+offset[1],y+offset[2])
  end,
  DefaultContinentStamper=function() end
}
Modding = { GetActivatedMods=function() return {} end, GetModProperty=function() return nil end }
DB = { Query=function() return function() return nil end end }
Locale = { ConvertTextKey=function(value) return value end }
function GetCoreMapOptions()
  local dummy={Name="Default",Values={"Default"},DefaultValue=1}
  return dummy,dummy,dummy,dummy,{Name="Resources",Values={"Standard"},DefaultValue=1}
end
function SetPlotTypes(values) for index,value in ipairs(values) do __set_plot_type((index-1)%WIDTH,math.floor((index-1)/WIDTH),value) end end
function SetTerrainTypes(values) for index,value in ipairs(values) do __set_terrain((index-1)%WIDTH,math.floor((index-1)/WIDTH),value) end end
io=nil; package=nil; debug=nil; dofile=nil; loadfile=nil; require=nil
if os then os.execute=nil; os.remove=nil; os.rename=nil; os.exit=nil end
`;
    await lua.doString(prelude);
    const sanitizedSource = source.replace("local debugEnabled = true", "local debugEnabled = false");
    await lua.doString(sanitizedSource);
    await lua.doString(`
if GenerateMap then
  GenerateMap()
else
  if GeneratePlotTypes then local result=GeneratePlotTypes(); if type(result)=="table" then SetPlotTypes(result) end end
  if GenerateTerrain then local result=GenerateTerrain(); if type(result)=="table" then SetTerrainTypes(result) end end
  if AddFeatures then AddFeatures() end
  if AddRivers then AddRivers() end
  if AddLakes then AddLakes() end
  if DetermineContinents then DetermineContinents() end
end
`);
    const response: Response = { ok: true, tiles, logs };
    self.postMessage(response);
  } catch (error) {
    const response: Response = { ok: false, error: error instanceof Error ? error.message : String(error), logs };
    self.postMessage(response);
  } finally {
    lua.global.close();
  }
};
