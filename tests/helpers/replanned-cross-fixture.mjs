import {
  defaults,
  scheduledWorkouts,
  moveWorkout,
  completeWorkout,
} from "../../lib/core.js";
import { changePlan, CROSS_PLAN_ID } from "../../lib/plans.js";
export const CROSS_DATE = "2026-11-05";
export const HISTORY_DATE = "2026-11-03";
export function replannedCrossFixture({ activate = true } = {}) {
  const data = defaults();
  moveWorkout(
    data,
    CROSS_DATE,
    HISTORY_DATE,
    scheduledWorkouts(data, CROSS_DATE)[0].id,
  );
  moveWorkout(
    data,
    HISTORY_DATE,
    CROSS_DATE,
    scheduledWorkouts(data, HISTORY_DATE)[0].id,
  );
  const previous = data.sessions[HISTORY_DATE].workouts[0];
  previous.run = {
    minutes: 30,
    km: 5,
    rpe: 4,
    notes: "Corrida remanejada e concluída",
  };
  completeWorkout(previous, "2026-11-03T18:00:00.000Z");
  if (activate)
    data.settings = changePlan(
      data.settings,
      CROSS_PLAN_ID,
      CROSS_DATE,
      CROSS_DATE,
    );
  return data;
}
