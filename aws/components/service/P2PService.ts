import * as pulumi from "@pulumi/pulumi"
import * as k8s from "@pulumi/kubernetes"
import merge from "ts-deepmerge"
import { mergeWithArrayOverrideOption } from "helpers"

import * as k8sInputTypes from "@pulumi/kubernetes/types/input"
import { AugmentedRequired, PulumiSkipAwait } from "customTypes"

/** Make `spec.selector` required. User must select labels of pods to forward
 * traffic to. */
type CustomeServiceSpec = AugmentedRequired<
  k8sInputTypes.core.v1.ServiceSpec,
  "selector"
>

/** Describes the arguments for a service that will be exposed by a network load
 * balancer. */
export interface NlbServiceArgs {
  /**
   * `metadata.annotations` defaults to:
   * ```
   * "service.beta.kubernetes.io/aws-load-balancer-type": "nlb-ip",
   *  "service.beta.kubernetes.io/aws-load-balancer-scheme":
   *    args.loadBalancerScheme || "internet-facing",
   *  "external-dns.alpha.kubernetes.io/hostname":
   *    args.hostname || "",
   *  "pulumi.com/skipAwait":
   *    args.skipAwait === false ? "false" : "true",
    ```
   */
  metadata?: k8sInputTypes.meta.v1.ObjectMeta
  /**
   * ServiceSpec describes the attributes that a user creates on a service. The
   * default service spec sets `ports` to `9732` and sets `type` to
   * `LoadBalancer`.
   *
   * You must provide labels to the `selector` field to
   * configure which pods to forward traffic to.
   */
  spec: CustomeServiceSpec
  /** Prevent pulumi from timing out waiting for the resource to be marked as
   * ready. This is useful for when starting up a Tezos node that will take time
   * to sync with the head of the chain. The node's pod will not be marked ready
   * until then. Defaults to true. */
  skipAwait?: PulumiSkipAwait
  /** Defaults to "internet-facing".
   * https://kubernetes-sigs.github.io/aws-load-balancer-controller/v2.2/guide/service/annotations/#lb-scheme
   * */
  loadBalancerScheme?: string
  /** The name of the DNS record to be created by external-dns.
   * https://github.com/kubernetes-sigs/external-dns/blob/master/docs/faq.md#how-do-i-specify-a-dns-name-for-my-kubernetes-objects
   * */
  hostname?: pulumi.Input<string>
}

/** Create a P2P service to expose your Tezos nodes' P2P endpoint. A network
 * load balancer will be created via the aws-alb-load-balancer controller. The
 * default port of the service is 9732.
 * https://kubernetes-sigs.github.io/aws-load-balancer-controller/v2.2/guide/service/nlb/
 * */
export class P2PService extends pulumi.ComponentResource {
  /** args with filled in default values */
  readonly args: NlbServiceArgs
  /** The p2p service */
  readonly service: k8s.core.v1.Service

  /**
   * Create an RpcIngress resource with the given unique name, arguments, and options.
   *
   * @param name The _unique_ name of the resource.
   * @param args The arguments to use to populate this resource's properties.
   * Defaults will be filled in by the component.
   * @param opts A bag of options that control this resource's behavior.
   */
  constructor(
    name: string,
    args: NlbServiceArgs,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super("tezos-aws:service:P2PService", name, args, opts)

    const metadata: NlbServiceArgs["metadata"] = merge(
      {
        annotations: {
          "service.beta.kubernetes.io/aws-load-balancer-type": "nlb-ip",
          "service.beta.kubernetes.io/aws-load-balancer-scheme":
            args.loadBalancerScheme || "internet-facing",
          "external-dns.alpha.kubernetes.io/hostname": args.hostname || "",
          "pulumi.com/skipAwait": args.skipAwait === false ? "false" : "true",
        },
      },
      args.metadata || {}
    )

    this.args = args
    this.service = new k8s.core.v1.Service(
      name,
      {
        metadata,
        spec: mergeWithArrayOverrideOption([
          {
            ports: [
              {
                port: 9732,
                targetPort: 9732,
                protocol: "TCP",
              },
            ],
            type: "LoadBalancer",
          },
          args.spec,
        ]),
      },
      {
        parent: this,
      }
    )

    this.registerOutputs({
      loadBalancerOutput: this.service.status.loadBalancer.ingress,
    })
  }
}
