import {
  createAPIClient,
  serverAPI,
  serverApiClient,
} from "./base/serverApiClient";
import { z } from "zod";
import { callProcedure, TRPCError } from "@trpc/server";
import { selectedShow, setSelectedShow } from "./base/selectedShow";
import { CompleteShowModel } from "@bowser/prisma/utilityTypes";
import { Integration, IntegrationState } from "../common/types";
import {
  assetsSettingsSchema,
  devToolsConfigSchema,
  getAssetsSettings,
  getDevToolsConfig,
  saveDevToolsConfig,
} from "./base/settings";
import { IPCEvents } from "./ipcEventBus";
import { ipcMain } from "electron";
import logging, { logLevel, setLogLevel } from "./base/logging";
import { ShowSchema } from "@bowser/prisma/types";
import { inspect } from "node:util";
import { ontimeRouter } from "./ontime/ipc";
import { vmixRouter } from "./vmix/ipc";
import { obsRouter } from "./obs/ipc";
import { mediaRouter } from "./media/ipc";
import { proc, r } from "./base/ipcRouter";
import {
  DEV_overrideSupportedIntegrations,
  getIntegrationStates,
} from "./base/integrations";

const logger = logging.getLogger("ipcApi");
const rendererLogger = logging.getLogger("renderer");

export const appRouter = r({
  serverConnectionStatus: proc.query(async () => {
    return (
      serverApiClient !== null &&
      (await serverApiClient.ping.query()) === "pong"
    );
  }),
  log: proc
    .input(
      z.object({
        level: z.enum(["trace", "debug", "info", "warn", "error"]),
        logger: z.string().optional(),
        message: z.string(),
      }),
    )
    .mutation(({ input }) => {
      rendererLogger[input.level](input.message);
    }),
  connectToServer: proc
    .input(
      z.object({
        endpoint: z.string().url(),
        password: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      await createAPIClient(input.endpoint + "/api/trpc", input.password);
      return true;
    }),
  listUpcomingShows: proc.output(z.array(ShowSchema)).query(async () => {
    return await serverAPI().shows.listUpcoming.query();
  }),
  getSelectedShow: proc.output(CompleteShowModel.nullable()).query(() => {
    return selectedShow.value;
  }),
  setSelectedShow: proc
    .input(z.object({ id: z.number() }))
    .output(CompleteShowModel)
    .mutation(async ({ input }) => {
      const data = await serverAPI().shows.get.query({ id: input.id });
      await setSelectedShow(data);
      return data;
    }),
  integrations: r({
    status: proc.output(z.record(Integration, IntegrationState)).query(() => {
      return getIntegrationStates();
    }),
  }),
  getLogLevel: proc
    .output(z.enum(["trace", "debug", "info", "warn", "error"]))
    .query(() => {
      return logLevel;
    }),
  setLogLevel: proc
    .input(z.enum(["trace", "debug", "info", "warn", "error"]))
    .mutation(async ({ input }) => {
      setLogLevel(input);
    }),
  devtools: r({
    getSettings: proc
      .output(devToolsConfigSchema)
      .query(() => getDevToolsConfig()),
    setSettings: proc
      .input(devToolsConfigSchema)
      .mutation(async ({ input }) => {
        logger.info("Dev Tools settings change: " + JSON.stringify(input));
        await saveDevToolsConfig(input);
        IPCEvents.send("devToolsSettingsChange");
      }),
    throwException: proc.mutation(async () => {
      if (!(await getDevToolsConfig()).enabled) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Dev tools not enabled",
        });
      }
      process.nextTick(() => {
        throw new Error("Test Main Process Exception");
      });
    }),
    crash: proc.mutation(async () => {
      if (!(await getDevToolsConfig()).enabled) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Dev tools not enabled",
        });
      }
      process.crash();
    }),
    setEnabledIntegrations: proc
      .input(z.array(z.string()))
      .mutation(async ({ input }) => {
        if (!(await getDevToolsConfig()).enabled) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Dev tools not enabled",
          });
        }
        DEV_overrideSupportedIntegrations(input as Integration[]);
      }),
  }),
  media: mediaRouter,
  obs: obsRouter,
  vmix: vmixRouter,
  assets: r({
    getSettings: proc
      .output(assetsSettingsSchema)
      .query(() => getAssetsSettings()),
  }),
  ontime: ontimeRouter,
});
export type AppRouter = typeof appRouter;

if (process.env.E2E_TEST === "true") {
  ipcMain.on("doIPCMutation", async (_, proc: string, input: unknown) => {
    logger.debug(
      "doIPCMutation: " + JSON.stringify(proc) + " " + JSON.stringify(input),
    );
    await callProcedure({
      procedures: appRouter._def.procedures,
      path: proc,
      rawInput: input,
      ctx: {},
      type: "mutation",
    });
  });
}
