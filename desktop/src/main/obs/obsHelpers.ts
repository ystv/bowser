import {
  castMediaSourceSettings,
  OBSIntegration,
  OBSVideoSettings,
  SceneItem,
} from "./obs";
import { getLocalMediaSettings, LocalMediaType } from "../base/settings";
import invariant from "../../common/invariant";
import type { Media, ContinuityItem } from "@bowser/prisma/client";
import { getLogger } from "../base/logging";
import { selectedShow } from "../base/selectedShow";

const logger = getLogger("obsHelpers");

/*
 * This file contains helper functions that wrap obsConnection in obs.ts.
 */

export type MediaType = Media & {
  continuityItems: ContinuityItem[];
};

const MEDIA_SOURCE_PREFIX = "Bowser Media ";
export const CONTINUITY_SCENE_NAME_REGEXP = /^\d+ - .+? \[#(\d+)]$/;

/**
 * Adds a file to an OBS scene as a media source, creating the scene if it does not exist.
 * Note that this should only be called for media associated with continuity items, any other media will throw an error.
 * @param info the media to add
 * @param replaceMode how to handle OBS scenes that already exist:
 *   "none": do not replace existing sources
 *   "replace": replace pre-existing Bowser scenes, but not scenes containing other sources
 *   "force": replace the contents of the scene no matter what
 * @return
 *   done: true if the media was added to the scene
 *   warnings: any warnings that occurred
 *   promptReplace: if replaceMode is *not* "replace" or "force", and the scene already exists, this will be "replace" or "force" to indicate that the user should be prompted to replace the scene
 */
export async function addOrReplaceMediaAsScene(
  info: MediaType,
  replaceMode: "none" | "replace" | "force",
): Promise<{
  done: boolean;
  warnings: string[];
  promptReplace?: "replace" | "force";
}> {
  const warnings: string[] = [];
  const warn = (v: string) => {
    logger.warn("addMediaAsScene:", v);
    warnings.push(v);
  };

  invariant(
    info.continuityItems.length > 0,
    "No continuity item for media in addMediaAsScene",
  );
  const localMedia = await getLocalMediaSettings();
  const item = localMedia.find((x) => x.mediaID === info.id);
  invariant(
    item !== undefined,
    `No local media for media ${info.id} [${info.name}] in addMediaAsScene`,
  );

  const videoSettings = await OBSIntegration.instance.getVideoSettings();

  const mediaSourceName = MEDIA_SOURCE_PREFIX + info.id.toString(10);
  const currentContinuityItem = info.continuityItems.find(
    (x) => x.showId === selectedShow.value!.id,
  );
  invariant(
    currentContinuityItem,
    `No continuity item for media ${info.id} matches current show`,
  );
  const sceneTitle = `${currentContinuityItem.order} - ${currentContinuityItem.name} [#${currentContinuityItem.id}]`;
  // Sanity checks
  if (import.meta.env.DEV) {
    invariant(
      mediaSourceName.startsWith(MEDIA_SOURCE_PREFIX),
      "Generated media source name that won't match our prefix checks later",
    );
    invariant(
      sceneTitle.match(CONTINUITY_SCENE_NAME_REGEXP),
      "Generated scene title that won't match our regex checks later",
    );
  }

  const scenes = await OBSIntegration.instance.listScenes();
  const ours = scenes.find((x) => x.sceneName === sceneTitle);
  if (!ours) {
    // The scene doesn't exist, create it from scratch.
    logger.debug("addMediaAsScene: creating scene", sceneTitle);
    await OBSIntegration.instance.createScene(sceneTitle);
    await _doAddMediaToScene(sceneTitle, mediaSourceName, item, videoSettings);
    return { warnings, done: true };
  }

  // The scene exists. Check if it has the source we want, and if not, add it.
  logger.debug("addMediaAsScene: found scene", ours);
  const items = await OBSIntegration.instance.getSceneItems(sceneTitle);
  // If the scene is empty, we can go ahead and add our source
  if (items.length === 0) {
    logger.debug(
      "addMediaAsScene: existing scene doesn't have our source. Adding.",
    );
    await _doAddMediaToScene(sceneTitle, mediaSourceName, item, videoSettings);
    return { warnings, done: true };
  }

  // If the scene is non-empty, but only has our source, we're probably fine - do some sanity checks.
  if (items.length === 1 && items[0].sourceName === mediaSourceName) {
    // The scene exists, and it has a source that matches our naming convention. Check if it's the same file.
    logger.debug("addMediaAsScene: found existing source");
    const settings =
      await OBSIntegration.instance.getSourceSettings(mediaSourceName);
    if (!castMediaSourceSettings(settings)) {
      // Should never happen unless the user manually creates a different source, or there's a Bowser version incompatibility.
      if (replaceMode === "force") {
        warn("Existing source is not a media source. Forcing replacement.");
        await OBSIntegration.instance.removeSceneItem(
          sceneTitle,
          items[0].sceneItemId,
        );
        await _doAddMediaToScene(
          sceneTitle,
          mediaSourceName,
          item,
          videoSettings,
        );
        return { warnings, done: true };
      } else {
        warn("Existing source is not a media source.");
        return { warnings, done: false };
      }
    }
    if (settings.inputSettings.local_file === item.path) {
      logger.debug(
        "addMediaAsScene: existing source is the same file. Nothing to do.",
      );
      return { warnings, done: false };
    }

    // The scene exists, and has a source that matches our naming convention, but it's a different file.
    // This should never actually happen. When a media file is replaced, we create a new Media object with a new ID,
    // which would mean the source has a new name (see the definition of mediaSourceName). There being a source with the
    // same ID and name but different path suggests that the user has manually changed it, and we shouldn't touch it.
    if (replaceMode === "force") {
      warn(
        `Media source ${mediaSourceName} in scene ${sceneTitle} has a different path (${settings.inputSettings.local_file}) than expected (${item.path}). Forcing replacement.`,
      );
      await OBSIntegration.instance.replaceMediaSourceInScene(
        sceneTitle,
        mediaSourceName,
        item.path,
      );
      return { warnings, done: true };
    } else {
      warn(
        `Media source ${mediaSourceName} in scene ${sceneTitle} has a different path (${settings.inputSettings.local_file}) than expected (${item.path}). Not updating.`,
      );
      return {
        warnings,
        done: false,
        promptReplace: "force",
      };
    }
  }
  // If the scene is non-empty, but has only one other source, and it's a Bowser source, we can replace it if the user permits it.
  if (
    items.length === 1 &&
    items[0].sourceName.startsWith(MEDIA_SOURCE_PREFIX)
  ) {
    if (replaceMode === "replace" || replaceMode === "force") {
      logger.debug(
        "addMediaAsScene: existing scene has one Bowser source with mismatching ID. Replacing.",
      );
      await OBSIntegration.instance.removeSceneItem(
        sceneTitle,
        items[0].sceneItemId,
      );
      await _doAddMediaToScene(
        sceneTitle,
        mediaSourceName,
        item,
        videoSettings,
      );
      return { warnings, done: true };
    } else {
      warn(
        `Scene ${sceneTitle} has a pre-existing Bowser source for a different media file.`,
      );
      return { warnings, done: false, promptReplace: "replace" };
    }
  }
  // The scene has non-Bowser sources in it.
  if (replaceMode === "force") {
    // If the user has chosen to force replacement, we can just remove all the other sources and override the path for ours.
    // Note that we don't remove ours due to a potential race condition when removing and adding the same source.
    logger.debug(
      "addMediaAsScene: existing scene has non-Bowser sources. Replacing as the replaceMode is 'force'.",
    );
    let oursPresent = false;
    for (const item of items) {
      if (item.sourceName == mediaSourceName) {
        oursPresent = true;
      } else {
        await OBSIntegration.instance.removeSceneItem(
          sceneTitle,
          item.sceneItemId,
        );
      }
    }
    if (oursPresent) {
      await OBSIntegration.instance.replaceMediaSourceInScene(
        sceneTitle,
        mediaSourceName,
        item.path,
      );
    } else {
      await _doAddMediaToScene(
        sceneTitle,
        mediaSourceName,
        item,
        videoSettings,
      );
    }
    return { warnings, done: true };
  } else {
    // Bail.
    warn(
      `Scene ${sceneTitle} has non-Bowser sources in it. Cowardly refusing to overwrite.`,
    );
    return { warnings, done: false, promptReplace: "force" };
  }
}

async function _doAddMediaToScene(
  sceneTitle: string,
  mediaSourceName: string,
  localMedia: LocalMediaType,
  videoSettings: OBSVideoSettings,
) {
  const id = await OBSIntegration.instance.createMediaSourceInput(
    sceneTitle,
    mediaSourceName,
    localMedia.path,
  );
  await OBSIntegration.instance.setSceneItemTransform(sceneTitle, id, {
    boundsWidth: videoSettings.baseWidth,
    boundsHeight: videoSettings.baseHeight,
    boundsType: "OBS_BOUNDS_SCALE_INNER",
  });
}

export async function findContinuityScenes(): Promise<
  Array<{
    sceneName: string;
    continuityItemID: number;
    sources: (SceneItem & {
      mediaID?: number;
    })[];
  }>
> {
  const scenes = await OBSIntegration.instance.listScenes();
  const continuityScenes = scenes.filter((x) =>
    CONTINUITY_SCENE_NAME_REGEXP.test(x.sceneName),
  );
  const sceneItems = await Promise.all(
    continuityScenes.map((x) =>
      OBSIntegration.instance.getSceneItems(x.sceneName),
    ),
  );
  return continuityScenes.map((x, i) => {
    const sources = sceneItems[i].map((item) => {
      if (!item.sourceName.startsWith(MEDIA_SOURCE_PREFIX)) {
        return item;
      }
      return {
        ...item,
        mediaID: parseInt(
          item.sourceName.slice(MEDIA_SOURCE_PREFIX.length),
          10,
        ),
      };
    });
    const continuityItemID = CONTINUITY_SCENE_NAME_REGEXP.exec(x.sceneName)![1];
    return {
      sceneName: x.sceneName,
      continuityItemID: parseInt(continuityItemID, 10),
      sources,
    };
  });
}
