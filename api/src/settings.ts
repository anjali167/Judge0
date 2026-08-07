import { prisma } from "./db.js";

export interface ModuleToggles {
  quiz: boolean;
  mostImproved: boolean;
  discussion: boolean;
}

const DEFAULT_MODULES: ModuleToggles = { quiz: true, mostImproved: true, discussion: true };

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await prisma.instanceSetting.findUnique({ where: { key } });
  return row ? (row.value as T) : fallback;
}

export async function setSetting(key: string, value: unknown) {
  await prisma.instanceSetting.upsert({
    where: { key },
    update: { value: value as object },
    create: { key, value: value as object },
  });
}

export async function getModules(): Promise<ModuleToggles> {
  const v = await getSetting<Partial<ModuleToggles>>("modules", {});
  return { ...DEFAULT_MODULES, ...v };
}

/** Public subset of instance settings (branding + enabled modules). */
export async function getPublicInstanceInfo() {
  return {
    name: await getSetting("instance_name", "Contest Platform"),
    signupMode: await getSetting("signup_mode", "open"),
    modules: await getModules(),
    mostImprovedK: await getSetting("most_improved_k", 3),
  };
}
