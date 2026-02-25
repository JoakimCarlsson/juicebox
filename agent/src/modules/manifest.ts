/// <reference types="npm:@types/frida-gum" />

import type { AgentModule } from "../types";
import Java from "frida-java-bridge";

interface IntentFilterData {
  actions: string[];
  categories: string[];
  data: { scheme?: string; host?: string; path?: string; type?: string }[];
}

interface ComponentData {
  name: string;
  exported: boolean;
  permission: string | null;
  intentFilters: IntentFilterData[];
}

interface ActivityData extends ComponentData {
  launchMode: string;
}

interface ProviderData extends ComponentData {
  authorities: string;
  readPermission: string | null;
  writePermission: string | null;
  grantUriPermissions: boolean;
}

interface ManifestResult {
  platform: string;
  packageName: string;
  versionName: string | null;
  versionCode: number;
  permissions: string[];
  activities: ActivityData[];
  services: ComponentData[];
  receivers: ComponentData[];
  providers: ProviderData[];
}

interface IntentParams {
  component: string;
  type: "activity" | "service" | "broadcast";
  action?: string;
  data?: string;
  categories?: string[];
  extras?: Record<string, { type: string; value: unknown }>;
  flags?: number;
}

const LAUNCH_MODES = ["standard", "singleTop", "singleTask", "singleInstance"];

const GET_ACTIVITIES = 0x00000001;
const GET_SERVICES = 0x00000004;
const GET_RECEIVERS = 0x00000002;
const GET_PROVIDERS = 0x00000008;
const GET_PERMISSIONS = 0x00001000;
const GET_META_DATA = 0x00000080;
const MATCH_DISABLED_COMPONENTS = 0x00000200;

function withJava<T>(fallback: T, fn: (resolve: (v: T) => void) => void): Promise<T> {
  if (!Java.available) return Promise.resolve(fallback);
  return new Promise<T>((resolve) => {
    Java.perform(() => {
      fn(resolve);
    });
  });
}

function extractIntentFilters(
  pm: any,
  packageName: string,
  componentName: string,
  componentType: "activity" | "service" | "receiver",
): IntentFilterData[] {
  const filters: IntentFilterData[] = [];
  try {
    const ComponentName = Java.use("android.content.ComponentName");
    const cn = ComponentName.$new(packageName, componentName);

    let infoFlags = GET_META_DATA | MATCH_DISABLED_COMPONENTS;
    let info: any;
    if (componentType === "activity") {
      info = pm.getActivityInfo(cn, infoFlags);
    } else if (componentType === "service") {
      info = pm.getServiceInfo(cn, infoFlags);
    } else {
      info = pm.getReceiverInfo(cn, infoFlags);
    }

    if (!info) return filters;

    const Intent = Java.use("android.content.Intent");
    const intent = Intent.$new();
    intent.setComponent(cn);

    let resolveInfos: any;
    if (componentType === "activity") {
      resolveInfos = pm.queryIntentActivities(intent, GET_META_DATA);
    } else if (componentType === "service") {
      resolveInfos = pm.queryIntentServices(intent, GET_META_DATA);
    } else {
      resolveInfos = pm.queryBroadcastReceivers(intent, GET_META_DATA);
    }

    if (resolveInfos) {
      const size = resolveInfos.size();
      for (let i = 0; i < size; i++) {
        const ri = resolveInfos.get(i);
        const f = ri.filter.value;
        if (!f) continue;

        const filter: IntentFilterData = { actions: [], categories: [], data: [] };

        const actionCount = f.countActions();
        for (let j = 0; j < actionCount; j++) {
          filter.actions.push(f.getAction(j).toString());
        }

        const catCount = f.countCategories();
        for (let j = 0; j < catCount; j++) {
          filter.categories.push(f.getCategory(j).toString());
        }

        const dataCount = f.countDataSchemes();
        for (let j = 0; j < dataCount; j++) {
          filter.data.push({ scheme: f.getDataScheme(j).toString() });
        }

        if (filter.actions.length > 0 || filter.categories.length > 0 || filter.data.length > 0) {
          filters.push(filter);
        }
      }
    }
  } catch (_) {}
  return filters;
}

