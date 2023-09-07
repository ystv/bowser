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

export function Settings() {
  const queryClient = useQueryClient();
  const [devToolsState] = ipc.devtools.getSettings.useSuspenseQuery();
  const [integrations] = ipc.supportedIntegrations.useSuspenseQuery();

  const doMainError = ipc.devtools.throwException.useMutation();
  const doMainCrash = ipc.devtools.crash.useMutation();

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
        {integrations.includes("obs") && (
          <TabsTrigger value="obs">OBS</TabsTrigger>
        )}
        {integrations.includes("vmix") && (
          <TabsTrigger value="vmix">vMix</TabsTrigger>
        )}
        {integrations.includes("ontime") && (
          <TabsTrigger value="ontime">Ontime</TabsTrigger>
        )}
        <TabsTrigger value="media">Media</TabsTrigger>
        <TabsTrigger value="advanced">Advanced</TabsTrigger>
        {devToolsState.enabled && (
          <TabsTrigger value="obs-devtools">OBS Developer Tools</TabsTrigger>
        )}
        <TabsTrigger value="about">About</TabsTrigger>
      </TabsList>
      {integrations.includes("obs") && (
        <TabsContent value="obs">
          <OBSSettings />
        </TabsContent>
      )}
      {integrations.includes("vmix") && (
        <TabsContent value="vmix">
          <VMixConnection />
        </TabsContent>
      )}
      {integrations.includes("ontime") && (
        <TabsContent value="ontime">
          <OntimeSettings />
        </TabsContent>
      )}
      <TabsContent value="media">
        <MediaSettings />
      </TabsContent>
      <TabsContent value="advanced">
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