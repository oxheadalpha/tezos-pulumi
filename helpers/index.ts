import { readFileSync } from "fs"
import * as pulumi from "@pulumi/pulumi"
import * as YAML from "yaml"
import merge from "ts-deepmerge"

 /**
  * Checks if `value` is object-like. A value is object-like if it's not `null`
  * and has a `typeof` result of "object".
*/
export const isObjectLike = (value: unknown) =>
  value !== null && typeof value === "object"

export const getEnvVar = (name: string): string => {
  const env = process.env[name]
  if (!env) {
    throw Error(`Environment variable "${name}" is not set`)
  }
  return env
}

export const parseYamlFile = (
  filePath: string,
  options: YAML.Options = { schema: "json" }
) => {
  try {
    const yamlFile = readFileSync(filePath, "utf8")
    return YAML.parse(yamlFile, options)
  } catch (e) {
    if (e instanceof Error) {
      throw new pulumi.ResourceError(
        `Failed to parse ${filePath}: ${e.stack}`,
        this
      )
    }
    throw e
  }
}

export const mergeWithArrayOverrideOption = (valuesList: Array<object>) =>
  merge.withOptions({ mergeArrays: false }, ...valuesList)

/**
 * Use to ignore properties when updating a resource.
 * - https://www.pulumi.com/docs/intro/concepts/resources/#ignorechanges
 */
export const ignoreChangesTransformation = (
  resource: pulumi.ResourceTransformationArgs,
  ignorePropertyNames: string[]
): pulumi.ResourceTransformationResult => ({
  props: resource.props,
  opts: pulumi.mergeOptions(resource.opts, {
    ignoreChanges: ignorePropertyNames,
  }),
})
