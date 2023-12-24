import {
  InputSettingsResult,
  MediaSourceSettings,
  OBSVideoSettings,
  Scene,
  SceneItem,
} from "./obs";
import invariant from "../../common/invariant";

export interface MockSource {
  sceneItemId: number;
  inputName: string;
  inputKind: string;
}
export interface MockScene {
  name: string;
  sources: MockSource[];
}
export class MockOBSConnection {
  public scenes: MockScene[] = [];
  public sourceSettings = new Map<string, MediaSourceSettings>();

  public _reset() {
    this.scenes = [];
  }

  public async listScenes(): Promise<Scene[]> {
    return this.scenes.map((s, i) => ({
      sceneName: s.name,
      sceneIndex: i,
    }));
  }

  public async getSceneItems(sceneName: string): Promise<SceneItem[]> {
    const scene = this.scenes.find((s) => s.name === sceneName);
    invariant(scene, "invalid scene");
    return scene.sources.map((s, i) => ({
      sceneItemId: s.sceneItemId,
      sourceName: s.inputName,
      inputKind: s.inputKind,
      isGroup: null,
      sceneItemEnabled: true,
      sceneItemIndex: i,
      sceneItemTransform: null as never,
      sourceType: "input",
      sceneItemBlendMode: "OBS_BLEND_NORMAL",
      sceneItemLocked: false,
    }));
  }

  public async createScene(name: string) {
    this.scenes.push({
      name,
      sources: [],
    });
  }

  public async createMediaSourceInput(
    sceneName: string,
    inputName: string,
    path: string,
  ): Promise<number> {
    const scene = this.scenes.find((s) => s.name === sceneName);
    invariant(scene, "invalid scene");
    const sceneItemId = scene.sources.length + 1;
    scene.sources.push({
      sceneItemId,
      inputName,
      inputKind: "ffmpeg_source",
    });
    this.sourceSettings.set(inputName, {
      local_file: path,
      is_local_file: true,
      looping: false,
      restart_on_activate: false,
    });
    return sceneItemId;
  }

  public async removeSceneItem(sceneTitle: string, itemId: number) {
    const scene = this.scenes.find((s) => s.name === sceneTitle);
    invariant(scene, "invalid scene");
    const source = scene.sources.find((s) => s.sceneItemId === itemId);
    invariant(source, "invalid source");
    scene.sources = scene.sources.filter((s) => s.sceneItemId !== itemId);
    this.sourceSettings.delete(source.inputName);
  }

  public async getSourceSettings(
    inputName: string,
  ): Promise<InputSettingsResult> {
    return {
      inputKind: "ffmpeg_source",
      inputSettings: this.sourceSettings.get(inputName),
    };
  }

  public async setSceneItemTransform() {}

  public async replaceMediaSourceInScene(
    scene: string,
    inputName: string,
    path: string,
  ) {
    const settings = this.sourceSettings.get(inputName);
    invariant(settings, "invalid source");
    settings.local_file = path;
  }

  public async getVideoSettings(): Promise<OBSVideoSettings> {
    return {
      baseHeight: 1080,
      baseWidth: 1920,
      fpsDenominator: 1,
      fpsNumerator: 60,
      outputHeight: 1080,
      outputWidth: 1920,
    };
  }
}

export function castMediaSourceSettings(
  x: InputSettingsResult,
): x is InputSettingsResult<MediaSourceSettings> {
  return x.inputKind === "ffmpeg_source";
}
