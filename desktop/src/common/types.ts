import { z } from "zod";
import type {
  CompleteShowModel,
  PartialShowModel,
} from "@bowser/prisma/utilityTypes";

export interface ServerConnection {
  connected: true;
  server: string;
}

export type ServerConnectionStatus = ServerConnection | { connected: false };

export type PartialShowType = z.infer<typeof PartialShowModel>;
export type CompleteShowType = z.infer<typeof CompleteShowModel>;

export const Integration = z.enum(["vmix", "obs", "ontime"]);
export type Integration = z.infer<typeof Integration>;

export const IntegrationState = z.enum([
  "unsupported",
  "disabled",
  "enabled",
  "active",
]);
export type IntegrationState = z.infer<typeof IntegrationState>;
