import { z } from "zod";
import { proc, r } from "../base/ipcRouter";
import { getLogger } from "../base/logging";
import invariant from "../../common/invariant";
import { serverAPI } from "../base/serverApiClient";
import { PartialMediaModel } from "@bowser/prisma/utilityTypes";
import { getLocalMediaSettings } from "../base/settings";
import { TRPCError } from "@trpc/server";
import { loadAssets, reconcileList } from "./vmixHelpers";
import { VMIX_NAMES } from "../../common/constants";
import { VMixIntegration } from "./vmix";

const logger = getLogger("vmix/ipc");

export const vmixRouter = r({
  getConnectionState: proc
    .output(
      z.object({
        connected: z.boolean(),
        host: z.string().optional(),
        port: z.number().optional(),
        version: z.string().optional(),
        edition: z.string().optional(),
      }),
    )
    .query(async () => {
      if (VMixIntegration.maybeInstance === null) {
        return { connected: false };
      }
      const state = await VMixIntegration.instance.getFullState();
      logger.debug("VMix state", state);
      return {
        connected: true,
        host: VMixIntegration.instance.host,
        port: VMixIntegration.instance.port,
        version: state.version,
        edition: state.edition,
      };
    }),
  tryConnect: proc
    .input(
      z.object({
        host: z.string(),
        port: z.number(),
      }),
    )
    .output(
      z.object({
        connected: z.boolean(),
        version: z.string().optional(),
        edition: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      await VMixIntegration.start(input);
      const state = await VMixIntegration.instance.getFullState();
      return {
        connected: true,
        version: state.version,
        edition: state.edition,
      };
    }),
  getCompleteState: proc.query(() => {
    return VMixIntegration.instance.getFullState();
  }),
  loadRundownVTs: proc
    .input(
      z.object({
        rundownID: z.number(),
      }),
    )
    .mutation(async ({ input }) => {
      const rundown = await serverAPI().rundowns.get.query({
        id: input.rundownID,
      });
      invariant(rundown, "Rundown not found");
      const media = rundown.items
        .sort((a, b) => a.order - b.order)
        .map<z.infer<typeof PartialMediaModel> | null>((i) => i.media)
        .filter((x) => x && x.state === "Ready");
      const localMedia = await getLocalMediaSettings();
      const paths = media.map(
        (remote) =>
          localMedia.find((local) => local.mediaID === remote?.id)?.path,
      );
      if (paths.some((x) => !x)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Not all media is downloaded locally",
        });
      }
      await reconcileList(VMIX_NAMES.VTS_LIST, paths as string[]);
    }),
  loadAssets: proc
    .input(
      z.object({
        rundownID: z.number(),
        assetIDs: z.array(z.number()),
      }),
    )
    .mutation(async ({ input }) => {
      const rundown = await serverAPI().rundowns.get.query({
        id: input.rundownID,
      });
      invariant(rundown, "Rundown not found");
      const assets = rundown.assets.filter((x) =>
        input.assetIDs.includes(x.id),
      );
      if (assets.length !== input.assetIDs.length) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Not all assets are in the rundown",
        });
      }
      await loadAssets(assets);
    }),
});
