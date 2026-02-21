const {
  getMimeType,
  formatFileSize,
  loadConfig,
  saveConfig,
} = require("../lib/upload");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Mock fs for config tests
jest.mock("fs");

describe("getMimeType", () => {
  test("detects image files correctly", () => {
    expect(getMimeType("photo.jpg")).toBe("image/jpeg");
    expect(getMimeType("photo.jpeg")).toBe("image/jpeg");
    expect(getMimeType("photo.png")).toBe("image/png");
    expect(getMimeType("photo.gif")).toBe("image/gif");
    expect(getMimeType("photo.webp")).toBe("image/webp");
    expect(getMimeType("photo.svg")).toBe("image/svg+xml");
  });

  test("detects video files correctly", () => {
    expect(getMimeType("video.mp4")).toBe("video/mp4");
    expect(getMimeType("video.mov")).toBe("video/quicktime");
    expect(getMimeType("video.webm")).toBe("video/webm");
  });

  test("detects document files correctly", () => {
    expect(getMimeType("doc.pdf")).toBe("application/pdf");
    expect(getMimeType("doc.txt")).toBe("text/plain");
    expect(getMimeType("data.json")).toBe("application/json");
  });

  test("returns default for unknown extensions", () => {
    expect(getMimeType("file.unknown")).toBe("application/octet-stream");
    expect(getMimeType("file")).toBe("application/octet-stream");
  });
});

describe("formatFileSize", () => {
  test("formats bytes correctly", () => {
    expect(formatFileSize(0)).toBe("0 Bytes");
    expect(formatFileSize(512)).toBe("512 Bytes");
    expect(formatFileSize(1024)).toBe("1 KB");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(1024 * 1024)).toBe("1 MB");
    expect(formatFileSize(1024 * 1024 * 1024)).toBe("1 GB");
  });
});

describe("config management", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("loadConfig returns null when config does not exist", () => {
    fs.existsSync.mockReturnValue(false);
    const config = loadConfig();
    expect(config).toBeNull();
  });

  test("loadConfig returns parsed config when file exists", () => {
    const mockConfig = {
      accountId: "test-account",
      bucketName: "test-bucket",
    };
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));

    const config = loadConfig();
    expect(config).toEqual(mockConfig);
  });

  test("saveConfig creates directory and writes file", () => {
    fs.existsSync.mockReturnValue(false);
    const config = { accountId: "test" };

    saveConfig(config);

    expect(fs.mkdirSync).toHaveBeenCalled();
    expect(fs.writeFileSync).toHaveBeenCalled();
  });
});
