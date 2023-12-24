import {
  vi,
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from "vitest";
import {
  addOrReplaceMediaAsScene,
  findContinuityScenes,
  MediaType,
} from "./obsHelpers";
import { selectedShow } from "../base/selectedShow";
import { MockOBSConnection } from "./obs.mock";
import { OBSIntegration } from "./obs";

vi.mock("../base/settings", () => ({
  getLocalMediaSettings: () => [
    {
      mediaID: 1,
      path: "TEST_PATH",
    },
  ],
  getOBSSettings: () => Promise.resolve({}),
  saveOBSSettings: () => {},
}));
vi.mock("../ipcEventBus");

beforeAll(async () => {
  selectedShow.next({
    id: 1,
    name: "Test",
    start: new Date(),
    rundowns: [],
    continuityItems: [],
    version: 1,
    ytBroadcastID: null,
    ytStreamID: null,
  });
  process.env.__USE_MOCK_OBS = "true";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await OBSIntegration.start({} as any);
});

afterAll(() => {
  delete process.env.__USE_MOCK_OBS;
});

describe("addOrReplaceMediaAsScene", () => {
  const testMedia: MediaType = {
    id: 1,
    name: "Test.mp4",
    state: "Ready",
    path: "",
    continuityItems: [
      {
        id: 1,
        mediaId: 1,
        name: "Test Continuity",
        order: 1,
        durationSeconds: 15,
        showId: 1,
        ytBroadcastID: null,
      },
    ],
    durationSeconds: 15,
    rawPath: "",
  };
  let mobs: MockOBSConnection;
  beforeEach(async () => {
    mobs = OBSIntegration.instance as unknown as MockOBSConnection;
  });
  afterEach(() => {
    mobs._reset();
  });

  test("add with no scenes", async () => {
    const res = await addOrReplaceMediaAsScene(testMedia, "none");
    expect(res).toEqual({
      done: true,
      warnings: [],
    });
    expect(mobs.scenes).toMatchInlineSnapshot(`
      [
        {
          "name": "1 - Test Continuity [#1]",
          "sources": [
            {
              "inputKind": "ffmpeg_source",
              "inputName": "Bowser Media 1",
              "sceneItemId": 1,
            },
          ],
        },
      ]
    `);
  });

  test("no change", async () => {
    mobs.scenes.push({
      name: "1 - Test Continuity [#1]",
      sources: [
        {
          inputKind: "ffmpeg_source",
          inputName: "Bowser Media 1",
          sceneItemId: 1,
        },
      ],
    });
    const res = await addOrReplaceMediaAsScene(testMedia, "none");
    expect(res).toEqual({
      done: false,
      warnings: [],
    });
    expect(mobs.scenes).toMatchSnapshot();
  });

  test("add to existing empty scene", async () => {
    mobs.scenes.push({
      name: "1 - Test Continuity [#1]",
      sources: [],
    });
    const res = await addOrReplaceMediaAsScene(testMedia, "none");
    expect(res).toEqual({
      done: true,
      warnings: [],
    });
    expect(mobs.scenes[0].sources).toHaveLength(1);
    expect(mobs.scenes).toMatchSnapshot();
  });

  test("replace in pre-existing scene with new media ID", async () => {
    mobs.scenes.push({
      name: "1 - Test Continuity [#1]",
      sources: [
        {
          inputKind: "ffmpeg_source",
          inputName: "Bowser Media 999",
          sceneItemId: 1,
        },
      ],
    });
    const res = await addOrReplaceMediaAsScene(testMedia, "none");
    expect(res).toMatchInlineSnapshot(`
      {
        "done": false,
        "promptReplace": "replace",
        "warnings": [
          "Scene 1 - Test Continuity [#1] has a pre-existing Bowser source for a different media file.",
        ],
      }
    `);
    expect(mobs.scenes[0].sources[0].inputName).toBe("Bowser Media 999");

    const res2 = await addOrReplaceMediaAsScene(testMedia, "replace");
    expect(res2).toEqual({
      done: true,
      warnings: [],
    });
    expect(mobs.scenes).toMatchSnapshot();
    expect(mobs.scenes[0].sources[0].inputName).toBe("Bowser Media 1");
  });

  test("non-Bowser sources present", async () => {
    mobs.scenes.push({
      name: "1 - Test Continuity [#1]",
      sources: [
        {
          inputKind: "ffmpeg_source",
          inputName: "Bowser Media 999",
          sceneItemId: 1,
        },
        {
          inputKind: "text_ft2_source_v2",
          inputName: "Text",
          sceneItemId: 2,
        },
      ],
    });
    const res = await addOrReplaceMediaAsScene(testMedia, "none");
    expect(res).toMatchInlineSnapshot(`
      {
        "done": false,
        "promptReplace": "force",
        "warnings": [
          "Scene 1 - Test Continuity [#1] has non-Bowser sources in it. Cowardly refusing to overwrite.",
        ],
      }
    `);

    const res2 = await addOrReplaceMediaAsScene(testMedia, "force");
    expect(res2).toEqual({
      done: true,
      warnings: [],
    });
    expect(mobs.scenes).toMatchSnapshot();
    expect(mobs.scenes[0].sources).toHaveLength(1);
    expect(mobs.sourceSettings).toMatchSnapshot();
  });
});

describe("findContinuityScenes", () => {
  let mobs: MockOBSConnection;
  beforeEach(async () => {
    mobs = OBSIntegration.instance as unknown as MockOBSConnection;
  });
  afterEach(() => {
    mobs._reset();
  });
  test("empty", async () => {
    expect(await findContinuityScenes()).toHaveLength(0);
  });
  test("one with no media", async () => {
    mobs.scenes.push({
      name: "1 - Test [#1]",
      sources: [],
    });
    const res = await findContinuityScenes();
    expect(res).toHaveLength(1);
    expect(res).toMatchInlineSnapshot(`
      [
        {
          "continuityItemID": 1,
          "sceneName": "1 - Test [#1]",
          "sources": [],
        },
      ]
    `);
  });
  test("one with media", async () => {
    mobs.scenes.push({
      name: "1 - Test [#1]",
      sources: [
        {
          inputName: "media",
          inputKind: "ffmpeg_source",
          sceneItemId: 1,
        },
      ],
    });
    const res = await findContinuityScenes();
    expect(res).toHaveLength(1);
    expect(res[0].sources).toHaveLength(1);
    expect(res[0].sources[0]).toMatchInlineSnapshot(`
      {
        "inputKind": "ffmpeg_source",
        "isGroup": null,
        "sceneItemBlendMode": "OBS_BLEND_NORMAL",
        "sceneItemEnabled": true,
        "sceneItemId": 1,
        "sceneItemIndex": 0,
        "sceneItemLocked": false,
        "sceneItemTransform": null,
        "sourceName": "media",
        "sourceType": "input",
      }
    `);
  });
});
