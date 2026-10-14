import { LocalStorage } from "@raycast/api";
import { Upload } from "./uploader";
const KEY = "recent-uploads";
export async function getHistory(): Promise<Upload[]> {
  const value = await LocalStorage.getItem<string>(KEY);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter(
          (item) =>
            typeof item?.url === "string" &&
            typeof item?.name === "string" &&
            typeof item?.id === "string",
        )
      : [];
  } catch {
    return [];
  }
}
export async function saveUpload(upload: Upload): Promise<void> {
  await LocalStorage.setItem(
    KEY,
    JSON.stringify([upload, ...(await getHistory())].slice(0, 100)),
  );
}
export async function clearHistory(): Promise<void> {
  await LocalStorage.removeItem(KEY);
}
