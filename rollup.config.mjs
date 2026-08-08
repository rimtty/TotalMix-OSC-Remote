import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

const sdPlugin = "com.rimtty.totalmix-osc-remote.sdPlugin";

/** @type {import('rollup').RollupOptions} */
export default {
  input: "src/plugin.ts",
  output: {
    file: `${sdPlugin}/bin/plugin.mjs`,
    format: "es",
    sourcemap: true,
  },
  external: [/^node:/, "bufferutil", "utf-8-validate"],
  plugins: [
    typescript({ noEmit: false, sourceMap: true, mapRoot: "." }),
    nodeResolve({ preferBuiltins: true, browser: false, exportConditions: ["node"] }),
    commonjs(),
  ],
  onwarn(warning, warn) {
    // ws の optional native deps 由来の警告は無視
    if (warning.code === "UNRESOLVED_IMPORT") return;
    warn(warning);
  },
};
