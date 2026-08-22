import fs from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  cameraPoseForEndpoint,
  createThreePointPath,
  formatCameraPath,
  nearestCameraClip,
  parseCameraPath,
  synchronizePathEndpoints,
} from "./camera-editor.js";
import { DirectorRuntime } from "./director.js";
import { SceneStore } from "./model.js";

const appRoot = path.resolve(import.meta.dirname, "..");
const fullProject = JSON.parse(fs.readFileSync(
  path.join(appRoot, "projects", "window-case", "window-that-wasnt-there.blockout.json"),
  "utf8",
));

afterEach(() => vi.unstubAllGlobals());

describe("cinematic camera editor helpers", () => {
  it("round-trips multiline camera rails and rejects ambiguous short paths", () => {
    const pathValue = parseCameraPath("(0, 2, 8)\n1， 2.5， 6\n2 2 4", "相机轨道");
    expect(pathValue).toEqual([[0, 2, 8], [1, 2.5, 6], [2, 2, 4]]);
    expect(parseCameraPath(formatCameraPath(pathValue))).toEqual(pathValue);
    expect(() => parseCameraPath("0, 2, 8\n2, 2, 4")).toThrow(/至少 3 个控制点/);
    expect(() => parseCameraPath("0, two, 8\n1, 2, 6\n2, 2, 4")).toThrow(/三个数字/);
  });

  it("keeps curved rails anchored to the editable A and B poses", () => {
    const pathValue = [[9, 9, 9], [1, 4, 5], [-9, -9, -9]];
    const synchronized = synchronizePathEndpoints(pathValue, [0, 2, 8], [2, 2, 4]);
    expect(synchronized).toEqual([[0, 2, 8], [1, 4, 5], [2, 2, 4]]);
    expect(createThreePointPath([0, 0, 0], [2, 4, 6])).toEqual([
      [0, 0, 0],
      [1, 2, 3],
      [2, 4, 6],
    ]);
  });

  it("uses path endpoints as the rendered camera poses and finds the nearest shot", () => {
    const clip = {
      fromPosition: [20, 20, 20],
      toPosition: [30, 30, 30],
      fromLookAt: [0, 0, 0],
      toLookAt: [1, 1, 1],
      fromFov: 35,
      toFov: 55,
      positionPath: [[1, 2, 3], [2, 3, 4], [3, 4, 5]],
      lookAtPath: [[0, 1, 0], [0.5, 1, 0], [1, 1, 0]],
    };
    expect(cameraPoseForEndpoint(clip, "from")).toEqual({ position: [1, 2, 3], lookAt: [0, 1, 0], fov: 35 });
    expect(cameraPoseForEndpoint(clip, "to")).toEqual({ position: [3, 4, 5], lookAt: [1, 1, 0], fov: 55 });
    expect(nearestCameraClip(fullProject.director.timeline, 100)?.label).toBe("B7-02 · 电影机位");
  });
});

describe("cinematic camera timeline mutations", () => {
  it("changes only the selected camera clip and preserves the hand-authored 166 second timeline", () => {
    const store = new SceneStore(fullProject);
    const before = structuredClone(store.getState().project);
    const selected = before.director.timeline.clips.find((clip) => clip.type === "camera");
    const untouched = new Map(before.director.timeline.clips
      .filter((clip) => clip.id !== selected.id)
      .map((clip) => [clip.id, clip]));

    expect(store.updateCameraClip(selected.id, {
      label: "B1-01 · 修订机位",
      fromPosition: [0.25, 1.7, 10.1],
      fromFov: 38,
    })).toBe(true);

    const after = store.getState().project;
    expect(after.director.timeline.duration).toBe(166);
    expect(after.director.timeline.clips).toHaveLength(before.director.timeline.clips.length);
    expect(after.director.screenplay).toBe(before.director.screenplay);
    expect(after.director.timeline.compiledScript).toBe(before.director.timeline.compiledScript);
    expect(after.director.timeline.clips.find((clip) => clip.id === selected.id)).toMatchObject({
      label: "B1-01 · 修订机位",
      fromPosition: [0.25, 1.7, 10.1],
      fromFov: 38,
    });
    after.director.timeline.clips.filter((clip) => clip.id !== selected.id).forEach((clip) => {
      expect(clip).toEqual(untouched.get(clip.id));
    });
    expect(store.undo()).toBe(true);
    expect(store.getState().project).toEqual(before);
  });

  it("adds, duplicates and recoverably deletes cinematic shots", () => {
    const store = new SceneStore(fullProject);
    const originalCount = store.getState().project.director.timeline.clips.length;
    const id = store.addCameraClip({
      start: 166,
      duration: 2,
      fromPosition: [1, 2, 8],
      toPosition: [2, 2, 6],
      fromLookAt: [0, 1, 0],
      toLookAt: [0.5, 1, 0],
    });
    expect(store.getState().project.director.timeline.duration).toBe(168);
    const duplicateId = store.duplicateCameraClip(id);
    expect(duplicateId).not.toBe(id);
    expect(store.getState().project.director.timeline.clips).toHaveLength(originalCount + 2);
    expect(store.deleteCameraClip(duplicateId)).toBe(true);
    expect(store.getState().project.director.timeline.clips).toHaveLength(originalCount + 1);
    expect(store.getState().project.director.timeline.duration).toBe(168);
    expect(store.undo()).toBe(true);
    expect(store.getState().project.director.timeline.clips.some((clip) => clip.id === duplicateId)).toBe(true);
    expect(store.getState().project.director.timeline.duration).toBe(170);
  });

  it("plays one camera clip as a bounded preview range", () => {
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    let frame = null;
    let playback = null;
    const runtime = new DirectorRuntime(fullProject, (nextFrame) => { frame = nextFrame; }, (state) => { playback = state; });

    expect(runtime.playRange(12, 12.1)).toBe(true);
    runtime.pause();
    expect(runtime.playbackEnd).toBe(12.1);
    expect(runtime.play()).toBe(true);
    expect(runtime.playbackEnd).toBe(12.1);
    runtime.tick(runtime.fixedClock.lastTimestamp + 250);

    expect(frame.time).toBeCloseTo(12.1, 5);
    expect(runtime.time).toBeCloseTo(12.1, 5);
    expect(runtime.playing).toBe(false);
    expect(playback.playing).toBe(false);
    expect(runtime.playbackEnd).toBeNull();
  });
});
