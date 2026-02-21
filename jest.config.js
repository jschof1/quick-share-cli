module.exports = {
  testEnvironment: "node",
  collectCoverageFrom: ["lib/**/*.js", "!lib/**/*.test.js"],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "html"],
  testMatch: ["**/test/**/*.test.js"],
};
