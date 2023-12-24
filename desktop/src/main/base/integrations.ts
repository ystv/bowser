import { Logger } from "loglevel";
import { Integration, IntegrationState } from "../../common/types";
import { getLogger } from "./logging";
import invariant from "../../common/invariant";
import { inspect } from "util";
import { IPCEvents } from "../ipcEventBus";

export const supportedIntegrations = new Set<Integration>(
  process.platform === "win32" ? ["vmix", "obs", "ontime"] : ["obs", "ontime"],
);

export function DEV_overrideSupportedIntegrations(integrations: Integration[]) {
  supportedIntegrations.clear();
  for (const integration of integrations) {
    supportedIntegrations.add(integration);
  }
  IPCEvents.send("integrationsStateChange", getIntegrationStates());
}

export const enabledIntegrations = new Set<Integration>();

export const activeIntegrations = new Set<Integration>();

export const integrationManagers = new Map<
  Integration,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  IntegrationManager<any, any>
>();

export function getIntegrationStates(): Record<Integration, IntegrationState> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: Record<Integration, IntegrationState> = {} as any;
  for (const integration of Integration.options) {
    if (activeIntegrations.has(integration)) {
      result[integration] = "active";
    } else if (enabledIntegrations.has(integration)) {
      result[integration] = "enabled";
    } else if (supportedIntegrations.has(integration)) {
      result[integration] = "disabled";
    } else {
      result[integration] = "unsupported";
    }
  }
  return result;
}

export interface IntegrationMethods {
  close: () => Promise<void>;
}

type IntegrationFactory<T extends IntegrationMethods, TSettings> = (
  settings: TSettings,
  notifyClosed: (reason?: unknown) => void,
) => Promise<T>;

export class IntegrationManager<
  T extends IntegrationMethods,
  TSettings = unknown,
> {
  private _logger: Logger;
  private _instance: T | null = null;
  private _startRetryTimer: NodeJS.Timeout | null = null;

  private static START_RETRY_INTERVAL = 5000;

  public constructor(
    private readonly _type: Integration,
    private readonly _factory: IntegrationFactory<T, TSettings>,
    private readonly _getSettings: () => Promise<TSettings | null>,
    private readonly _saveSettings: (settings: TSettings) => Promise<void>,
  ) {
    this._logger = getLogger(`IntegrationManager[${_type}]`);
    integrationManagers.set(_type, this);
  }

  public async startIfNotStarted(settings?: TSettings) {
    if (this._instance) {
      return;
    }
    return this.start(settings);
  }

  public async start(settings?: TSettings, retry = false) {
    if (this._startRetryTimer) {
      clearTimeout(this._startRetryTimer);
      this._startRetryTimer = null;
    }
    if (!settings) {
      const tmp = await this._getSettings();
      if (!tmp) {
        this._logger.warn("IntegrationManager.start(): no settings");
        enabledIntegrations.delete(this._type);
        return;
      }
      settings = tmp;
    }
    this._logger.debug("Starting");
    enabledIntegrations.add(this._type);
    try {
      this._instance = await this._factory(
        settings,
        this._deactivated.bind(this),
      );
    } catch (e) {
      this._logger.error("Failed to start integration: " + String(e));
      if (retry) {
        this._logger.info(
          `Will try again in ${
            IntegrationManager.START_RETRY_INTERVAL / 1000
          }s`,
        );
        this._startRetryTimer = setTimeout(() => {
          this.start(settings, true);
        }, IntegrationManager.START_RETRY_INTERVAL);
      }
      return;
    }
    activeIntegrations.add(this._type);
    await this._saveSettings(settings);
    IPCEvents.send("integrationsStateChange", getIntegrationStates());
  }

  private _deactivated(reason: unknown) {
    this._logger.info("Deactivated: " + inspect(reason));
    activeIntegrations.delete(this._type);
    this._instance = null;
    IPCEvents.send("integrationsStateChange", getIntegrationStates());
  }

  public async close() {
    if (this._instance) {
      this._logger.debug("Closing");
      try {
        await this._instance.close();
      } catch (e) {
        this._logger.error("Failed to close integration", e);
      }
      this._instance = null;
      activeIntegrations.delete(this._type);
      if (this._startRetryTimer) {
        clearTimeout(this._startRetryTimer);
        this._startRetryTimer = null;
      }
      IPCEvents.send("integrationsStateChange", getIntegrationStates());
    }
  }

  public get instance() {
    invariant(this._instance, `Integration ${this._type} not started`);
    return this._instance;
  }

  public get maybeInstance() {
    return this._instance;
  }
}
