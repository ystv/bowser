import { useQueryClient } from "@tanstack/react-query";
import { ipc } from "../ipc";
import { getQueryKey } from "@trpc/react-query";
import { OBSSettings } from "./OBS";
import OBSDevToolsScreen from "./OBSDevTools";
import { Switch } from "@bowser/components/switch";
import { Label } from "@bowser/components/label";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@bowser/components/tabs";
import { VMixConnection } from "./vMix";
import { OntimeSettings } from "./Ontime";
import Button from "@bowser/components/button";
import { MediaSettings } from "./MediaSettings";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@bowser/components/select";
import { LogLevelNames } from "loglevel";
import { Integration } from "../../common/types";

export function Settings() {
  const queryClient = useQueryClient();
  const [devToolsState] = ipc.devtools.getSettings.useSuspenseQuery();
  const [integrations] = ipc.integrations.status.useSuspenseQuery();
  const [availableDownloaders] =
    ipc.media.getAvailableDownloaders.useSuspenseQuery();
  const [selectedDownloader] =
    ipc.media.getSelectedDownloader.useSuspenseQuery();
  const [logLevel] = ipc.getLogLevel.useSuspenseQuery();

  const doMainError = ipc.devtools.throwException.useMutation();
  const doMainCrash = ipc.devtools.crash.useMutation();
  const doSetIntegrations = ipc.devtools.setEnabledIntegrations.useMutation({
    onSettled() {
      queryClient.invalidateQueries(getQueryKey(ipc.integrations.status));
    },
  });
  const doSetDownloader = ipc.media.setSelectedDownloader.useMutation({
    onSettled() {
      queryClient.invalidateQueries(
        getQueryKey(ipc.media.getSelectedDownloader),
      );
    },
  });
  const doSetLogLevel = ipc.setLogLevel.useMutation({
    onSettled() {
      queryClient.invalidateQueries(getQueryKey(ipc.getLogLevel));
    },
  });

  const setDevToolsState = ipc.devtools.setSettings.useMutation({
    // https://tanstack.com/query/latest/docs/react/guides/optimistic-updates
    async onMutate(newSettings) {
      await queryClient.cancelQueries(getQueryKey(ipc.devtools.getSettings));
      const oldSettings = queryClient.getQueryData(
        getQueryKey(ipc.devtools.getSettings),
      );
      queryClient.setQueryData(
        getQueryKey(ipc.devtools.getSettings),
        newSettings,
      );
      return { oldSettings };
    },
    async onError(err, newSettings, context) {
      if (context) {
        queryClient.setQueryData(
          getQueryKey(ipc.devtools.getSettings),
          context.oldSettings,
        );
      }
    },
    async onSettled() {
      await queryClient.invalidateQueries(
        getQueryKey(ipc.devtools.getSettings),
      );
    },
  });
  return (
    <Tabs defaultValue="obs">
      <TabsList className="w-full">
        {integrations.obs !== "unsupported" && (
          <TabsTrigger value="obs">OBS</TabsTrigger>
        )}
        {integrations.vmix !== "unsupported" && (
          <TabsTrigger value="vmix">vMix</TabsTrigger>
        )}
        {integrations.ontime !== "unsupported" && (
          <TabsTrigger value="ontime">Ontime</TabsTrigger>
        )}
        <TabsTrigger value="media">Media</TabsTrigger>
        <TabsTrigger value="advanced">Advanced</TabsTrigger>
        {devToolsState.enabled && (
          <TabsTrigger value="obs-devtools">OBS Developer Tools</TabsTrigger>
        )}
        <TabsTrigger value="about">About</TabsTrigger>
      </TabsList>
      {integrations.obs !== "unsupported" && (
        <TabsContent value="obs">
          <OBSSettings />
        </TabsContent>
      )}
      {integrations.vmix !== "unsupported" && (
        <TabsContent value="vmix">
          <VMixConnection />
        </TabsContent>
      )}
      {integrations.ontime !== "unsupported" && (
        <TabsContent value="ontime">
          <OntimeSettings />
        </TabsContent>
      )}
      <TabsContent value="media">
        <MediaSettings />
      </TabsContent>
      <TabsContent value="advanced">
        <h2 className="text-xl">Downloads</h2>
        <Label htmlFor="downloader">Downloader</Label>
        <Select
          value={selectedDownloader}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onValueChange={(e) => doSetDownloader.mutate(e as any)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableDownloaders.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <h2 className="text-xl">Logging</h2>
        <Label htmlFor="logLevel">Log Level</Label>
        <Select
          value={logLevel}
          onValueChange={(e) => doSetLogLevel.mutate(e as LogLevelNames)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["error", "warn", "info", "debug", "trace"].map((l) => (
              <SelectItem key={l} value={l}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <h2 className="text-xl">Developer Tools</h2>
        <p>
          Do not enable unless you know what you are doing, these open you up to
          (theoretical) security vulnerabilities.
        </p>
        <div className="flex items-center space-x-2">
          <Switch
            id="enable-devmode"
            checked={devToolsState.enabled}
            onCheckedChange={(v: boolean) =>
              setDevToolsState.mutate({ enabled: v })
            }
          />
          <Label htmlFor="enable-devmode">Enable Developer Mode</Label>
        </div>
        {devToolsState.enabled && (
          <div className="flex flex-col items-start space-y-2">
            <h3>Forcibly supported integrations</h3>
            {(["obs", "vmix", "ontime"] as Integration[]).map((int) => (
              <div>
                <Switch
                  id={"enable-" + int}
                  checked={integrations[int] !== "unsupported"}
                  onCheckedChange={(v) => {
                    const newIntegrations = Object.keys(integrations).filter(
                      (x) => integrations[x as Integration] !== "unsupported",
                    );
                    if (v) {
                      newIntegrations.push(int);
                    } else {
                      newIntegrations.splice(newIntegrations.indexOf(int), 1);
                    }
                    doSetIntegrations.mutate(newIntegrations);
                  }}
                />
                <Label htmlFor={"enable-" + int}>{int}</Label>
              </div>
            ))}
            <Button
              color="warning"
              onClick={() => {
                throw new Error("Test Renderer Exception");
              }}
            >
              Throw unhandled exception
            </Button>
            <Button
              color="danger"
              onClick={() => {
                doMainError.mutate();
              }}
            >
              Throw error in main process
            </Button>
            <Button
              color="danger"
              onClick={() => {
                doMainCrash.mutate();
              }}
            >
              Crash main process
            </Button>
          </div>
        )}
      </TabsContent>
      {devToolsState.enabled && (
        <TabsContent value="obs-devtools">
          <div className="max-h-[90vh] overflow-y-scroll">
            <OBSDevToolsScreen />
          </div>
        </TabsContent>
      )}
      <TabsContent value="about">
        <h2 className="text-xl">Bowser</h2>
        <p>
          Version <code>{global.__APP_VERSION__}</code>, built on{" "}
          {new Date(global.__BUILD_TIME__).toLocaleString()} from{" "}
          <code>{global.__GIT_COMMIT__.slice(0, 7)}</code>
        </p>
        <p>
          Originally created by Marks Polakovs in 2023, maintained by the YSTV
          Computing Team.
        </p>
      </TabsContent>
    </Tabs>
  );
}
