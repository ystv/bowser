import invariant from "../../common/invariant";
import { getVMixConnection } from "./vmix";
import { InputType, ListInput } from "./vmixTypes";
import type { Asset, Media } from "@bowser/prisma/client";
import { getAssetsSettings, getLocalMediaSettings } from "../base/settings";
import { VMIX_NAMES } from "../../common/constants";

export async function reconcileList(listName: string, elements: string[]) {
  const conn = getVMixConnection();
  invariant(conn, "VMix connection not initialized");
  const state = await conn.getFullState();
  const existingInput = state.inputs.find((x) => x.shortTitle === listName);
  let key;
  if (existingInput) {
    key = existingInput.key;
  } else {
    key = await conn.addInput("VideoList", "");
    await conn.renameInput(key, listName);
  }
  // TODO: Can we do this without removing and adding everything?
  //  Shortcuts unfortunately don't let us reorder, only add and remove.
  await conn.clearList(key);
  // Not done in a Promise.all() to ensure they're done in order
  for (const el of elements) {
    await conn.addInputToList(key, el);
  }
}

export function getInputTypeForAsset(
  asset: Asset & { media: Media | null },
): InputType {
  switch (asset.type) {
    case "Still":
      return "Image";
    case "Music":
    case "SoundEffect":
      return "AudioFile";
    case "Graphic": {
      const media = asset.media;
      invariant(media, "Asset has no media");
      if (media.name.endsWith(".gtxml") || media.name.endsWith(".gtzip")) {
        return "Title";
      } else {
        return "Video";
      }
    }
    default:
      invariant(false, `Unknown asset type ${asset.type}`);
  }
}

export async function loadAssets(assets: (Asset & { media: Media | null })[]) {
  const localMedia = await getLocalMediaSettings();
  const settings = await getAssetsSettings();
  const vmix = getVMixConnection();
  invariant(vmix, "No vMix connection");
  const state = await vmix.getFullState();

  for (const asset of assets) {
    if (!asset.media || asset.media.state !== "Ready") {
      throw new Error("Not all assets have remote media");
    }
    const local = localMedia.find((x) => x.mediaID === asset.media!.id);
    if (!local) {
      throw new Error("No local media for asset " + asset.id);
    }

    const loadType = settings.loadTypes[asset.type];
    invariant(
      loadType,
      "no load type configured for " + asset.type + " asset " + asset.id,
    );
    if (loadType === "direct") {
      const present = state.inputs.find((x) => x.title === asset.media!.name);
      if (!present) {
        await vmix.addInput(getInputTypeForAsset(asset), local.path);
      }
    } else if (loadType === "list") {
      let present;
      const list = state.inputs.find(
        (x) => x.shortTitle === VMIX_NAMES.ASSET_LIST[asset.type],
      );
      let listKey;
      if (!list) {
        present = false;
        listKey = await vmix.addInput("VideoList", "");
        await vmix.renameInput(listKey, VMIX_NAMES.ASSET_LIST[asset.type]);
      } else {
        listKey = list.key;
        present = (list as ListInput).items.some(
          (x) => x.source === local.path,
        );
      }
      if (!present) {
        await vmix.addInputToList(listKey, local.path);
      }
    } else {
      invariant(false, "Invalid load type " + loadType);
    }
  }
}
