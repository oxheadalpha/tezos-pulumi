import * as k8s from "@pulumi/kubernetes"
import * as k8sInputTypes from "@pulumi/kubernetes/types/input"


export interface BaseIngressParams {
  metadata: k8sInputTypes.meta.v1.ObjectMeta
  /** Prevent pulumi erroring if ingress doesn't resolve immediately */
  pulumiSkipAwait?: boolean
}

export interface AlbIngressArgs extends BaseIngressParams {
  /** https://kubernetes-sigs.github.io/aws-load-balancer-controller/v2.2/guide/ingress/annotations/#scheme */
  albScheme?: string
  /** https://kubernetes-sigs.github.io/aws-load-balancer-controller/v2.2/guide/ingress/cert_discovery/#discover-via-ingress-rule-host */
  host?: k8sInputTypes.networking.v1.IngressRule["host"]
  /** https://kubernetes-sigs.github.io/aws-load-balancer-controller/v2.2/guide/ingress/cert_discovery/#discover-via-ingress-tls */
  tls?: k8sInputTypes.networking.v1.IngressTLS[]
}

export interface InternalAlbIngressArgs {
  ingressServiceBackend: k8sInputTypes.networking.v1.IngressServiceBackend
  /** https://kubernetes-sigs.github.io/aws-load-balancer-controller/v2.2/guide/ingress/annotations/#healthcheck-path */
  healthcheckPath: string
  /** https://kubernetes-sigs.github.io/aws-load-balancer-controller/v2.2/guide/ingress/annotations/#healthcheck-port */
  healthcheckPort: string
}
