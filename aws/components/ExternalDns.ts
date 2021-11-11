import * as aws from "@pulumi/aws"
import * as k8s from "@pulumi/kubernetes"
import * as pulumi from "@pulumi/pulumi"

import { RolePolicyAttachmentArgs } from "@pulumi/aws/iam/rolePolicyAttachment"

/**
 * Arguments for the `ExternalDns` component
 */
interface ExternalDnsArgs {
  /** The IAM role to attach the external-dns policy to. */
  iamRole: RolePolicyAttachmentArgs["role"]
  /** Namespace to deploy the chart in. Defaults to kube-system. */
  namespace?: string
  /** A unique id that restricts the external-dns instance from syncing any
   * records it isn't an owner of in a hosted zone. You may use your cluster id.
   * If you have multiple clusters, each cluster should have its own id. You
   * must explicity set this to `null` if you don't want to use it. */
  txtOwnerId: pulumi.Input<string | null>
  /**
   * Values for the external-dns Helm chart.
   * https://artifacthub.io/packages/helm/bitnami/external-dns#parameters.
   */
  values?: pulumi.Inputs
  /** Helm chart version */
  version?: string
  /** List of hosted zone id's. Used for the external-dns IAM policy Action
   * `route53:ChangeResourceRecordSets`, and as the `zoneIdFilters` value for
   * the external-dns Helm chart. Defaults to "hostedzone/*". You must explicity
   * set this to `null` if you don't want to use it.
   */
  zoneIdFilters: pulumi.Input<string>[] | null
}

/**
 * Deploy the external-dns Helm chart including the necessary IAM policy.
 *
 * Chart repo: https://github.com/kubernetes-sigs/external-dns
 *
 * Helm chart:  https://artifacthub.io/packages/helm/bitnami/external-dns
 */
export default class ExteranlDns extends pulumi.ComponentResource {
  /** `args` with filled in default values */
  readonly args: ExternalDnsArgs
  /** The external-dns Helm chart instance */
  readonly chart: k8s.helm.v3.Chart

  constructor(args: ExternalDnsArgs, opts?: pulumi.ComponentResourceOptions) {
    super("tezos-aws:external-dns:ExternalDns", "external-dns", {}, opts)

    this.args = {
      ...args,
      namespace: args.namespace || "kube-system",
      version: args.version,
      values: {
        replicas: 2,
        // Set the owner of the records created.
        txtOwnerId: args.txtOwnerId,
        // Delete route53 records after an ingress or its hosts are deleted.
        policy: "sync",
        // Limit possible target zones by zone id.
        zoneIdFilters: args.zoneIdFilters,
        // Filter for public zones.
        aws: {
          zoneType: "public",
        },
        ...args.values,
      },
    }

    const hostedZoneResources: pulumi.Input<pulumi.Input<string>[]> =
      this.args.zoneIdFilters?.map(
        (zoneId) => pulumi.interpolate`arn:aws:route53:::hostedzone/${zoneId}`
      ) || []

    if (!hostedZoneResources?.length) {
      hostedZoneResources.push(`arn:aws:route53:::hostedzone/*`)
    }

    const externalDnsPolicy = new aws.iam.Policy(
      "external-dns",
      {
        description:
          "Allows k8s external-dns to manage R53 Hosted Zone records.",
        policy: {
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: ["route53:ChangeResourceRecordSets"],
              Resource: hostedZoneResources,
            },
            {
              Effect: "Allow",
              Action: [
                "route53:ListHostedZones",
                "route53:ListResourceRecordSets",
              ],
              Resource: ["*"],
            },
          ],
        },
      },
      { parent: this }
    )

    new aws.iam.RolePolicyAttachment(
      "external-dns",
      {
        policyArn: externalDnsPolicy.arn,
        role: this.args.iamRole,
      },
      { parent: this }
    )

    this.chart = new k8s.helm.v3.Chart(
      "external-dns",
      {
        chart: "external-dns",
        namespace: this.args.namespace,
        version: this.args.version,
        fetchOpts: {
          repo: "https://charts.bitnami.com/bitnami",
        },
        values: this.args.values,
      },
      { parent: this }
    )

    this.registerOutputs()
  }
}
