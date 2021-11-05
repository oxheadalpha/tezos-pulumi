import { Input } from "@pulumi/pulumi"

/**
 * Disables Pulumi’s default await logic that waits for a Kubernetes resource to
 * become “ready” before marking the resource as having been created or updated
 * succesfully.
 *
 * Please see here for more details:
 * https://www.pulumi.com/blog/improving-kubernetes-management-with-pulumis-await-logic/
 *
 * An example of when it is useful to use the `skipAwait` logic is when deploying
 * ingresses and the AWS load balancer controller at the same time. There can be
 * race conditions between the controller pods being ready and the creation of
 * an ingress. K8s will continue to try and resolve the ingress but pulumi will
 * error out of the deployment if the ingress fails to resolve right away.
 *
 * In general you can let pulumi wait for the ingresses on subsequent
 * deployments. Although there may be random circumstances where pulumi will
 * error out. One situation is where pulumi will upgrade the cluster nodes'
 * launch config. This may happen for example, because AWS EKS is updating the
 * k8s Amazon Machine Images (AMI). This causes pods to restart and may result
 * in more race conditions. There isn't an obvious way to control this behavior.
 *
 * For deploying Helm charts, `skipAwait` should not be used if you have resources
 * depending on Outputs from the Chart.
 *
 */
export declare type PulumiSkipAwait = Input<boolean>
