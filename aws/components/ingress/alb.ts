import * as pulumi from "@pulumi/pulumi"
import * as k8s from "@pulumi/kubernetes"

import { AlbIngressArgs, InternalAlbIngressArgs } from "./types"

/**
 * Determine that https should enabled based on if the user passed a hostname
 * for the ingress rule, passed a tls config, or set the alb certificate-arn
 * annotation.
 * https://kubernetes-sigs.github.io/aws-load-balancer-controller/v2.2/guide/ingress/annotations/#ssl
 */
const shouldEnableHttps = (userInputArgs: AlbIngressArgs) =>
  userInputArgs.host ||
  userInputArgs?.tls?.length ||
  userInputArgs.metadata?.annotations?.[
    "alb.ingress.kubernetes.io/certificate-arn" as keyof AlbIngressArgs["metadata"]["annotations"]
  ]

const getAnnotations = (
  args: AlbIngressArgs,
  internalArgs: InternalAlbIngressArgs
) => {
  const defaultAnnotations: Record<string, string> = {
    "kubernetes.io/ingress.class": "alb",
    "alb.ingress.kubernetes.io/scheme": args.albScheme!,
    "alb.ingress.kubernetes.io/healthcheck-path": internalArgs.healthcheckPath,
    "alb.ingress.kubernetes.io/healthcheck-port": internalArgs.healthcheckPort,
    "alb.ingress.kubernetes.io/listen-ports": '[{"HTTP": 80}]',
    // Prevent pulumi erroring if ingress doesn't resolve immediately
    "pulumi.com/skipAwait": String(args.pulumiSkipAwait),
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
    ...args.metadata.annotations,
  }
}

/**
 * Function fills in nested objects in userInputArgs via pass by reference. It
 * does not deep copy the object.
 */
export const fillInAlbIngressArgs = (
  userInputArgs: AlbIngressArgs,
  internalArgs: InternalAlbIngressArgs
): AlbIngressArgs => {
  const filledInArgs: AlbIngressArgs = {
    ...userInputArgs,
    albScheme: userInputArgs.albScheme || "internet-facing",
    pulumiSkipAwait: userInputArgs.pulumiSkipAwait === false ? false : true,
  }

  filledInArgs.metadata.annotations = getAnnotations(filledInArgs, internalArgs)

  return filledInArgs
}

export const getIngressResourceArgs = (
  name: string,
  userInputArgs: AlbIngressArgs,
  internalArgs: InternalAlbIngressArgs
): {
  ingressResourceArgs: k8s.networking.v1.IngressArgs
  filledInArgs: AlbIngressArgs
} => {
  const filledInArgs = fillInAlbIngressArgs(userInputArgs, internalArgs)

  if (filledInArgs.pulumiSkipAwait) {
    pulumi.log.info(`
        ${name}: Pulumi will not wait for the ingress to be ready. This is because
        it has an external dependency on the AWS load balancer controller Helm chart and can't know
        when the controller is ready. Pulumi errors out if the ingress retries to resolve.
        If you want, you can turn this setting of by setting the pulumiSkipAwait param to false.`)
  }

  const paths: k8s.types.input.networking.v1.HTTPIngressPath[] = [
    {
      path: "/*",
      pathType: "Prefix",
      backend: {
        service: internalArgs.ingressServiceBackend,
      },
    },
  ]

  if (shouldEnableHttps(filledInArgs)) {
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

  const ingressResourceArgs: k8s.networking.v1.IngressArgs = {
    metadata: filledInArgs.metadata,
    spec: {
      tls: filledInArgs.tls,
      rules: [
        {
          host: filledInArgs.host,
          http: {
            paths,
          },
        },
      ],
    },
  }

  return { ingressResourceArgs, filledInArgs }
}
