// Workaround for making absolute import paths work
// https://github.com/pulumi/pulumi/issues/3061
import { register, loadConfig } from "tsconfig-paths"
const config = loadConfig(".")
if (config.resultType === "failed") {
  console.log("Could not load tsconfig to map paths, aborting.")
  process.exit(1)
}

register({
  baseUrl: config.absoluteBaseUrl,
  paths: config.paths,
})

import * as aws from "./aws"

export { aws }
export * from "./components"
export { PulumiSkipAwait } from "./customTypes"
