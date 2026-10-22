"use client";

import { useSyncExternalStore } from "react";
import { getLeagueFilterSnapshot, getServerLeagueFilterSnapshot, subscribeLeagueFilter, type LeagueFilterState } from "./league-filter";

export function useLeagueFilter(): LeagueFilterState {
  return useSyncExternalStore(subscribeLeagueFilter, getLeagueFilterSnapshot, getServerLeagueFilterSnapshot);
}
