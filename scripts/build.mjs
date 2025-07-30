import { build } from "@ncpa0cpl/nodepack";
import { exec as execCb } from "node:child_process";
import path from "node:path";
import util from "node:util";
import { fileURLToPath } from "url";

const exec = util.promisify(execCb);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const p = (...fpath) => path.resolve(__dirname, "..", ...fpath);

const isDev = process.argv.includes("--dev");
const watch = process.argv.includes("--watch");
const clean = process.argv.includes("--clean");

async function main() {
  if (clean) {
    await exec("rm -rf ./dist");
  }

  /**
   * @type {import("@ncpa0cpl/nodepack").BuildConfig}
   */
  const bldOptions = {
    tsConfig: p("tsconfig.json"),
    srcDir: p("src"),
    outDir: p("dist"),
    target: "ESNext",
    formats: ["esm", "legacy"],
    declarations: true,
    watch: watch,
    esbuildOptions: {
      minify: false,
      sourcemap: isDev ? "inline" : false,
    },
  };

  await build(bldOptions);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
