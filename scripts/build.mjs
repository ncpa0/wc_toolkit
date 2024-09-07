import { build } from "@ncpa0cpl/nodepack";
import path from "node:path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const p = (...fpath) => path.resolve(__dirname, "..", ...fpath);

const isDev = process.argv.includes("--dev");
const watch = process.argv.includes("--watch");

async function main() {
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
      minify: !isDev,
      sourcemap: isDev ? "inline" : false,
    },
  };

  await build(bldOptions);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
