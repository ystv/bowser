import { z } from "zod";
import { proc, r } from "../base/ipcRouter";
import { addOrReplaceMediaAsScene, findContinuityScenes } from "./obsHelpers";
import { getLogger } from "loglevel";
import { serverAPI } from "../base/serverApiClient";
import invariant from "../../common/invariant";
import { selectedShow } from "../base/selectedShow";
import { getDevToolsConfig, getLocalMediaSettings } from "../base/settings";
import { TRPCError } from "@trpc/server";
import { OBSIntegration } from "./obs";

const logger = getLogger("obs/ipc");

export const obsRouter = r({
  getConnectionState: proc
    .output(
      z.object({
        connected: z.boolean(),
        version: z.string().optional(),
        platform: z.string().optional(),
        error: z.string().optional(),
        availableRequests: z.array(z.string()).optional(),
      }),
    )
    .query(async () => {
      // TODO[BOW-136]: don't use the connection for this
      if (OBSIntegration.maybeInstance === null) {
        return { connected: false };
      }
      try {
        const version = await OBSIntegration.instance.ping();
        return {
          connected: true,
          version: version.obsVersion,
          platform: version.platformDescription,
          availableRequests: version.availableRequests,
        };
      } catch (e) {
        logger.warn("OBS connection error", e);
        return { connected: false, error: String(e) };
      }
    }),
  connect: proc
    .input(
      z.object({
        host: z.string(),
        port: z.coerce.number(),
        password: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      await OBSIntegration.close();
      await OBSIntegration.start(input);
    }),
  addMediaAsScene: proc
    .input(
      z.object({
        id: z.number(),
        replaceMode: z.enum(["none", "replace", "force"]).default("none"),
      }),
    )
    .output(
      z.object({
        done: z.boolean(),
        warnings: z.array(z.string()),
        promptReplace: z.enum(["replace", "force"]).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const info = await serverAPI().media.get.query({ id: input.id });
      invariant(
        info.continuityItems.length > 0,
        "No continuity item for media in obs.addMediaAsScene",
      );
      return await addOrReplaceMediaAsScene(info, input.replaceMode);
    }),
  addAllSelectedShowMedia: proc
    .output(
      z.object({
        done: z.number(),
        warnings: z.array(z.string()),
      }),
    )
    .mutation(async () => {
      const show = selectedShow.value;
      invariant(show, "No show selected");
      const state = await getLocalMediaSettings();
      let done = 0;
      const warnings: string[] = [];
      for (const item of show.continuityItems) {
        if (
          item.media &&
          item.media.state === "Ready" &&
          state.some((x) => x.mediaID === item.media!.id)
        ) {
          const r = await addOrReplaceMediaAsScene(
            {
              ...item.media,
              continuityItems: [item],
            },
            "replace",
          );
          if (r.done) {
            done++;
          } else if (r.warnings.length > 0) {
            warnings.push(item.name + ": " + r.warnings.join(" "));
          }
        }
      }
      return { done, warnings };
    }),
  listContinuityItemScenes: proc
    .output(
      z.array(
        z.object({
          sceneName: z.string(),
          continuityItemID: z.number(),
          sources: z.array(
            z.object({
              mediaID: z.number().optional(),
            }),
          ),
        }),
      ),
    )
    .query(async () => {
      return await findContinuityScenes();
    }),
  dev: r({
    callArbitrary: proc
      .input(z.object({ req: z.string(), params: z.any() }))
      .output(z.any())
      .mutation(async ({ input }) => {
        const dtSettings = await getDevToolsConfig();
        if (!dtSettings.enabled) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Dev tools not enabled",
          });
        }
        return await OBSIntegration.instance.callArbitraryDoNotUseOrYouWillBeFired(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          input.req as any,
          input.params,
        );
      }),
  }),
});
