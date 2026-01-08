import React, { useMemo } from "react";
import { Tile as TileComponent } from "./tile";
import type { Tile, Unit, Building } from "@/types/game";

interface WorldStripProps {
  columns: Tile[][];
  units: Unit[];
  buildings: Building[];
  onTileClick: (tile: Tile) => void;
  selectedTileId?: string | null;
  highlightedTiles?: Map<string, "move" | "attack" | "build">;
  currentPlayerId?: string;
  tileSize?: number;
}

export function WorldStrip({
  columns,
  units,
  buildings,
  onTileClick,
  selectedTileId,
  highlightedTiles,
  currentPlayerId,
  tileSize = 64,
}: WorldStripProps) {
  // Create a lookup map for units by coordinate
  const unitMap = useMemo(() => {
    const map = new Map<string, Unit>();
    for (const unit of units) {
      map.set(`${unit.x}-${unit.y}`, unit);
    }
    return map;
  }, [units]);

  // Create a lookup map for buildings by coordinate
  const buildingMap = useMemo(() => {
    const map = new Map<string, Building>();
    for (const building of buildings) {
      map.set(`${building.x}-${building.y}`, building);
    }
    return map;
  }, [buildings]);

  const getUnitAt = (x: number, y: number) => {
    return unitMap.get(`${x}-${y}`);
  };

  const getBuildingAt = (x: number, y: number) => {
    return buildingMap.get(`${x}-${y}`);
  };

  return (
    <div className="flex flex-row select-none">
      {columns.map((column, colIndex) => (
        <div key={`col-${colIndex}`} className="flex flex-col">
          {column.map((tile) => {
            const unit = getUnitAt(tile.x, tile.y);
            const building = getBuildingAt(tile.x, tile.y);
            const highlightType = highlightedTiles?.get(`${tile.x}-${tile.y}`);
            const isOwned = (unit?.playerId === currentPlayerId) || (building?.playerId === currentPlayerId);

            return (
              <TileComponent
                key={tile.id}
                tile={tile}
                unit={unit}
                building={building}
                isSelected={selectedTileId === tile.id || selectedTileId === `${tile.id}-ghost`}
                onClick={() => onTileClick(tile)}
                highlightType={highlightType}
                isOwned={isOwned}
                width={tileSize}
                height={tileSize}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
