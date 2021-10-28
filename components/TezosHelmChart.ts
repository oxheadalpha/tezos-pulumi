import * as pulumi from "@pulumi/pulumi"
import * as k8s from "@pulumi/kubernetes"
import * as eks from "@pulumi/eks"

import { ChartOpts, LocalChartOpts } from "@pulumi/kubernetes/helm/v3"

import {
  isObjectLike,
  mergeWithArrayOverrideOption,
  parseYamlFile,
} from "helpers"
interface TezosHelmChartArgs {
  /** tezos-k8s Helm chart values https://github.com/oxheadalpha/tezos-k8s */
  values?: pulumi.Inputs
  /**
   * Path to a tezos-k8s Helm chart values file(s). File precedence goes from
   * right to left. Values will be overridden by the values property.
   */
  valuesFiles?: string | []
  /** Helm chart version */
  version?: string
  /**
   * The path to the chart directory which contains the `Chart.yaml` file. If
   * specified, the version argument will be ignored.
   */
  localChartPath?: string
  /** Namespace to deploy the chart in */
  namespace: string
  /** Name of the Helm release */
  releaseName: string
}

export default class TezosK8sHelmChart extends pulumi.ComponentResource {
  readonly args: TezosHelmChartArgs
  /** The values passed to the tezos-k8s Helm chart */
  readonly values: object

  constructor(args: TezosHelmChartArgs, opts: pulumi.ComponentResourceOptions) {
    super(
      "tezos:tezos-k8s-helm-chart:TezosK8sHelmChart",
      "tezos-k8s-helm-chart",
      {},
      opts
    )
    this.args = args

    console.dir(this.parseYamlFiles(), { depth: 9 })
    this.values = mergeWithArrayOverrideOption([
      ...this.parseYamlFiles(),
      args.values || {},
    ])
    console.dir(this.values, { depth: 8 })
    const chartOpts: Record<string, any> = {
      namespace: args.namespace,
      values: this.values,
      path: args.localChartPath,
    }

    if (!args.localChartPath) {
      chartOpts.chart = "tezos-chain"
      chartOpts.version = args.version || "5.2.0"
      chartOpts.fetchOpts = {
        repo: "https://oxheadalpha.github.io/tezos-helm-charts/",
      }
    }
    // WHAT IF THERE IS LOCAL CHAT PATh

    new k8s.helm.v3.Chart(
      args.releaseName,
      // {
      // namespace: args.namespace,
      // values: mergeHelmValues([values, {indexers: {tzkt: {api_image: "hello"}}}]),
      // chart: "tezos-chain",
      // fetchOpts: {
      //   repo: "https://oxheadalpha.github.io/tezos-helm-charts/",
      // },
      // version: args.version || "5.2.0",
      // },
      { ...(chartOpts as ChartOpts | LocalChartOpts), skipAwait: true },
      {
        parent: this,
      }
    )
  }

  private validateParsedYaml(fileName: string, yaml: any) {
    if (isObjectLike(yaml)) {
      return true
    }
    throw new pulumi.ResourceError(
      `Invalid yaml document ${fileName}: The document must be parsable as a JSON object.`,
      this
    )
  }

  private parseYamlFiles() {
    const { valuesFiles = [] } = this.args
    const valuesFilesList = Array.isArray(valuesFiles)
      ? valuesFiles
      : [valuesFiles]

    return valuesFilesList
      .map((file) => ({ file, yaml: parseYamlFile(file) }))
      .filter(({ file, yaml }) => this.validateParsedYaml(file, yaml))
  }
}

// create vpc
// create cluster
//   nodes in regions?
// deploy tezosk8s
//   nodes
//   indexer
//   signers

//     node / volume affinity?
// deploy alb controller  (should increase its internal timeout for when its pods move nodes)
// deploy external dns
// create certificates
//   certvalidation
// create faucet ?
// create ingresses
//   rpc
//   p2p
//   indexer
//   faucet?
