import { ipc, useInvalidateQueryOnIPCEvent } from "./ipc";
import invariant from "../common/invariant";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTrigger,
} from "@bowser/components/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@bowser/components/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@bowser/components/dropdown-menu";
import { Button } from "@bowser/components/button";
import {
  IoAlertSharp,
  IoCaretDownOutline,
  IoCheckmarkSharp,
  IoCog,
  IoDownloadSharp,
  IoEllipsisVertical,
} from "react-icons/io5";
import { Suspense, useEffect, useMemo, useState } from "react";
import OBSScreen from "./screens/OBS";
import VMixScreen from "./screens/vMix";
import { Settings } from "./screens/Settings";
import { SelectShowForm } from "./ConnectAndSelectShowGate";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@bowser/components/table";
import { OntimePush } from "./screens/Ontime";
import { getQueryKey } from "@trpc/react-query";

function DownloadTrackerPopup() {
  const downloadStatus = ipc.media.getDownloadStatus.useQuery(void 0, {
    refetchInterval: 1000,
  });
  useInvalidateQueryOnIPCEvent(
    getQueryKey(ipc.media.getDownloadStatus),
    "downloadStatusChange",
  );

  const downloads = useMemo(
    () => downloadStatus.data?.filter((x) => x.status !== "done"),
    [downloadStatus.data],
  );

  if (!downloads?.length) {
    return null;
  }

  return (
    <Popover>
      <PopoverTrigger>
        <IoDownloadSharp
          className="h-8 w-8"
          size={32}
          data-testid="DownloadTrackerPopup.icon"
        />
      </PopoverTrigger>
      <PopoverContent className="bg-light text-dark px-2 py-4 shadow-lg min-w-[400px]">
        <Table>
          <TableBody>
            {downloads.map((download) => (
              <TableRow key={download.mediaID}>
                <TableCell>{download.name}</TableCell>
                <TableCell>
                  {download.status[0].toUpperCase() + download.status.slice(1)}
                  {download.progressPercent &&
                    `, ${download.progressPercent.toFixed(1)}%`}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </PopoverContent>
    </Popover>
  );
}

export default function MainScreen() {
  const { data: show } = ipc.getSelectedShow.useQuery();
  invariant(show, "no selected show"); // this is safe because MainScreen is rendered inside a ConnectAndSelectShowGate
  const [integrations] = ipc.integrations.status.useSuspenseQuery();

  const downloadAll = ipc.media.downloadAllMediaForSelectedShow.useMutation();

  const [isChangeShowOpen, setIsChangeShowOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [selectedRundown, setSelectedRundown] = useState<"continuity" | number>(
    integrations.obs === "enabled" || show.rundowns.length === 0
      ? "continuity"
      : show.rundowns[0].id,
  );
  const selectedName =
    selectedRundown === "continuity"
      ? "Continuity"
      : show.rundowns.find((rd) => rd.id === selectedRundown)?.name;
  invariant(selectedName, "selected non-existent rundown");

  const ontimeState = ipc.ontime.getConnectionStatus.useQuery();
  const [ontimePushOpen, setOntimePushOpen] = useState(false);

  return (
    <div>
      <nav className="relative top-0 left-0 w-full h-12 px-4 bg-dark text-light flex flex-nowrap items-center justify-between">
        <Button onClick={() => downloadAll.mutate()} color="ghost">
          {downloadAll.status === "success" && (
            <IoCheckmarkSharp className="h-4 w-4 inline-block" size={24} />
          )}
          {downloadAll.status === "error" && (
            <IoAlertSharp className="h-4 w-4 inline-block" size={24} />
          )}
          Download all media
        </Button>
        <Button onClick={() => setIsChangeShowOpen(true)} color="ghost">
          Change selected show
        </Button>
        <Button
          onClick={() => setOntimePushOpen(true)}
          disabled={!ontimeState.isSuccess || ontimeState.data === null}
          color="ghost"
        >
          Push to Ontime
        </Button>
        <Dialog open={isChangeShowOpen} onOpenChange={setIsChangeShowOpen}>
          <DialogContent>
            <DialogHeader className="text-3xl">Change Show</DialogHeader>
            <SelectShowForm onSelect={() => setIsChangeShowOpen(false)} />
          </DialogContent>
        </Dialog>
        <div className="ml-auto flex flex-row flex-nowrap">
          <DownloadTrackerPopup />
          <Dialog
            open={isSettingsOpen}
            onOpenChange={(v) => setIsSettingsOpen(v)}
          >
            <DialogTrigger aria-label="Settings">
              <IoCog className="h-6 w-6" size={24} />
            </DialogTrigger>
            <DialogContent>
              <DialogHeader className="text-3xl">Settings</DialogHeader>
              <Suspense fallback={<b>Please wait, loading settings...</b>}>
                <Settings />
              </Suspense>
            </DialogContent>
          </Dialog>
        </div>
      </nav>
      <nav className="relative left-0 w-full h-12 mb-2 px-4 bg-mid-dark text-light flex flex-nowrap items-center justify-between">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button color="ghost" className="font-bold">
              {selectedName}
              <IoCaretDownOutline
                className="h-4 w-4 inline-block ml-1"
                size={32}
              />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {integrations.obs === "active" ? (
              <DropdownMenuItem
                onClick={() => setSelectedRundown("continuity")}
              >
                Continuity
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem disabled>OBS not available</DropdownMenuItem>
            )}
            {integrations.vmix === "active" ? (
              show.rundowns
                .sort((a, b) => a.order - b.order)
                .map((rd) => (
                  <DropdownMenuItem
                    key={rd.id}
                    onClick={() => setSelectedRundown(rd.id)}
                  >
                    {rd.name}
                  </DropdownMenuItem>
                ))
            ) : (
              <DropdownMenuItem disabled>vMix not available</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
      <div className="relative mb-12 px-2 max-h-[100vh] overflow-y-scroll">
        {selectedRundown === "continuity" ? (
          <OBSScreen />
        ) : (
          <VMixScreen
            rundown={show.rundowns.find((rd) => rd.id === selectedRundown)!}
          />
        )}
      </div>
      <OntimePush
        show={show}
        dialogOpen={ontimePushOpen}
        setDialogOpen={setOntimePushOpen}
      />
    </div>
  );
}
