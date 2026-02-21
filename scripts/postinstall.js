const chalk = require("chalk");
const { execSync } = require("child_process");

console.log(chalk.blue("\n⚡ Quick Share CLI\n"));

// Check if rclone is installed
try {
  const version = execSync("rclone version", { encoding: "utf8" }).split(
    "\n",
  )[0];
  console.log(chalk.green("✓ rclone is installed:"), version);
} catch (e) {
  console.log(chalk.yellow("⚠ rclone is not installed"));
  console.log("Please install rclone to use Quick Share CLI:");
  console.log("  macOS:    brew install rclone");
  console.log("  Linux:    curl https://rclone.org/install.sh | sudo bash");
  console.log("  Windows:  winget install Rclone.Rclone");
  console.log("");
}

console.log(chalk.blue("Usage:"));
console.log("  quick-share setup          # Configure credentials");
console.log("  quick-share <file>         # Upload a file");
console.log("  quick-share upload <file>  # Upload a file (explicit)");
console.log("");
console.log(chalk.gray('Run "quick-share --help" for more information.\n'));
