import * as pulumi from "@pulumi/pulumi"
import * as k8s from "@pulumi/kubernetes"

import {
  isObjectLike,
  mergeWithArrayOverrideOption,
  parseYamlFile,
} from "helpers"

import { ChartOpts, LocalChartOpts } from "@pulumi/kubernetes/helm/v3"
import { MergeExclusive } from "customTypes"

/** We hardcode the chart's `config` properties `chart` and `fetchOpts` to
 * install the `tezos-k8s` chart */
type CustomChartOpts = Omit<ChartOpts, "chart" | "fetchOpts">
/** Make that user can't specify both ChartOpts and LocalChartOpts */
type CustomChartConfig = MergeExclusive<CustomChartOpts, LocalChartOpts>
/** Describes the Helm chart config */
export type TezosK8sHelmChartConfig = CustomChartConfig & {
  /**
   * Path to a tezos-k8s Helm chart values file(s). File precedence goes from
   * right to left. Values will be overridden by the `values` property.
   */
  valuesFiles?: string | string[]
}

/** Determine if the `config` is implementing `LocalChartOpts` */
const implementsLocalChartOpts = (
  config: CustomChartConfig
): config is LocalChartOpts => Reflect.has(config, "path")

/**
 * Deploy a `tezos-k8s` Helm chart. By default the remote latest chart is pulled
 * from the chart repo https://oxheadalpha.github.io/tezos-helm-charts. You may
 * specify a chart `version`. A `path` of a local Helm chart may be specified
 * instead of fetching the remote chart. These options are mutually exclusive.
 *
 * Values in the `values.yaml` file can be overridden using the `values` field
 * (equivalent to using Helm's `--set)`. You can also specify the paths of local
 * values.yaml files via the `valuesFiles` field.
 *
 * The instance of the Helm chart will have a `config` property that will have
 * filled in any default values for the `config` arg.
 * - `namespace` for chart resources will default to the `releaseName`
 * - `skipAwait` defaults to `true`
 */
export class TezosK8sHelmChart extends pulumi.ComponentResource {
  readonly config: ChartOpts | LocalChartOpts

  /**
   * Create an instance of the specified Helm chart.
   * @param releaseName The _unique_ name of the Helm chart.
   * @param config Configuration options for the Chart.
   * @param opts A bag of options that control this resource's behavior.
   */
  constructor(
    releaseName: string,
    config: TezosK8sHelmChartConfig,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super("tezos:tezos-k8s-helm-chart:TezosK8sHelmChart", releaseName, {}, opts)

    const {
      namespace = releaseName,
      skipAwait = true,
      values = {},
      valuesFiles = [],
      ...rest
    } = config
    const mergedValues = mergeWithArrayOverrideOption([
      ...this.parseYamlFiles(valuesFiles),
      values,
    ])

    const filledInConfig = mergeWithArrayOverrideOption([
      rest,
      {
        namespace,
        skipAwait,
        values: mergedValues,
      },
    ]) as ChartOpts | LocalChartOpts

    if (!implementsLocalChartOpts(filledInConfig)) {
      // The `chart` and `fetchOpts` props can't be set on `filledInConfig`
      // unless it is casted to `ChartOpts`.
      const configAsChartOpts = filledInConfig as ChartOpts
      configAsChartOpts.chart = "tezos-chain"
      configAsChartOpts.fetchOpts = {
        repo: "https://oxheadalpha.github.io/tezos-helm-charts/",
      }
    }

    this.config = filledInConfig

    new k8s.helm.v3.Chart(releaseName, this.config, {
      parent: this,
    })
  }

  private validateParsedYaml(fileName: string, yaml: any): object {
    if (isObjectLike(yaml)) {
      return yaml
    }
    throw new pulumi.ResourceError(
      `Invalid yaml document ${fileName}: The document must be parsable as a JSON object.`,
      this
    )
  }

  private parseYamlFiles(valuesFiles: string | string[]): object[] {
    const valuesFilesList: string[] = Array.isArray(valuesFiles)
      ? valuesFiles
      : [valuesFiles]

    return valuesFilesList.reduce((yaml: object[], file: string) => {
      const parsedYaml = parseYamlFile(file)
      if (this.validateParsedYaml(file, parsedYaml)) {
        return [...yaml, parsedYaml]
      }
      return yaml
    }, [])
  }
}
