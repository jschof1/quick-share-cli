import {
  Action,
  ActionPanel,
  confirmAlert,
  Alert,
  Icon,
  List,
  showToast,
  Toast,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { clearHistory, getHistory } from "./history";
import { Upload } from "./uploader";
export default function Command() {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    getHistory()
      .then(setUploads)
      .catch(() =>
        showToast({
          style: Toast.Style.Failure,
          title: "Could not load upload history",
        }),
      )
      .finally(() => setLoading(false));
  }, []);
  async function clear() {
    if (
      await confirmAlert({
        title: "Clear local upload history?",
        message: "Uploaded files and public links will remain in R2.",
        primaryAction: {
          title: "Clear History",
          style: Alert.ActionStyle.Destructive,
        },
      })
    ) {
      try {
        await clearHistory();
        setUploads([]);
      } catch {
        await showToast({
          style: Toast.Style.Failure,
          title: "Could not clear history",
        });
      }
    }
  }
  return (
    <List isLoading={loading} searchBarPlaceholder="Find an uploaded file…">
      <List.EmptyView
        title="No uploads yet"
        description="Use Upload File to share a file. This history includes only uploads from this extension."
        icon={Icon.Upload}
      />
      {uploads.map((upload) => (
        <List.Item
          key={upload.id}
          title={upload.name}
          subtitle={new Date(upload.uploadedAt).toLocaleString()}
          icon={Icon.Document}
          actions={
            <ActionPanel>
              <Action.CopyToClipboard title="Copy Link" content={upload.url} />
              <Action.OpenInBrowser url={upload.url} />
              <Action
                title="Clear Local History"
                style={Action.Style.Destructive}
                onAction={clear}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
