import { renderEntities } from "./movement-objects.js";
/** Equipment rendering consumes evaluated geometry, never the human pose. */
export function equipmentParts(frame) {
  return frame.entities
    .filter((e) => !e.hidden)
    .map((e) => ({
      id: e.id,
      layer: e.layer,
      position: e.world.position,
      markup: renderEntities([e], frame.skeleton.camera),
    }));
}
