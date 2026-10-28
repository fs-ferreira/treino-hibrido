// Compatibility entrypoints. Scene evaluation owns body/equipment connections.
import { evaluateMovement } from "./movement-scene.js";
export { sampleAuthoredPose as poseAt } from "./movement-body.js";
export { solveJoint, polar } from "./movement-anatomy.js";
export const rigAt = (kind, t) => evaluateMovement(kind, t).rig;
export { evaluateMovement } from "./movement-scene.js";
