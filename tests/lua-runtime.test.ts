import assert from "node:assert/strict";
import test from "node:test";
import { findLuaIncludes, luaDependencyCoverage, mergeLuaDependencies, normalizeLuaIncludeName } from "../lib/lua-project.ts";

test("Lua projects normalize, merge, and report named dependencies", () => {
  const source = `include("MapGenerator")\ninclude('Helpers/Terrain.lua')\ninclude("Terrain.lua")`;
  assert.deepEqual(findLuaIncludes(source), ["MapGenerator", "Helpers/Terrain.lua"]);
  assert.equal(normalizeLuaIncludeName("Helpers\\Terrain.lua"), "terrain");
  assert.deepEqual(mergeLuaDependencies(
    [{ name: "Terrain.lua", source: "old" }],
    [{ name: "Terrain.lua", source: "new" }, { name: "Features.lua", source: "features" }],
  ), [
    { name: "Features.lua", source: "features" },
    { name: "Terrain.lua", source: "new" },
  ]);
  assert.deepEqual(luaDependencyCoverage(source, [{ name: "Terrain.lua", source: "" }]), {
    requested: ["MapGenerator", "Helpers/Terrain.lua"],
    supplied: ["Helpers/Terrain.lua"],
    builtIn: ["MapGenerator"],
    missing: [],
  });
});

test("the Lua worker executes a staged multi-file project and captures its map writes", async () => {
  let response: unknown;
  const workerScope: {
    location: URL;
    postMessage: (value: unknown) => void;
    onmessage?: (event: { data: unknown }) => Promise<void>;
  } = {
    location: new URL("file:///excogitare/lua-map.worker.ts"),
    postMessage(value) { response = value; },
  };
  Reflect.set(globalThis, "self", workerScope);
  try {
    await import("../app/lua-map.worker.ts");
    assert.ok(workerScope.onmessage);
    await workerScope.onmessage({
      data: {
        source: `
include("TerrainHelpers.lua")
function GetMapScriptInfo()
  return { Name="Runtime Project", Description="Staged map", CustomOptions={{Name="Width bonus",Values={"One","Two","Three"},DefaultValue=2}} }
end
function GetMapInitData() return {Width=10+Map.GetCustomOption(1),Height=8,WrapX=true} end
function GeneratePlotTypes()
  local width,height=Map.GetGridSize()
  for y=0,height-1 do for x=0,width-1 do Map.GetPlot(x,y):SetPlotType(PlotTypes.PLOT_LAND) end end
  Map.GetPlot(2,2):SetPlotType(PlotTypes.PLOT_MOUNTAIN)
end
function GenerateTerrain()
  local width,height=Map.GetGridSize()
  for y=0,height-1 do for x=0,width-1 do Map.GetPlot(x,y):SetTerrainType(TerrainTypes.TERRAIN_GRASS) end end
end
function AddFeatures()
  PaintBonus(Map.GetPlot(1,1))
  Map.GetPlot(3,3):SetRouteType(GameInfo.Routes.ROUTE_ROAD.ID)
  Map.GetPlot(3,3):SetImprovementType(GameInfo.Improvements.IMPROVEMENT_CITY_RUINS.ID)
  Players[0]:SetStartingPlot(Map.GetPlot(1,1))
end
function AddRivers()
  Map.GetPlot(2,2):SetWOfRiver(true,FlowDirectionTypes.FLOWDIRECTION_SOUTH)
  Map.GetPlot(3,2):SetNWOfRiver(true,FlowDirectionTypes.FLOWDIRECTION_NORTHEAST)
  Map.GetPlot(4,2):SetNEOfRiver(true,FlowDirectionTypes.FLOWDIRECTION_NORTHWEST)
end
`,
        dependencies: [{ name: "TerrainHelpers.lua", source: "function PaintBonus(plot) plot:SetFeatureType(FeatureTypes.FEATURE_FOREST) plot:SetResourceType(GameInfo.Resources.RESOURCE_IRON.ID,2) end" }],
        postProcessSource: "Map.GetPlot(4,4):SetTerrainType(TerrainTypes.TERRAIN_DESERT) Map.GetPlot(4,4):SetRouteType(GameInfo.Routes.ROUTE_RAILROAD.ID)",
        width: 40,
        height: 24,
        wraps: false,
        worldSize: 0,
        seed: 1234,
        players: 2,
        cityStates: 1,
      },
    });
  } finally {
    Reflect.deleteProperty(globalThis, "self");
  }

  assert.ok(response && typeof response === "object" && "ok" in response);
  const result = response as {
    ok: boolean;
    tiles: Array<{ terrain: number; feature: number; resource: number; resourceAmount: number; elevation: number; river: number; route?: string; improvement?: string }>;
    starts: Array<{ x: number; y: number; player: number }>;
    metadata: { width: number; height: number; wraps: boolean; loadedIncludes: string[]; missingIncludes: string[]; options: Array<{ selectedValue: number }>; stages: Array<{ id: string; status: string }> };
  };
  assert.equal(result.ok, true);
  assert.equal(result.metadata.width, 12);
  assert.equal(result.metadata.height, 8);
  assert.equal(result.metadata.wraps, true);
  assert.deepEqual(result.metadata.loadedIncludes, ["terrainhelpers"]);
  assert.deepEqual(result.metadata.missingIncludes, []);
  assert.equal(result.metadata.options[0].selectedValue, 2);
  assert.equal(result.metadata.stages.find((stage) => stage.id === "POST_PROCESS")?.status, "COMPLETE");
  assert.equal(result.tiles.length, 96);
  assert.equal(result.tiles[2 * 12 + 2].elevation, 2);
  assert.equal(result.tiles[1 * 12 + 1].feature, 0);
  assert.equal(result.tiles[1 * 12 + 1].resource, 5);
  assert.equal(result.tiles[1 * 12 + 1].resourceAmount, 2);
  assert.equal(result.tiles[2 * 12 + 2].river, 1);
  assert.equal(result.tiles[2 * 12 + 3].river, 18);
  assert.equal(result.tiles[2 * 12 + 4].river, 36);
  assert.equal(result.tiles[3 * 12 + 3].route, "ROUTE_ROAD");
  assert.equal(result.tiles[3 * 12 + 3].improvement, "IMPROVEMENT_CITY_RUINS");
  assert.equal(result.tiles[4 * 12 + 4].terrain, 4);
  assert.equal(result.tiles[4 * 12 + 4].route, "ROUTE_RAILROAD");
  assert.deepEqual(result.starts, [{ player: 0, x: 1, y: 1, cityState: false }]);
});
