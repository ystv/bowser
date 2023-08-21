import { ipc } from "./ipc";
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
import { Label } from "@bowser/components/label";
import {
  IoAlertSharp,
  IoCaretDownOutline,
  IoCheckmarkSharp,
  IoCog,
  IoDownloadSharp,
  IoEllipsisVertical,
} from "react-icons/io5";
import { Suspense, useMemo, useState } from "react";
import OBSScreen from "./screens/OBS";
import VMixScreen from "./screens/vMix";
import { Settings } from "./Settings";
import { SelectShowForm } from "./ConnectAndSelectShowGate";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@bowser/components/table";
import { RadioGroup, RadioGroupItem } from "@bowser/components/radio-group";
import { Alert } from "@bowser/components/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@bowser/components/alert-dialog";

function DownloadTrackerPopup() {
  const downloadStatus = ipc.media.getDownloadStatus.useQuery(void 0, {
    refetchInterval: 1000,
  });

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
        <IoDownloadSharp className="h-8 w-8" size={32} />
      </PopoverTrigger>
      <PopoverContent className="bg-light text-dark px-2 py-4 shadow-lg">
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
  const [integrations] = ipc.supportedIntegrations.useSuspenseQuery();

  const downloadAll = ipc.media.downloadAllMediaForSelectedShow.useMutation();

  const [isChangeShowOpen, setIsChangeShowOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [selectedRundown, setSelectedRundown] = useState<"continuity" | number>(
    integrations.includes("obs") ? "continuity" : show.rundowns[0].id,
  );
  const selectedName =
    selectedRundown === "continuity"
      ? "Continuity"
      : show.rundowns.find((rd) => rd.id === selectedRundown)?.name;
  invariant(selectedName, "selected non-existent rundown");

  const [ontimePushDialogOpen, setOntimePushDialogOpen] = useState(false);
  const ontimeState = ipc.ontime.getConnectionStatus.useQuery();
  const ontimePush = ipc.ontime.pushEvents.useMutation({
    onSuccess() {
      setOntimePushDialogOpen(false);
    },
  });

  return (
    <div>
      <nav className="relative top-0 left-0 w-full h-12 px-4 bg-dark text-light flex flex-nowrap items-center justify-between">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button color="ghost" className="font-bold">
              {show.name}
              <IoEllipsisVertical
                className="h-4 w-4 inline-block ml-1"
                size={24}
              />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => downloadAll.mutate()}>
              {downloadAll.status === "success" && (
                <IoCheckmarkSharp className="h-4 w-4 inline-block" size={24} />
              )}
              {downloadAll.status === "error" && (
                <IoAlertSharp className="h-4 w-4 inline-block" size={24} />
              )}
              Download all media
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setIsChangeShowOpen(true)}>
              Change selected show
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setOntimePushDialogOpen(true)}
              disabled={!ontimeState.isSuccess || ontimeState.data === null}
            >
              Push to Ontime
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
            <DialogTrigger>
              <IoCog className="h-6 w-6" size={24} />
            </DialogTrigger>
            <DialogContent>
              <DialogHeader className="text-3xl">Settings</DialogHeader>
              {isSettingsOpen && (
                <Suspense fallback={<b>Please wait...</b>}>
                  <Settings />
                </Suspense>
              )}
            </DialogContent>
          </Dialog>
          <Dialog
            open={ontimePushDialogOpen}
            onOpenChange={setOntimePushDialogOpen}
          >
            <DialogContent>
              <DialogHeader className="text-3xl">Push to Ontime</DialogHeader>
              <div className="space-y-2">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const data = new FormData(e.currentTarget);
                    const rundownId = data.get("select-rundown");
                    if (!rundownId) {
                      return;
                    }
                    ontimePush.mutate({
                      rundownId:
                        rundownId === "all"
                          ? undefined
                          : parseInt(rundownId as string, 10),
                    });
                  }}
                >
                  <Label htmlFor="select-rundown">
                    Which rundown would you like to push?
                  </Label>
                  <RadioGroup id="select-rundown" name="select-rundown">
                    <div>
                      <RadioGroupItem value="all" id="push-all" />
                      <Label htmlFor="push-all">Entire show</Label>
                    </div>
                    {show.rundowns.map((rd) => (
                      <div key={rd.id}>
                        <RadioGroupItem
                          value={rd.id.toString(10)}
                          id={`push-${rd.id}`}
                        />
                        <Label htmlFor="push-all">{rd.name}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                  <Button type="submit" color="primary">
                    Push
                  </Button>
                </form>
              </div>
              <div>
                {ontimePush.isError && (
                  <Alert variant="danger">
                    Push failed: {ontimePush.error.message}
                  </Alert>
                )}
              </div>
            </DialogContent>
          </Dialog>
          {ontimePush.isSuccess && !ontimePush.data.done && (
            <AlertDialog open={true} onOpenChange={() => ontimePush.reset()}>
              <AlertDialogContent>
                <AlertDialogDescription>
                  There are already events present in Ontime. Would you like to
                  replace them?
                </AlertDialogDescription>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() =>
                      ontimePush.mutate({
                        rundownId: ontimePush.variables!.rundownId,
                        replacementMode: "force",
                      })
                    }
                  >
                    Replace
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
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
            {integrations.includes("obs") ? (
              <DropdownMenuItem
                onClick={() => setSelectedRundown("continuity")}
              >
                Continuity
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem disabled>OBS not available</DropdownMenuItem>
            )}
            {integrations.includes("vmix") ? (
              show.rundowns.map((rd) => (
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
      <div className="relative mb-12 px-2">
        {selectedRundown === "continuity" ? (
          <OBSScreen />
        ) : (
          <VMixScreen
            rundown={show.rundowns.find((rd) => rd.id === selectedRundown)!}
          />
        )}
      </div>
    </div>
  );
}
