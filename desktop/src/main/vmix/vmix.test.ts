import { beforeEach, describe, test, vi, expect } from "vitest";
import { EventEmitter } from "node:events";
import * as fs from "node:fs/promises";
import * as path from "path";
import VMixConnection from "./vmix";

class MockSocket extends EventEmitter {
  write = vi.fn(
    (payload: unknown, encoding: string, cb: (err?: Error) => void) =>
      cb(undefined),
  );
  setEncoding = vi.fn();
}

vi.mock("net", () => ({
  connect: () => {
    const sock = new MockSocket();
    process.nextTick(() => {
      sock.emit("connect");
    });
    return sock;
  },
}));
vi.mock("../base/settings", () => ({
  getVMixSettings: () =>
    Promise.resolve({
      host: "localhost",
      port: 8099,
    }),
  saveVMixSettings: () => {},
}));
vi.mock("../ipcEventBus");

const nextTick = () => new Promise((resolve) => process.nextTick(resolve));

describe("VMixConnection", () => {
  let vmix: VMixConnection;
  let sock: MockSocket;
  beforeEach(async () => {
    vmix = await VMixConnection.connect();
    sock = vmix["sock"] as unknown as MockSocket;
  });
  describe("send/receive", () => {
    test("request and response", async () => {
      // vmix["send"] lets us access vmix.send even though it's private
      const res = vmix["send"]("FUNCTION", "test");
      expect(sock.write).toHaveBeenCalledWith(
        "FUNCTION test\r\n",
        "utf-8",
        expect.any(Function),
      );
      sock.emit("data", "FUNCTION OK test\r\n");
      expect(res).resolves.toEqual(["test", ""]);
    });
    test("no-arg request", async () => {
      vmix["send"]("XML");
      expect(sock.write).toHaveBeenCalledWith(
        "XML\r\n",
        "utf-8",
        expect.any(Function),
      );
    });
    test("binary response", async () => {
      const res = vmix["send"]("FUNCTION", "test");
      sock.emit("data", "FUNCTION 5\r\nhello");
      expect(res).resolves.toEqual(["", "hello"]);
    });
    test("binary response across multiple chunks", async () => {
      const res = vmix["send"]("FUNCTION", "test");
      sock.emit("data", "FUNCTION 5\r\n");
      sock.emit("data", "hello");
      expect(res).resolves.toEqual(["", "hello"]);
    });
    test("response split across chunks", async () => {
      const res = vmix["send"]("FUNCTION", "test");
      sock.emit("data", "FUNCTION");
      sock.emit("data", " OK\r\n");
      expect(res).resolves.toEqual(["", ""]);
    });
    test("message and binary", async () => {
      const res = vmix["send"]("FUNCTION", "test");
      sock.emit(
        "data",
        "FUNCTION 28 This is a message in addition to the binary data\r\n" +
          "This is optional binary data",
      );
      expect(res).resolves.toEqual([
        "This is a message in addition to the binary data",
        "This is optional binary data",
      ]);
    });
    test("error handling", async () => {
      const res = vmix["send"]("FUNCTION", "test");
      sock.emit("data", "FUNCTION ER test\r\n");
      expect(res).rejects.toThrow("test");
    });
    test("two requests", async () => {
      const r1 = vmix["send"]("FUNCTION", "test1");
      const r2 = vmix["send"]("FUNCTION", "test2");
      await nextTick();
      expect(sock.write).toHaveBeenCalledWith(
        "FUNCTION test1\r\n",
        "utf-8",
        expect.any(Function),
      );
      sock.emit("data", "FUNCTION OK test1\r\n");
      expect(r1).resolves.toEqual(["test1", ""]);
      await nextTick();
      expect(sock.write).toHaveBeenCalledWith(
        "FUNCTION test2\r\n",
        "utf-8",
        expect.any(Function),
      );
      sock.emit("data", "FUNCTION OK test2\r\n");
      expect(r2).resolves.toEqual(["test2", ""]);
    });
  });

  test("getFullState", async () => {
    const testXML = await fs.readFile(
      path.join(__dirname, "__testdata__", "vmix.xml"),
      { encoding: "utf-8" },
    );
    const res = vmix.getFullState();
    expect(sock.write).toHaveBeenCalledWith(
      "XML\r\n",
      "utf-8",
      expect.any(Function),
    );
    sock.emit("data", `XML ${testXML.length}\r\n${testXML}`);
    expect(res).resolves.toMatchSnapshot();
  });
});
