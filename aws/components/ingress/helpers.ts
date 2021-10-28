import * as pulumi from "@pulumi/pulumi"
import * as k8s from "@pulumi/kubernetes"
import merge from "ts-deepmerge"

import * as k8sInputTypes from "@pulumi/kubernetes/types/input"
import { PulumiSkipAwait } from "customTypes/pulumi"

/** Describes the arguments for an ingress that will be exposed by an
 * application load balancer.
 *
 * Configuring https for the ingress is determined based on if the user passed a
 * `hostname` for the ingress rule, passed a `tls` config, or set the alb
 * `certificate-arn` annotation.
 * https://kubernetes-sigs.github.io/aws-load-balancer-controller/v2.2/guide/ingress/annotations/#ssl
 * */
export interface AlbIngressArgs {
  /** `metadata.annotations` defaults to:
   * ```
   * "kubernetes.io/ingress.class": "alb",
   * "alb.ingress.kubernetes.io/scheme": args.loadBalancerScheme!,
   * "alb.ingress.kubernetes.io/healthcheck-path": internalArgs.healthcheckPath,
   * "alb.ingress.kubernetes.io/healthcheck-port": internalArgs.healthcheckPort,
   * "alb.ingress.kubernetes.io/listen-ports": '[{"HTTP": 80}]',
    // Prevent pulumi erroring if ingress doesn't resolve immediately
    "pulumi.com/skipAwait": String(args.skipAwait),
    ```
    If https will be enabled then also:
    ```
    * "alb.ingress.kubernetes.io/listen-ports": '[{"HTTP": 80}, {"HTTPS":443}]',
    * "ingress.kubernetes.io/force-ssl-redirect": "true",
    * "alb.ingress.kubernetes.io/actions.ssl-redirect":
    *   '{"Type": "redirect", "RedirectConfig": { "Protocol": "HTTPS" "Port": "443", "StatusCode": "HTTP_301"}}',
    * ```
   */
  metadata?: k8sInputTypes.meta.v1.ObjectMeta
  /** Prevent pulumi from waiting for the ingress to resolve. Pulumi will error
   * if it doesn't resolve immediately.
   * https://www.pulumi.com/blog/improving-kubernetes-management-with-pulumis-await-logic/
   * */
  skipAwait?: PulumiSkipAwait
  /** Defaults to "internet-facing".
   * https://kubernetes-sigs.github.io/aws-load-balancer-controller/v2.2/guide/ingress/annotations/#scheme
   * */
  loadBalancerScheme?: string
  /** https://kubernetes-sigs.github.io/aws-load-balancer-controller/v2.2/guide/ingress/cert_discovery/#discover-via-ingress-rule-host */
  host?: k8sInputTypes.networking.v1.IngressRule["host"]
  /** https://kubernetes-sigs.github.io/aws-load-balancer-controller/v2.2/guide/ingress/cert_discovery/#discover-via-ingress-tls */
  tls?: k8sInputTypes.networking.v1.IngressTLS[]
}

/** Describes private internal args used by our ingress components to construct
 * their custom configs. Example being our ingress component specifying its
 * ingress backend service. The healthcheck args can be overwritten by a user
 * specifying `metadata.annotations` */
interface InternalAlbIngressArgs {
  ingressServiceBackend: k8sInputTypes.networking.v1.IngressServiceBackend
  /** https://kubernetes-sigs.github.io/aws-load-balancer-controller/v2.2/guide/ingress/annotations/#healthcheck-path */
  healthcheckPath: string
  /** https://kubernetes-sigs.github.io/aws-load-balancer-controller/v2.2/guide/ingress/annotations/#healthcheck-port */
  healthcheckPort: string
}

/**
 * Determine that https should enabled based on if the user passed a `hostname`
 * for the ingress rule, passed a `tls` config, or set the alb `certificate-arn`
 * annotation.
 * https://kubernetes-sigs.github.io/aws-load-balancer-controller/v2.2/guide/ingress/annotations/#ssl
 */
