const os = require("os");
const path = require("path");
const fs = require("fs");

// Clean up config on uninstall (optional - user might want to keep it)
const configDir = path.join(os.homedir(), ".quick-share");

if (fs.existsSync(configDir)) {
  console.log("Note: Configuration files remain at ~/.quick-share/");
  console.log("Remove manually if desired: rm -rf ~/.quick-share/");
}