function getManifest(): Promise<ManifestResult> {
  const empty: ManifestResult = {
    platform: "android",
    packageName: "",
    versionName: null,
    versionCode: 0,
    permissions: [],
    activities: [],
    services: [],
    receivers: [],
    providers: [],
  };

  return withJava(empty, (resolve) => {
    const ctx = Java.use("android.app.ActivityThread")
      .currentApplication()
      .getApplicationContext();
    const pm = ctx.getPackageManager();
    const packageName = ctx.getPackageName();

    const flags = GET_ACTIVITIES | GET_SERVICES | GET_RECEIVERS | GET_PROVIDERS | GET_PERMISSIONS | GET_META_DATA | MATCH_DISABLED_COMPONENTS;
    const info = pm.getPackageInfo(packageName, flags);

    const result: ManifestResult = {
      platform: "android",
      packageName: packageName.toString(),
      versionName: info.versionName?.value ? String(info.versionName.value) : null,
      versionCode: info.versionCode?.value ?? 0,
      permissions: [],
      activities: [],
      services: [],
      receivers: [],
      providers: [],
    };

    const reqPerms = info.requestedPermissions?.value;
    if (reqPerms) {
      for (let i = 0; i < reqPerms.length; i++) {
        result.permissions.push(String(reqPerms[i]));
      }
    }

    const activities = info.activities?.value;
    if (activities) {
      for (let i = 0; i < activities.length; i++) {
        const a = activities[i];
        const name = String(a.name.value);
        const exported = !!a.exported?.value;
        const perm = a.permission?.value ? String(a.permission.value) : null;
        const launchModeInt = a.launchMode?.value ?? 0;
        const launchMode = LAUNCH_MODES[launchModeInt] ?? `mode_${launchModeInt}`;
        const intentFilters = extractIntentFilters(pm, result.packageName, name, "activity");
        result.activities.push({ name, exported, permission: perm, launchMode, intentFilters });
      }
    }

    const services = info.services?.value;
    if (services) {
      for (let i = 0; i < services.length; i++) {
        const s = services[i];
        const name = String(s.name.value);
        const exported = !!s.exported?.value;
        const perm = s.permission?.value ? String(s.permission.value) : null;
        const intentFilters = extractIntentFilters(pm, result.packageName, name, "service");
        result.services.push({ name, exported, permission: perm, intentFilters });
      }
    }

    const receivers = info.receivers?.value;
    if (receivers) {
      for (let i = 0; i < receivers.length; i++) {
        const r = receivers[i];
        const name = String(r.name.value);
        const exported = !!r.exported?.value;
        const perm = r.permission?.value ? String(r.permission.value) : null;
        const intentFilters = extractIntentFilters(pm, result.packageName, name, "receiver");
        result.receivers.push({ name, exported, permission: perm, intentFilters });
      }
    }

    const providers = info.providers?.value;
    if (providers) {
      for (let i = 0; i < providers.length; i++) {
        const p = providers[i];
        const name = String(p.name.value);
        const exported = !!p.exported?.value;
        const perm = p.permission?.value ? String(p.permission.value) : null;
        const auth = p.authority?.value ? String(p.authority.value) : "";
        const rPerm = p.readPermission?.value ? String(p.readPermission.value) : null;
        const wPerm = p.writePermission?.value ? String(p.writePermission.value) : null;
        const grantUri = !!p.grantUriPermissions?.value;
        result.providers.push({
          name,
          exported,
          permission: perm,
          intentFilters: [],
          authorities: auth,
          readPermission: rPerm,
          writePermission: wPerm,
          grantUriPermissions: grantUri,
        });
      }
    }

    resolve(result);
  });
}

interface IntentResultData {
  success: boolean;
  result?: string;
  error?: string;
}

function launchIntent(params: unknown): Promise<IntentResultData> {
  const p = params as IntentParams;
  const fallback: IntentResultData = { success: false, error: "Java not available" };

  return withJava(fallback, (resolve) => {
    try {
      const ctx = Java.use("android.app.ActivityThread")
        .currentApplication()
        .getApplicationContext();
      const Intent = Java.use("android.content.Intent");
      const ComponentName = Java.use("android.content.ComponentName");

      const intent = Intent.$new();
      intent.setComponent(ComponentName.$new(ctx.getPackageName(), p.component));

      if (p.action) intent.setAction(p.action);

      if (p.data) {
        const Uri = Java.use("android.net.Uri");
        intent.setData(Uri.parse(p.data));
      }

      if (p.categories) {
        for (const cat of p.categories) {
          intent.addCategory(cat);
        }
      }

      if (p.flags) {
        intent.setFlags(p.flags);
      }

      if (p.extras) {
        for (const [key, entry] of Object.entries(p.extras)) {
          const { type, value } = entry;
          switch (type) {
            case "string":
              intent.putExtra(key, Java.use("java.lang.String").$new(String(value)));
              break;
            case "int":
              intent.putExtra(key, Java.use("java.lang.Integer").$new(Number(value)));
              break;
            case "boolean":
              intent.putExtra(key, Java.use("java.lang.Boolean").$new(!!value));
              break;
            case "float":
              intent.putExtra(key, Java.use("java.lang.Float").$new(Number(value)));
              break;
            case "long":
              intent.putExtra(key, Java.use("java.lang.Long").$new(Number(value)));
              break;
            case "double":
              intent.putExtra(key, Java.use("java.lang.Double").$new(Number(value)));
              break;
            default:
              intent.putExtra(key, Java.use("java.lang.String").$new(String(value)));
              break;
          }
        }
      }

      switch (p.type) {
        case "activity":
          intent.addFlags(0x10000000); // FLAG_ACTIVITY_NEW_TASK
          ctx.startActivity(intent);
          resolve({ success: true, result: "activity started" });
          break;
        case "service":
          ctx.startService(intent);
          resolve({ success: true, result: "service started" });
          break;
        case "broadcast":
          ctx.sendBroadcast(intent);
          resolve({ success: true, result: "broadcast sent" });
          break;
        default:
          resolve({ success: false, error: `unknown component type: ${p.type}` });
      }
    } catch (e: any) {
      resolve({ success: false, error: String(e.message ?? e) });
    }
  });
}

const manifest: AgentModule = { getManifest, launchIntent };
export default manifest;
