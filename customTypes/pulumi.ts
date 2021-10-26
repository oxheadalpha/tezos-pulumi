import { Input } from "@pulumi/pulumi"

/**
 * Disables Pulumi’s default await logic that waits for a Kubernetes resource to
 * become “ready” before marking the resource as having been created or updated
 * succesfully.
 *
 * https://www.pulumi.com/blog/improving-kubernetes-management-with-pulumis-await-logic/
 *
 * An example of when using the skipAwait logic is necessary is when creating
 * ingresses via the aws load balancer controller. There can be race conditions
 * between pods being ready and the creation of an ingress. K8s will continue to
 * try and resolve the ingress but pulumi will error out of the deployment if
 * the ingress does not resolve right away.
 */
export type PulumiSkipAwait = Input<boolean>
// NEEDS TESTING: There is no direct way to make the ingress dependent on the controller's Helm chart. It is an "external" dependency. Compared
