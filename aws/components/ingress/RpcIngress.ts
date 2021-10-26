import * as pulumi from "@pulumi/pulumi"
import * as k8s from "@pulumi/kubernetes"

import {
  AlbIngressArgs,
  fillInArgDefaults,
  getIngressResourceArgs,
} from "./helpers"

/** Create an RPC ingress to expose your Tezos nodes' RPC endpoint. An application load
 * balancer will be created via the aws-alb-load-balancer controller. TLS
 * certificates for ALB Listeners can be automatically discovered with hostnames
 * from Ingress resources. The controller will attempt to discover TLS
 * certificates from the `tls` field in Ingress and `host` field in Ingress rules.
 * https://kubernetes-sigs.github.io/aws-load-balancer-controller/v2.2/guide/ingress/cert_discovery/
 * */
export default class RpcIngress extends pulumi.ComponentResource {
  /** args with filled in default values */
  readonly args: AlbIngressArgs
  /** The rpc ingress */
  readonly ingress: k8s.networking.v1.Ingress

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
    args: AlbIngressArgs,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super("tezos-aws:ingress:RpcIngress", name, args, opts)

    const port = 8732
    const internalArgs = {
      ingressServiceBackend: {
        name: "tezos-node-rpc",
        port: { number: port },
      },
      healthcheckPath: "/chains/main/blocks/head/header",
      healthcheckPort: String(port),
    }

    const filledInArgs = fillInArgDefaults(args, internalArgs)
    const ingressResourceArgs = getIngressResourceArgs(
      name,
      filledInArgs,
      internalArgs
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
