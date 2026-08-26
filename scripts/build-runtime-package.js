const fs = require("fs");
const path = require("path");
const { nodeFileTrace } = require("next/dist/compiled/@vercel/nft");

const root = path.resolve(__dirname, "..");
const nextRoot = path.join(root, ".next");
const targetArg = process.argv[2];

if (!targetArg) {
  throw new Error("Usage: node scripts/build-runtime-package.js <empty-output-directory>");
}

const target = path.resolve(targetArg);
if (target === root || target.startsWith(`${root}${path.sep}`)) {
  throw new Error("The runtime package must be created outside the repository");
}
if (fs.existsSync(target)) {
  throw new Error(`Refusing to overwrite existing path: ${target}`);
}
if (!fs.existsSync(path.join(nextRoot, "BUILD_ID"))) {
  throw new Error("Missing production Next.js build; run npm run build:frontend first");
}

function copy(relativePath) {
  const source = path.join(root, relativePath);
  if (!fs.existsSync(source)) return;

  const destination = path.join(target, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true, dereference: true });
}

function copyNextBuild() {
  fs.cpSync(nextRoot, path.join(target, ".next"), {
    recursive: true,
    dereference: true,
    filter(source) {
      const relative = path.relative(nextRoot, source);
      return !(
        relative === "cache" ||
        relative.startsWith(`cache${path.sep}`) ||
        relative === "standalone" ||
        relative.startsWith(`standalone${path.sep}`)
      );
    },
  });
}

function directorySize(directory) {
  let total = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    total += entry.isDirectory() ? directorySize(entryPath) : fs.statSync(entryPath).size;
  }
  return total;
}

async function main() {
  const trace = await nodeFileTrace(["app.js"], {
    base: root,
    processCwd: root,
    mixedModules: true,
  });

  fs.mkdirSync(target, { recursive: true });

  for (const relativePath of trace.fileList) {
    if (path.isAbsolute(relativePath) || relativePath.startsWith(`..${path.sep}`)) {
      throw new Error(`Runtime trace escaped the repository: ${relativePath}`);
    }
    copy(relativePath);
  }

  // These directories are read by name at runtime and therefore cannot all be
  // discovered by static import tracing.
  copy("node_modules/next/dist/compiled/webpack");
  copy("node_modules/next/dist/compiled/@babel/runtime");
  copy("node_modules/@next/swc-linux-x64-gnu");
  // A custom Next server checks for this directory even though all routes are
  // already compiled into .next. A marker keeps the directory in ZIP deploys;
  // an empty directory can disappear while Azure packages/extracts the app.
  fs.mkdirSync(path.join(target, "app"), { recursive: true });
  fs.writeFileSync(
    path.join(target, "app", "runtime-placeholder.txt"),
    "Compiled Next.js routes are stored in .next.\n",
  );
  copy("public");
  copy("site-content");
  copy(".deployment");
  copy(".release-sha");
  copy("next.config.ts");
  copyNextBuild();

  const forbidden = [
    ".git",
    ".next/cache",
    ".next/standalone",
    "node_modules.tar.gz",
    "oryx-manifest.toml",
    "scripts",
  ];
  for (const relativePath of forbidden) {
    if (fs.existsSync(path.join(target, relativePath))) {
      throw new Error(`Unexpected deployment content: ${relativePath}`);
    }
  }

  const megabytes = directorySize(target) / 1024 / 1024;
  console.log(`Runtime package: ${trace.fileList.size} traced files, ${megabytes.toFixed(1)} MB`);
  if (trace.warnings.size > 0) {
    console.log(`Runtime trace completed with ${trace.warnings.size} optional/dynamic import warnings`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
