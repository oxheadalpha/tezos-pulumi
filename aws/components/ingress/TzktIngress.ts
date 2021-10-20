import * as pulumi from "@pulumi/pulumi"
import * as k8s from "@pulumi/kubernetes"

import { getIngressResourceArgs } from "./alb"
import { AlbIngressArgs } from "./types"

/** Create a Tzkt ingress to expose your Tzkt indexers' endpoint. A load
 * balancer will be created via the aws-alb-load-balancer controller. TLS
 * certificates for ALB Listeners can be automatically discovered with hostnames
 * from Ingress resources. The controller will attempt to discover TLS
 * certificates from the tls field in Ingress and host field in Ingress rules.
 * https://kubernetes-sigs.github.io/aws-load-balancer-controller/v2.2/guide/ingress/cert_discovery/
 * */
export default class TzktIngress extends pulumi.ComponentResource {
  /** args with filled in default values */
  readonly args: AlbIngressArgs
  /** The tzkt ingress */
  readonly ingress: k8s.networking.v1.Ingress

  /**
   * Create an RpcIngress resource with the given unique name, arguments, and options.
   *
   * @param name The _unique_ name of the resource.
   * @param args The arguments to use to populate this resource's properties.
   * @param opts A bag of options that control this resource's behavior.
   */
  constructor(
    name: string,
    args: AlbIngressArgs,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super("tezos-aws:ingress:TzktIngress", name, args, opts)

    const port = 5000
    const healthcheck = {
      healthcheckPath: "/v1/blocks/count",
      healthcheckPort: String(port),
    }

    const { ingressResourceArgs, filledInArgs } = getIngressResourceArgs(
      name,
      args,
      {
        ingressServiceBackend: {
          name: "tzkt-indexer",
          port: { number: port },
        },
        ...healthcheck,
      }
    )

    this.args = filledInArgs
    this.ingress = new k8s.networking.v1.Ingress(name, ingressResourceArgs, {
      parent: this,
    })

    this.registerOutputs({
      loadBalancerOutput: this.ingress.status.loadBalancer.ingress,
    })
  }
}

