import OBSWebSocket, {
  OBSRequestTypes,
  OBSResponseTypes,
} from "obs-websocket-js";
import { OBSSettings, getOBSSettings, saveOBSSettings } from "../base/settings";
import { getLogger } from "../base/logging";
import { inspect } from "node:util";
import { IntegrationManager } from "../base/integrations";
import { MockOBSConnection } from "./obs.mock";

const logger = getLogger("obs");

/*
 * This file contains OBSConnection, a wrapper around obs-websocket-js that provides a higher level, more typesafe API.
 * In general, anything that requires more than one call to OBS should go in obsHelpers.ts instead.
 */

export interface Scene {
  sceneIndex: number;
  sceneName: string;
}

export enum OBSBoundsTypes {
  OBS_BOUNDS_NONE = "OBS_BOUNDS_NONE" /**< no bounds */,
  OBS_BOUNDS_STRETCH = "OBS_BOUNDS_STRETCH" /**< stretch (ignores base scale) */,
  OBS_BOUNDS_SCALE_INNER = "OBS_BOUNDS_SCALE_INNER" /**< scales to inner rectangle */,
  OBS_BOUNDS_SCALE_OUTER = "OBS_BOUNDS_SCALE_OUTER" /**< scales to outer rectangle */,
  OBS_BOUNDS_SCALE_TO_WIDTH = "OBS_BOUNDS_SCALE_TO_WIDTH" /**< scales to the width  */,
  OBS_BOUNDS_SCALE_TO_HEIGHT = "OBS_BOUNDS_SCALE_TO_HEIGHT" /**< scales to the height */,
  OBS_BOUNDS_MAX_ONLY = "OBS_BOUNDS_MAX_ONLY" /**< no scaling, maximum size only */,
}
export type OBSBoundsType = keyof typeof OBSBoundsTypes;

export interface SceneItemTransform {
  alignment: number;
  boundsAlignment: number;
  boundsHeight: number;
  boundsType: OBSBoundsType;
  boundsWidth: number;
  cropBottom: number;
  cropLeft: number;
  cropRight: number;
  cropTop: number;
  height: number;
  positionX: number;
  positionY: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  sourceHeight: number;
  sourceWidth: number;
  width: number;
}

export interface SceneItem {
  inputKind: string;
  isGroup: null;
  sceneItemBlendMode: string;
  sceneItemEnabled: boolean;
  sceneItemId: number;
  sceneItemIndex: number;
  sceneItemLocked: boolean;
  sceneItemTransform: SceneItemTransform;
  sourceName: string;
  sourceType: string;
}

export interface MediaSourceSettings {
  local_file: string;
  is_local_file: boolean;
  looping: boolean;
  restart_on_activate: boolean;
}

export interface InputSettingsResult<T = unknown> {
  inputKind: string;
  inputSettings: T;
}

interface FFMPEGSourceDefaultSettings {
  buffering_mb: number;
  clear_on_media_end: boolean;
  is_local_file: boolean;
  linear_alpha: boolean;
  looping: boolean;
  reconnect_delay_sec: number;
  restart_on_activate: boolean;
  speed_percent: number;
}

export type FFMPEGSourceSettings = Partial<FFMPEGSourceDefaultSettings> &
  (
    | {
        is_local_file: true;
        local_file: string;
      }
    | {
        is_local_file: false;
        input: string;
        input_format: string;
      }
  );

interface VLCSourceDefaultSettings {
  loop: boolean;
  network_caching: number;
  playback_behavior: "stop_restart" | "pause_unpause" | "always_play";
  shuffle: boolean;
  subtitle: number;
  subtitle_enable: number;
  track: number;
}

export interface VLCSourceSettings extends Partial<VLCSourceDefaultSettings> {
  playlist: Array<{
    value: string;
  }>;
}

export function castMediaSourceSettings(
  x: InputSettingsResult,
): x is InputSettingsResult<MediaSourceSettings> {
  return x.inputKind === "ffmpeg_source";
}

export interface OBSVideoSettings {
  /**
   * Numerator of the fractional FPS value
   */
  fpsNumerator: number;
  /**
   * Denominator of the fractional FPS value
   */
  fpsDenominator: number;
  /**
   * Width of the base (canvas) resolution in pixels
   */
  baseWidth: number;
  /**
   * Height of the base (canvas) resolution in pixels
   */
  baseHeight: number;
  /**
   * Width of the output resolution in pixels
   */
  outputWidth: number;
  /**
   * Height of the output resolution in pixels
   */
  outputHeight: number;
}

