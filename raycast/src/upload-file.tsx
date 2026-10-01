import {
  Action,
  ActionPanel,
  Clipboard,
  Detail,
  Form,
  getPreferenceValues,
  openExtensionPreferences,
  showToast,
  Toast,
} from "@raycast/api";
import { useRef, useState } from "react";
import { saveUpload } from "./history";
import { Upload, UploadPreferences, uploadFile } from "./uploader";

export default function Command() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<Upload>();
  const lock = useRef(false);
  async function submit(values: { files: string[] }) {
    if (lock.current) return;
    if (values.files.length !== 1) {
      setError("Choose one file to upload.");
      return;
    }
    lock.current = true;
    setBusy(true);
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Uploading file…",
    });
    try {
      const upload = await uploadFile(
        values.files[0],
        getPreferenceValues<UploadPreferences>(),
      );
      setResult(upload);
      // A clipboard/history failure must not conceal an already completed upload.
      const outcomes = await Promise.allSettled([
        saveUpload(upload),
        Clipboard.copy(upload.url),
      ]);
      toast.style = Toast.Style.Success;
      toast.title = outcomes.every((item) => item.status === "fulfilled")
        ? "Uploaded — link copied"
        : "Uploaded — link available below";
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Could not upload";
      toast.message = error instanceof Error ? error.message : "Please retry.";
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (result)
    return (
      <Detail
        markdown={`# File uploaded\n\nYour public share link:\n\n${result.url}`}
        actions={
          <ActionPanel>
            <Action.CopyToClipboard title="Copy Link" content={result.url} />
            <Action.CopyToClipboard
              title="Copy Markdown Link"
              content={`[${result.name.replace(/[[\]\\]/g, "\\$&")}](${result.url})`}
            />
            <Action.OpenInBrowser url={result.url} />
            <Action
              title="Upload Another File"
              onAction={() => setResult(undefined)}
            />
          </ActionPanel>
        }
      />
    );
  return (
    <Form
      isLoading={busy}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Upload and Copy Link" onSubmit={submit} />
          <Action
            title="Open Preferences"
            onAction={openExtensionPreferences}
          />
        </ActionPanel>
      }
    >
      <Form.Description
        title="Public sharing"
        text="Uploads go to the Cloudflare bucket configured in your preferences. Anyone with the link can access the uploaded file. Each upload gets a unique link and does not replace existing files."
      />
      <Form.FilePicker
        id="files"
        title="File"
        allowMultipleSelection={false}
        canChooseDirectories={false}
        error={error}
        onChange={() => setError(undefined)}
      />
    </Form>
  );
}
