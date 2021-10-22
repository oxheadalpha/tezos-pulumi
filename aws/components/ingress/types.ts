import * as k8sInputTypes from "@pulumi/kubernetes/types/input"

/** Describes the base args for resources like ingresses and services that will
 * be exposed by a load balancer. */
export interface BaseIngressArgs {
  metadata: k8sInputTypes.meta.v1.ObjectMeta
  /** Prevent pulumi erroring if ingress doesn't resolve immediately */
  pulumiSkipAwait?: boolean
}

/** Describes the arguments for an ingress that will be exposed by an
 * application load balancer. */
export interface AlbIngressArgs extends BaseIngressArgs {
  /** Defaults to "internet-facing".
   * https://kubernetes-sigs.github.io/aws-load-balancer-controller/v2.2/guide/ingress/annotations/#scheme
   * */
  albScheme?: string
  /** https://kubernetes-sigs.github.io/aws-load-balancer-controller/v2.2/guide/ingress/cert_discovery/#discover-via-ingress-rule-host */
  host?: k8sInputTypes.networking.v1.IngressRule["host"]
  /** https://kubernetes-sigs.github.io/aws-load-balancer-controller/v2.2/guide/ingress/cert_discovery/#discover-via-ingress-tls */
  tls?: k8sInputTypes.networking.v1.IngressTLS[]
}

/** Describes private internal args used by our ingress components to construct
 * their custom configs. Example being our ingress component specifying its
 * ingress backend service. The healthcheck args can be overwritten by a user
 * specifying `metadata.annotations` */
export interface InternalAlbIngressArgs {
  ingressServiceBackend: k8sInputTypes.networking.v1.IngressServiceBackend
  /** https://kubernetes-sigs.github.io/aws-load-balancer-controller/v2.2/guide/ingress/annotations/#healthcheck-path */
  healthcheckPath: string
  /** https://kubernetes-sigs.github.io/aws-load-balancer-controller/v2.2/guide/ingress/annotations/#healthcheck-port */
  healthcheckPort: string
}
