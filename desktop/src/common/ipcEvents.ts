/* eslint-disable @typescript-eslint/no-unused-vars */
import { CompleteShowType, Integration, IntegrationState } from "./types";

/*
 * This file defines the events that can be sent from the main process to the renderer process.
 * To add a new event, add it to the Events object below. Then you can use IPCEvents.eventName to send
 * from the main process, and IPCEventBus.on("eventName") to receive in the renderer process.
 */

export const Events = {
  selectedShowChange(newShow: CompleteShowType | null) {},
  integrationsStateChange(newState: Record<Integration, IntegrationState>) {},
  assetsSettingsChange() {},
  devToolsSettingsChange() {},
  downloadStatusChange() {},
  localMediaStateChange() {},
} as const;
export type Events = typeof Events;
