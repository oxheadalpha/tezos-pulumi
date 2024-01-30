import { readFileSync } from "fs"
import * as pulumi from "@pulumi/pulumi"
import * as YAML from "yaml"
import { merge } from "ts-deepmerge"

import * as ParseOptions from "yaml/dist/options"

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

export const parseYamlFile = ({
  file,
  resource,
  options,
}: {
  file: string
  resource?: pulumi.Resource
  options?: typeof ParseOptions
}) => {
  try {
    const yamlFile = readFileSync(file, "utf8")
    return YAML.parse(yamlFile, options)
  } catch (e) {
    if (e instanceof Error) {
      throw new pulumi.ResourceError(
        `Failed to parse ${file}: ${e.stack}`,
        resource
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
