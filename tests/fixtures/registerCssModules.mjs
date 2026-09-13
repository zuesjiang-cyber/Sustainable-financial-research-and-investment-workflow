/** Preload: `node --import ./tests/fixtures/registerCssModules.mjs ...` */
import { register } from "node:module";

register("./cssModuleLoader.mjs", import.meta.url);
