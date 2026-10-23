module.exports = {
  // Files and folders that must not end up in the zip
  ignoreFiles: [
    "preview-pictures",
    "AMO-listing.md",
    "README.md",
    "LICENSE",
    ".github",
    ".gitignore",
    "web-ext-config.cjs",
  ],
  build: {
    overwriteDest: true,
  },
};
