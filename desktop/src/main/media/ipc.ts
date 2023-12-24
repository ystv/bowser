import { z } from "zod";
import * as fsp from "fs/promises";
import { proc, r } from "../base/ipcRouter";
import {
  DownloadStatusSchema,
  deleteMedia,
  downloadMedia,
  getDownloadStatus,
  getMediaPath,
} from "./mediaManagement";
import {
  LocalMediaData,
  getDownloadsSettings,
  getLocalMediaSettings,
  saveDownloadsSettings,
} from "../base/settings";
import { shell } from "electron";
import { selectedShow } from "../base/selectedShow";
import { serverAPI } from "../base/serverApiClient";
import { getLogger } from "../base/logging";
import { isAfter } from "date-fns";
import invariant from "../../common/invariant";
import { getAvailableDownloaders } from "./downloadFile";
import { enabledIntegrations } from "../base/integrations";

const logger = getLogger("media/ipc");

export const mediaRouter = r({
  getDownloadStatus: proc
    .output(z.array(DownloadStatusSchema))
    .query(() => getDownloadStatus()),
  downloadMedia: proc
    .input(z.object({ id: z.number(), name: z.string().optional() }))
    .mutation(async ({ input }) => {
      downloadMedia(input.id, input.name);
    }),
  getLocalMedia: proc
    .input(
      z
        .object({
          includeSize: z.boolean().default(false),
        })
        .optional(),
    )
    .output(
      z.array(
        LocalMediaData.extend({
          sizeBytes: z.number().optional(),
        }),
      ),
    )
    .query(async ({ input }) => {
      const media = await getLocalMediaSettings();
      if (input?.includeSize) {
        await Promise.all(
          media.map(async (item) => {
            let stat;
            try {
              stat = await fsp.stat(item.path);
            } catch (e) {
              // This is an orphan. TODO [BOW-67]: we don't currently handle them
              return;
            }
            // prettier-ignore
            (item as z.infer<typeof LocalMediaData> & {sizeBytes: number}).sizeBytes = stat.size;
          }),
        );
      }
      return media;
    }),
  getPath: proc.output(z.string()).query(() => getMediaPath()),
  openPath: proc.mutation(async () => {
    await shell.openPath(await getMediaPath());
  }),
  delete: proc
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteMedia(input.id);
    }),
  deleteOldMedia: proc
    .input(z.object({ minAgeDays: z.number() }))
    .mutation(async ({ input }) => {
      const localMedia = await getLocalMediaSettings();
      const currentShow = selectedShow.value;
      let notInUse;
      if (currentShow) {
        const inUse = new Set<number>();
        currentShow?.continuityItems.forEach((x) => {
          if (x.media) {
            inUse.add(x.media.id);
          }
        });
        currentShow?.rundowns.forEach((x) =>
          x.items.forEach((y) => {
            if (y.media) {
              inUse.add(y.media.id);
            }
          }),
        );
        notInUse = localMedia.filter((x) => !inUse.has(x.mediaID));
      } else {
        notInUse = localMedia;
      }
      const mediaObjects = await serverAPI().media.bulkGet.query(
        notInUse.map((x) => x.mediaID),
      );
      for (const result of mediaObjects) {
        logger.debug("Deletion candidate", result);
        if (result.state !== "Ready") {
          continue;
        }
        const latestShowDate = [
          result.rundownItems.map((x) => x.rundown.show.start),
          result.continuityItems.map((x) => x.show.start),
          result.assets.map((x) => x.rundown.show.start),
        ]
          .flat()
          .reduce((a, b) => (isAfter(a, b) ? a : b), new Date(0));
        invariant(
          latestShowDate.getTime() !== 0,
          "no rundown, continuity item, or asset for media " + result.id,
        );
        const age =
          (Date.now() - latestShowDate.getTime()) / (1000 * 60 * 60 * 24);
        logger.debug(
          result.id,
          result.name,
          "age",
          age,
          "threshold",
          input.minAgeDays,
        );
        if (age > input.minAgeDays) {
          logger.debug("Deleting", result.id);
          await deleteMedia(result.id);
        }
      }
    }),
  downloadAllMediaForSelectedShow: proc.mutation(async () => {
    const show = selectedShow.value;
    invariant(show, "No show selected");
    const state = await getLocalMediaSettings();
    if (enabledIntegrations.has("vmix")) {
      for (const rundown of show.rundowns) {
        for (const item of rundown.items) {
          if (
            item.media?.state === "Ready" &&
            !state.some((x) => x.mediaID === item.media?.id)
          ) {
            downloadMedia(item.media.id, item.media.name);
          }
        }
        for (const item of rundown.assets) {
          if (
            item.media?.state === "Ready" &&
            !state.some((x) => x.mediaID === item.media?.id)
          ) {
            downloadMedia(item.media.id, item.media.name);
          }
        }
      }
    }
    if (enabledIntegrations.has("obs")) {
      for (const item of show.continuityItems) {
        if (
          item.media?.state === "Ready" &&
          !state.some((x) => x.mediaID === item.media?.id)
        ) {
          downloadMedia(item.media.id, item.media.name);
        }
      }
    }
  }),
  getAvailableDownloaders: proc
    .output(z.array(z.enum(["Auto", "Node", "Curl"])))
    .query(async () => {
      return ["Auto", ...(await getAvailableDownloaders())];
    }),
  getSelectedDownloader: proc
    .output(z.enum(["Auto", "Node", "Curl"]))
    .query(async () => {
      const settings = await getDownloadsSettings();
      return settings.downloader;
    }),
  setSelectedDownloader: proc
    .input(z.enum(["Auto", "Node", "Curl"]))
    .mutation(async ({ input }) => {
      await saveDownloadsSettings({ downloader: input });
    }),
});