export interface InputBasicInfo {
  inputKind: string;
  unversionedInputKind: string;
  inputName: string;
}

export default class OBSConnection {
  private obs!: OBSWebSocket;
  private logger = getLogger("OBSConnection");
  private constructor() {}
  public static async create(
    obsHost: string,
    obsPassword: string,
    obsPort = 4455,
  ) {
    const obsConnection = new OBSConnection();
    const obs = new OBSWebSocket();
    obs.on("ConnectionError", (err) => {
      obsConnection.logger.error("OBS error: " + String(err));
    });
    obsConnection.logger.info(
      "Connecting to OBS at",
      `ws://${obsHost}:${obsPort}`,
    );
    await obs.connect(`ws://${obsHost}:${obsPort}`, obsPassword, {
      rpcVersion: 1,
    });
    obsConnection.obs = obs;
    return obsConnection;
  }

  public async createScene(name: string): Promise<void> {
    await this._call("CreateScene", { sceneName: name });
  }

  public async listScenes(): Promise<Scene[]> {
    return (await this._call("GetSceneList")).scenes as unknown as Scene[];
  }

  public async getSceneItems(scene: string): Promise<SceneItem[]> {
    return (await this._call("GetSceneItemList", { sceneName: scene }))
      .sceneItems as unknown as SceneItem[];
  }

  public async createMediaSourceInput(
    scene: string,
    inputName: string,
    path: string,
  ) {
    const res = await this._call("CreateInput", {
      sceneName: scene,
      inputName,
      inputKind: "ffmpeg_source",
      inputSettings: {
        local_file: path,
        is_local_file: true,
        looping: false,
        restart_on_activate: true,
      } satisfies FFMPEGSourceSettings,
    });
    return res.sceneItemId;
  }

  public async getSourceSettings(
    inputName: string,
  ): Promise<InputSettingsResult> {
    return await this._call("GetInputSettings", { inputName });
  }

  public async replaceMediaSourceInScene(
    scene: string,
    inputName: string,
    path: string,
  ) {
    await this._call("SetInputSettings", {
      inputName: inputName,
      inputSettings: {
        local_file: path,
        is_local_file: true,
        looping: false,
        restart_on_activate: true,
      },
    });
  }

  public async setSceneItemTransform(
    sceneName: string,
    sceneItemId: number,
    transform: Partial<SceneItemTransform>,
  ): Promise<void> {
    await this._call("SetSceneItemTransform", {
      sceneName,
      sceneItemId,
      sceneItemTransform: transform,
    });
  }

  public async removeSceneItem(sceneTitle: string, itemId: number) {
    await this._call("RemoveSceneItem", {
      sceneName: sceneTitle,
      sceneItemId: itemId,
    });
  }

  public async listSources(): Promise<InputBasicInfo[]> {
    return (await this._call("GetInputList"))
      .inputs as unknown as InputBasicInfo[];
  }

  public async getVideoSettings(): Promise<OBSVideoSettings> {
    return await this._call("GetVideoSettings");
  }

  public async ping() {
    return await this._call("GetVersion");
  }

  public async callArbitraryDoNotUseOrYouWillBeFired(
    req: keyof OBSRequestTypes,
    requestData?: OBSRequestTypes[keyof OBSRequestTypes],
  ): Promise<OBSResponseTypes[keyof OBSResponseTypes]> {
    return await this._call(req, requestData);
  }

  public async close() {
    await this.obs.disconnect();
  }

  private async _call<K extends keyof OBSRequestTypes>(
    req: K,
    requestData?: OBSRequestTypes[K],
  ): Promise<OBSResponseTypes[K]> {
    this.logger.debug("->OBS " + req + " " + inspect(requestData));
    const r = await this.obs.call(req, requestData);
    this.logger.debug("<-OBS " + req + " " + inspect(r));
    return r;
  }
}

export const OBSIntegration = new IntegrationManager<
  OBSConnection,
  OBSSettings
>(
  "obs",
  async (settings, notifyClosed) => {
    if (process.env.__USE_MOCK_OBS) {
      logger.warn("Using mock OBS connection");
      return new MockOBSConnection() as unknown as OBSConnection;
    }
    const conn = await OBSConnection.create(
      settings.host,
      settings.password,
      settings.port,
    );
    await conn.ping();
    // FIXME
    conn["obs"].on("ConnectionClosed", (reason) => {
      notifyClosed(reason);
    });
    return conn;
  },
  getOBSSettings,
  saveOBSSettings,
);