const shouldEnableHttps = (userInputArgs: AlbIngressArgs) =>
  userInputArgs.host ||
  userInputArgs?.tls?.length ||
  userInputArgs.metadata?.annotations?.[
    "alb.ingress.kubernetes.io/certificate-arn" as keyof pulumi.Input<
      Record<string, string>
    >
  ]

const getAnnotations = (
  args: AlbIngressArgs,
  internalArgs: InternalAlbIngressArgs
) => {
  const defaultAnnotations: Record<string, string> = {
    "kubernetes.io/ingress.class": "alb",
    "alb.ingress.kubernetes.io/scheme": args.loadBalancerScheme!,
    "alb.ingress.kubernetes.io/healthcheck-path": internalArgs.healthcheckPath,
    "alb.ingress.kubernetes.io/healthcheck-port": internalArgs.healthcheckPort,
    "alb.ingress.kubernetes.io/listen-ports": '[{"HTTP": 80}]',
    // Prevent pulumi erroring if ingress doesn't resolve immediately
    "pulumi.com/skipAwait": String(args.skipAwait),
  }

  if (shouldEnableHttps(args)) {
    defaultAnnotations["alb.ingress.kubernetes.io/listen-ports"] =
      '[{"HTTP": 80}, {"HTTPS":443}]'
    defaultAnnotations["ingress.kubernetes.io/force-ssl-redirect"] = "true"
    defaultAnnotations["alb.ingress.kubernetes.io/actions.ssl-redirect"] =
      '{"Type": "redirect", "RedirectConfig": { "Protocol": "HTTPS", "Port": "443", "StatusCode": "HTTP_301"}}'
  }

  return {
    ...defaultAnnotations,
    ...args?.metadata?.annotations,
  }
}

const getIngressPaths = (
  args: AlbIngressArgs,
  internalArgs: InternalAlbIngressArgs
): k8s.types.input.networking.v1.HTTPIngressPath[] => {
  const paths = [
    {
      path: "/*",
      pathType: "Prefix",
      backend: {
        service: internalArgs.ingressServiceBackend,
      },
    },
  ]

  if (shouldEnableHttps(args)) {
    paths.unshift({
      path: "/*",
      pathType: "Prefix",
      backend: {
        service: {
          name: "ssl-redirect",
          port: { name: "use-annotation" },
        },
      },
    })
  }

  return paths
}

export const fillInArgDefaults = (
  userInputArgs: AlbIngressArgs,
  internalArgs: InternalAlbIngressArgs
): AlbIngressArgs => {
  const filledInArgs: AlbIngressArgs = {
    ...userInputArgs,
    loadBalancerScheme: userInputArgs.loadBalancerScheme || "internet-facing",
    skipAwait: userInputArgs.skipAwait === false ? false : true,
  }

  const annotations = getAnnotations(filledInArgs, internalArgs)
  return merge(filledInArgs, { metadata: annotations })
}

export const getIngressResourceArgs = (
  name: string,
  args: AlbIngressArgs,
  internalArgs: InternalAlbIngressArgs
): k8s.networking.v1.IngressArgs => {
  if (args.skipAwait) {
    pulumi.log.info(`
        ${name}: Pulumi will not wait for the ingress to be ready. This is because
        it has an external dependency on the AWS load balancer controller Helm chart and can't know
        when the controller is ready. Pulumi errors out if the ingress retries to resolve.
        If you want, you can turn this setting of by setting the skipAwait arg to false.`)
  }

  const ingressPaths = getIngressPaths(args, internalArgs)
  const ingressResourceArgs: k8s.networking.v1.IngressArgs = {
    metadata: args.metadata,
    spec: {
      tls: args.tls,
      rules: [
        {
          host: args.host,
          http: {
            paths: ingressPaths,
          },
        },
      ],
    },
  }

  return ingressResourceArgs
}
